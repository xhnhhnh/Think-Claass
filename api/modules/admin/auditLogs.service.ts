import { Injectable } from '@nestjs/common';

import db from '../../db.js';

@Injectable()
export class AuditLogsService {
  listLogs(queryInput: Record<string, any>) {
    const { teacher_id, user_id, action, limit = 100, offset = 0 } = queryInput ?? {};
    let query = 'SELECT * FROM operation_logs WHERE 1=1';
    const params: any[] = [];

    if (teacher_id) {
      query += ' AND teacher_id = ?';
      params.push(teacher_id);
    }
    if (user_id) {
      query += ' AND user_id = ?';
      params.push(user_id);
    }
    if (action) {
      query += ' AND action = ?';
      params.push(action);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const logs = db.prepare(query).all(...params);

    let countQuery = 'SELECT COUNT(*) as count FROM operation_logs WHERE 1=1';
    const countParams: any[] = [];
    if (teacher_id) {
      countQuery += ' AND teacher_id = ?';
      countParams.push(teacher_id);
    }
    if (user_id) {
      countQuery += ' AND user_id = ?';
      countParams.push(user_id);
    }
    if (action) {
      countQuery += ' AND action = ?';
      countParams.push(action);
    }

    const { count } = db.prepare(countQuery).get(...countParams) as { count: number };
    return { data: logs, total: count };
  }
}
