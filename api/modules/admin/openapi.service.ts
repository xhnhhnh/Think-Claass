import crypto from 'crypto';
import { Injectable } from '@nestjs/common';

import db from '../../db.js';
import { ApiError } from '../../utils/apiError.js';

@Injectable()
export class OpenApiService {
  listKeys() {
    return db.prepare('SELECT id, name, key, created_at, last_used_at, is_active FROM api_keys ORDER BY created_at DESC').all();
  }

  createKey(input: Record<string, any>) {
    const { name } = input ?? {};
    if (!name) throw new ApiError(400, '名称为必填项');

    const key = `sk_${crypto.randomBytes(24).toString('hex')}`;
    const info = db.prepare('INSERT INTO api_keys (name, key) VALUES (?, ?)').run(name, key);
    return db.prepare('SELECT id, name, key, created_at, last_used_at, is_active FROM api_keys WHERE id = ?').get(info.lastInsertRowid);
  }

  deleteKey(id: string) {
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  }

  listSchools() {
    return db.prepare('SELECT * FROM schools ORDER BY created_at DESC').all();
  }

  createSchool(input: Record<string, any>) {
    const { name, description, contact_info } = input ?? {};
    if (!name) throw new ApiError(400, '校园名称为必填项');

    const info = db.prepare('INSERT INTO schools (name, description, contact_info) VALUES (?, ?, ?)').run(name, description || '', contact_info || '');
    return db.prepare('SELECT * FROM schools WHERE id = ?').get(info.lastInsertRowid);
  }

  updateSchool(id: string, input: Record<string, any>) {
    const { name, description, contact_info } = input ?? {};
    if (!name) throw new ApiError(400, '校园名称为必填项');

    db.prepare('UPDATE schools SET name = ?, description = ?, contact_info = ? WHERE id = ?').run(name, description || '', contact_info || '', id);
    return db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
  }

  deleteSchool(id: string) {
    db.prepare('DELETE FROM schools WHERE id = ?').run(id);
  }
}
