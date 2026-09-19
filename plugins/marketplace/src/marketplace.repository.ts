/**
 * Marketplace repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection, so every
 * statement is validated against `data.adopted` in the manifest. The four tables carry
 * their legacy names (declared as `adopted`, not `tables`) because `SELECT *` rows are
 * returned straight through to the frontend and `api/modules/admin/admin.repository.ts`
 * still deletes two of them by name in its cascade.
 *
 * `students`, `classes` and `records` are deliberately absent. The pre-migration
 * `listItems` joined `classes`/`students` and the money paths wrote
 * `students.available_points` + `records`; a second writer would make classroom's
 * ownership of those tables a lie, so the service reaches them through
 * `classroom.public` instead. See marketplace.service.ts.
 *
 * The only table this repository touches that it does not own is `users`, which the
 * legacy `createItem` read to default the selling teacher. Auth has no plugin yet, so
 * it stays a declared `data.reads` entry.
 */

import type { Auction, BlindBox, ShopItem } from '@thinkclass/contracts/domains/marketplace';
import type { DbApi } from '@thinkclass/plugin-sdk';

import type { MarketplaceRepository } from './marketplace.types.js';

export function createMarketplaceRepository(db: DbApi): MarketplaceRepository {
  return {
    transaction(fn) {
      // One better-sqlite3 transaction over this plugin's own tables. It cannot span
      // the classroom port (that write is async), which is why the money paths in the
      // service are ordered debit -> platform writes -> ledger; see the service header.
      return db.tx(() => fn());
    },

    // -- shop items ---------------------------------------------------------

    listShopItemsByTeacher(teacherId) {
      // `WHERE teacher_id = NULL` never matches, which is exactly what the legacy
      // `JOIN classes c ON si.teacher_id = c.teacher_id` did for a class with no
      // teacher: no rows, not an error.
      return db.query<ShopItem>(
        `SELECT * FROM shop_items WHERE teacher_id = ? AND (stock > 0 OR stock = -1) AND is_active = 1`,
        [teacherId],
      );
    },

    listActiveShopItems() {
      return db.query<ShopItem>(`SELECT * FROM shop_items WHERE (stock > 0 OR stock = -1) AND is_active = 1`);
    },

    listAllShopItems(teacherId) {
      return teacherId
        ? db.query<ShopItem>(`SELECT * FROM shop_items WHERE teacher_id = ? ORDER BY id DESC`, [teacherId])
        : db.query<ShopItem>(`SELECT * FROM shop_items ORDER BY id DESC`);
    },

    getShopItem(itemId) {
      return db.get<ShopItem>(`SELECT * FROM shop_items WHERE id = ?`, [itemId]) ?? null;
    },

    createShopItem(input) {
      const info = db.run(
        `INSERT INTO shop_items (name, description, price, stock, is_active, teacher_id, is_holiday_limited, holiday_start_time, holiday_end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.name,
          input.description,
          input.price,
          input.stock,
          input.is_active,
          input.teacher_id,
          input.is_holiday_limited,
          input.holiday_start_time,
          input.holiday_end_time,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    updateShopItemStatus(id, isActive) {
      db.run(`UPDATE shop_items SET is_active = ? WHERE id = ?`, [isActive, id]);
    },

    updateShopItem(id, input) {
      db.run(
        `UPDATE shop_items SET name = ?, description = ?, price = ?, stock = ?, is_holiday_limited = ?, holiday_start_time = ?, holiday_end_time = ? WHERE id = ?`,
        [
          input.name,
          input.description,
          input.price,
          input.stock,
          input.is_holiday_limited,
          input.holiday_start_time,
          input.holiday_end_time,
          id,
        ],
      );
    },

    decrementShopItemStock(itemId) {
      db.run(`UPDATE shop_items SET stock = stock - 1 WHERE id = ?`, [itemId]);
    },

    insertRedemptionTicket(studentId, itemId, code) {
      db.run(`INSERT INTO redemption_tickets (student_id, item_id, code, status) VALUES (?, ?, ?, ?)`, [
        studentId,
        itemId,
        code,
        'pending',
      ]);
    },

    findFirstTeacherId() {
      const row = db.get<{ id: number }>(`SELECT id FROM users WHERE role = ? LIMIT 1`, ['teacher']);
      return row?.id ?? null;
    },

    // -- auctions -----------------------------------------------------------

    listAuctions() {
      return db.query<Auction>(`SELECT * FROM auctions ORDER BY id DESC`);
    },

    getAuction(id) {
      return db.get<Auction>(`SELECT * FROM auctions WHERE id = ?`, [id]) ?? null;
    },

    createAuction(input) {
      const info = db.run(
        `INSERT INTO auctions (item_name, description, starting_price, current_price, end_time) VALUES (?, ?, ?, ?, ?)`,
        [input.item_name, input.description, input.starting_price, input.starting_price, input.end_time],
      );
      return Number(info.lastInsertRowid);
    },

    updateAuction(id, input) {
      db.run(
        `UPDATE auctions SET item_name = ?, description = ?, starting_price = ?, status = ?, end_time = ? WHERE id = ?`,
        [input.item_name, input.description, input.starting_price, input.status, input.end_time, id],
      );
    },

    setAuctionLeader(id, currentPrice, bidderId) {
      db.run(`UPDATE auctions SET current_price = ?, highest_bidder_id = ? WHERE id = ?`, [
        currentPrice,
        bidderId,
        id,
      ]);
    },

    deleteAuction(id) {
      db.run(`DELETE FROM auctions WHERE id = ?`, [id]);
    },

    // -- blind boxes --------------------------------------------------------

    listBlindBoxes() {
      return db.query<BlindBox>(`SELECT * FROM blind_boxes ORDER BY id DESC`);
    },

    getBlindBox(id) {
      return db.get<BlindBox>(`SELECT * FROM blind_boxes WHERE id = ?`, [id]) ?? null;
    },

    createBlindBox(input) {
      const info = db.run(`INSERT INTO blind_boxes (name, description, price, is_active) VALUES (?, ?, ?, ?)`, [
        input.name,
        input.description,
        input.price,
        input.is_active,
      ]);
      return Number(info.lastInsertRowid);
    },

    updateBlindBox(id, input) {
      db.run(`UPDATE blind_boxes SET name = ?, description = ?, price = ?, is_active = ? WHERE id = ?`, [
        input.name,
        input.description,
        input.price,
        input.is_active,
        id,
      ]);
    },

    deleteBlindBox(id) {
      db.run(`DELETE FROM blind_boxes WHERE id = ?`, [id]);
    },
  };
}
