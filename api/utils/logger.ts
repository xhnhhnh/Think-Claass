import db from '../db.js';

export function logOperation(teacherId: number, action: string, details: string = '', ipAddress: string = '') {
  try {
    const stmt = db.prepare('INSERT INTO operation_logs (teacher_id, action, details, ip_address) VALUES (?, ?, ?, ?)');
    stmt.run(teacherId, action, details, ipAddress);
  } catch (error) {
    console.error('Failed to log operation:', error);
  }
}
