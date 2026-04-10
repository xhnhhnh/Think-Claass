import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';

const router = Router();

// Get certificates (can filter by studentId)
router.get('/', (req: Request, res: Response) => {
  const { studentId } = req.query;

  try {
    let query = 'SELECT c.*, s.name as student_name FROM certificates c JOIN students s ON c.student_id = s.id';
    const params: any[] = [];

    if (studentId) {
      query += ' WHERE c.student_id = ?';
      params.push(studentId);
    }

    query += ' ORDER BY c.created_at DESC';

    const certificates = db.prepare(query).all(...params).map((c: any) => ({
      ...c,
      student_name: decrypt(c.student_name)
    }));
    res.json({ success: true, certificates });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a certificate
router.post('/', (req: Request, res: Response) => {
  const { student_id, title, description } = req.body;

  if (!student_id || !title) {
    res.status(400).json({ success: false, message: 'student_id and title are required' });
    return;
  }

  try {
    const stmt = db.prepare('INSERT INTO certificates (student_id, title, description) VALUES (?, ?, ?)');
    const info = stmt.run(student_id, title, description || '');
    
    res.json({ 
      success: true, 
      certificate: { 
        id: info.lastInsertRowid, 
        student_id, 
        title, 
        description 
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
