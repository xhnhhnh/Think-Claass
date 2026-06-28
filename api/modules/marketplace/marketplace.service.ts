import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import db from '../../db.js';
import { assertActorFeatureEnabled, assertStudentFeatureEnabled } from '../../services/featureService.js';
import { addStudentPoints, spendStudentPoints } from '../../services/pointsService.js';
import { getStudentOrThrow } from '../../services/studentService.js';
import { ApiError } from '../../utils/apiError.js';
import { getRequestActor } from '../../utils/requestAuth.js';

function ensureValidShopItemInput(input: { name?: unknown; price?: unknown; stock?: unknown }) {
  if (!input.name || typeof input.price !== 'number' || input.price < 0 || typeof input.stock !== 'number' || input.stock < -1) {
    throw new ApiError(400, 'Invalid input');
  }
}

@Injectable()
export class MarketplaceService {
  listItems(req: Request, query: Record<string, any>) {
    const { studentId } = query ?? {};
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_shop');
    }

    return studentId
      ? db
          .prepare(
            `
          SELECT si.*
          FROM shop_items si
          JOIN classes c ON si.teacher_id = c.teacher_id
          JOIN students s ON s.class_id = c.id
          WHERE s.id = ? AND (si.stock > 0 OR si.stock = -1) AND si.is_active = 1
        `,
          )
          .all(studentId)
      : db.prepare('SELECT * FROM shop_items WHERE (stock > 0 OR stock = -1) AND is_active = 1').all();
  }

  listAllItems(query: Record<string, any>) {
    const { teacherId } = query ?? {};
    return teacherId
      ? db.prepare('SELECT * FROM shop_items WHERE teacher_id = ? ORDER BY id DESC').all(teacherId)
      : db.prepare('SELECT * FROM shop_items ORDER BY id DESC').all();
  }

  createItem(input: Record<string, any>) {
    const { name, description, price, stock, is_active, teacher_id, is_holiday_limited, holiday_start_time, holiday_end_time } = input ?? {};
    ensureValidShopItemInput({ name, price, stock });

    let teacherId = teacher_id;
    if (!teacherId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as { id: number } | undefined;
      teacherId = teacher?.id ?? 1;
    }

    const info = db
      .prepare(
        'INSERT INTO shop_items (name, description, price, stock, is_active, teacher_id, is_holiday_limited, holiday_start_time, holiday_end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(name, description, price, stock ?? 999, is_active ?? 1, teacherId, is_holiday_limited ? 1 : 0, holiday_start_time || null, holiday_end_time || null);

    return { id: info.lastInsertRowid };
  }

  updateItemStatus(id: string, input: Record<string, any>) {
    db.prepare('UPDATE shop_items SET is_active = ? WHERE id = ?').run(input?.is_active ? 1 : 0, id);
  }

  updateItem(id: string, input: Record<string, any>) {
    const { name, description, price, stock, is_holiday_limited, holiday_start_time, holiday_end_time } = input ?? {};
    db.prepare('UPDATE shop_items SET name = ?, description = ?, price = ?, stock = ?, is_holiday_limited = ?, holiday_start_time = ?, holiday_end_time = ? WHERE id = ?')
      .run(name, description, price, stock, is_holiday_limited ? 1 : 0, holiday_start_time || null, holiday_end_time || null, id);
  }

  buyItem(input: Record<string, any>) {
    const { studentId, itemId } = input ?? {};
    assertStudentFeatureEnabled(Number(studentId), 'enable_shop');

    const transaction = db.transaction(() => {
      const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(itemId) as any;
      if (!item || (item.stock <= 0 && item.stock !== -1)) throw new ApiError(400, 'Item out of stock');
      if (item.is_active !== 1) throw new ApiError(400, 'Item is not active');

      if (item.is_holiday_limited === 1) {
        const now = new Date().toISOString();
        if (item.holiday_start_time && now < item.holiday_start_time) {
          throw new ApiError(400, 'This item is not yet available for purchase');
        }
        if (item.holiday_end_time && now > item.holiday_end_time) {
          throw new ApiError(400, 'This item is no longer available for purchase');
        }
      }

      const points = spendStudentPoints(studentId, item.price, 'BUY_ITEM', `Bought item: ${item.name}`);

      if (item.stock !== -1) {
        db.prepare('UPDATE shop_items SET stock = stock - 1 WHERE id = ?').run(itemId);
      }

      const code = `RED-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      db.prepare('INSERT INTO redemption_tickets (student_id, item_id, code, status) VALUES (?, ?, ?, ?)').run(studentId, itemId, code, 'pending');

      return { points: points.available_points };
    });

    return transaction();
  }

  listAuctions(req: Request) {
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_auction_blind_box');
    }

    return db.prepare('SELECT * FROM auctions ORDER BY id DESC').all();
  }

  bidAuction(id: string, input: Record<string, any>) {
    const { studentId, bid_amount } = input ?? {};
    assertStudentFeatureEnabled(Number(studentId), 'enable_auction_blind_box');

    const transaction = db.transaction(() => {
      const student = getStudentOrThrow(studentId);
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(id) as any;
      if (!auction) throw new ApiError(404, 'Auction not found');
      if (auction.status !== 'active') throw new ApiError(400, 'Auction is not active');
      if (auction.end_time && new Date(auction.end_time) < new Date()) throw new ApiError(400, 'Auction has ended');

      const currentPrice = auction.current_price || auction.starting_price;
      if (bid_amount <= currentPrice) throw new ApiError(400, `Bid amount must be greater than current price: ${currentPrice}`);
      if (student.available_points < bid_amount) throw new ApiError(400, 'Not enough points');

      if (auction.highest_bidder_id && auction.highest_bidder_id !== student.id) {
        const prevBidder = db.prepare('SELECT available_points FROM students WHERE id = ?').get(auction.highest_bidder_id);
        if (prevBidder) {
          db.prepare('UPDATE students SET available_points = available_points + ? WHERE id = ?').run(currentPrice, auction.highest_bidder_id);
          db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(
            auction.highest_bidder_id,
            'AUCTION_REFUND',
            currentPrice,
            `Refund for outbid on auction: ${auction.item_name}`,
          );
        }
      }

      const points = spendStudentPoints(student.id, bid_amount, 'AUCTION_BID', `Placed bid on auction: ${auction.item_name}`);
      db.prepare('UPDATE auctions SET current_price = ?, highest_bidder_id = ? WHERE id = ?').run(bid_amount, student.id, id);

      return { points: points.available_points };
    });

    return transaction();
  }

  buyBlindBox(input: Record<string, any>) {
    const { studentId, boxId, blindBoxId } = input ?? {};
    assertStudentFeatureEnabled(Number(studentId), 'enable_auction_blind_box');

    const transaction = db.transaction(() => {
      let price = 100;
      let boxName = '神秘盲盒';

      const selectedBoxId = boxId ?? blindBoxId;
      if (selectedBoxId) {
        const box = db.prepare('SELECT * FROM blind_boxes WHERE id = ?').get(selectedBoxId) as any;
        if (!box) throw new ApiError(404, 'Blind box not found');
        if (box.is_active !== 1) throw new ApiError(400, 'Blind box is not active');
        price = box.price;
        boxName = box.name;
      }

      const spent = spendStudentPoints(studentId, price, 'BUY_BLIND_BOX', `Bought blind box: ${boxName}`);

      const randomValue = Math.random();
      let reward = '';
      let points = spent.available_points;
      if (randomValue < 0.1) {
        reward = '稀有碎片 x1';
      } else if (randomValue < 0.3) {
        reward = '普通碎片 x2';
      } else if (randomValue < 0.6) {
        reward = '神秘道具 x1';
      } else {
        reward = '谢谢参与 (获得安慰奖 10积分)';
        points = addStudentPoints(studentId, 10, 'BLIND_BOX_CONSOLATION', 'Blind box consolation prize').available_points;
      }

      return { points, reward };
    });

    return transaction();
  }

  createAuction(input: Record<string, any>) {
    const { item_name, description, starting_price, end_time } = input ?? {};
    const info = db
      .prepare('INSERT INTO auctions (item_name, description, starting_price, current_price, end_time) VALUES (?, ?, ?, ?, ?)')
      .run(item_name, description || '', starting_price || 0, starting_price || 0, end_time || null);
    return { id: info.lastInsertRowid };
  }

  updateAuction(id: string, input: Record<string, any>) {
    const { item_name, description, starting_price, status, end_time } = input ?? {};
    db.prepare('UPDATE auctions SET item_name = ?, description = ?, starting_price = ?, status = ?, end_time = ? WHERE id = ?').run(
      item_name,
      description,
      starting_price,
      status,
      end_time,
      id,
    );
  }

  deleteAuction(id: string) {
    db.prepare('DELETE FROM auctions WHERE id = ?').run(id);
  }

  listBlindBoxes(req: Request) {
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_auction_blind_box');
    }

    return db.prepare('SELECT * FROM blind_boxes ORDER BY id DESC').all();
  }

  createBlindBox(input: Record<string, any>) {
    const { name, description, price, is_active } = input ?? {};
    if (!name || typeof price !== 'number') throw new ApiError(400, 'Invalid input');

    const info = db.prepare('INSERT INTO blind_boxes (name, description, price, is_active) VALUES (?, ?, ?, ?)').run(
      name,
      description || '',
      price,
      is_active === undefined ? 1 : is_active ? 1 : 0,
    );
    return { id: info.lastInsertRowid };
  }

  updateBlindBox(id: string, input: Record<string, any>) {
    const { name, description, price, is_active } = input ?? {};
    db.prepare('UPDATE blind_boxes SET name = ?, description = ?, price = ?, is_active = ? WHERE id = ?').run(
      name,
      description || '',
      price,
      is_active ? 1 : 0,
      id,
    );
  }

  deleteBlindBox(id: string) {
    db.prepare('DELETE FROM blind_boxes WHERE id = ?').run(id);
  }
}
