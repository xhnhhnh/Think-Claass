import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';

const router = Router();

// Get all praises for a class
router.get('/', (req: Request, res: Response) => {
  const { classId } = req.query;
  if (!classId) {
    return res.status(400).json({ success: false, message: 'classId is required' });
  }

  try {
    const praises = db.prepare(`
      SELECT p.*, s.name as student_name 
      FROM praises p
      JOIN students s ON p.student_id = s.id
      WHERE s.class_id = ?
      ORDER BY p.created_at DESC
    `).all(classId) as any[];
    
    const decryptedPraises = praises.map(p => ({
      ...p,
      student_name: decrypt(p.student_name)
    }));

    res.json({ success: true, praises: decryptedPraises });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get praises for a specific student
router.get('/student/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const praises = db.prepare(`
      SELECT p.*, s.name as student_name 
      FROM praises p
      JOIN students s ON p.student_id = s.id
      WHERE p.student_id = ?
      ORDER BY p.created_at DESC
    `).all(id) as any[];
    
    const decryptedPraises = praises.map(p => ({
      ...p,
      student_name: decrypt(p.student_name)
    }));

    res.json({ success: true, praises: decryptedPraises });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a new praise (Teacher only)
router.post('/', (req: Request, res: Response) => {
  const { teacher_id, student_id, content, color } = req.body;
  if (!teacher_id || !student_id || !content) {
    return res.status(400).json({ success: false, message: 'teacher_id, student_id, and content are required' });
  }

  try {
    const transaction = db.transaction(() => {
      // 1. Insert praise
      const info = db.prepare('INSERT INTO praises (teacher_id, student_id, content, color) VALUES (?, ?, ?, ?)')
        .run(teacher_id, student_id, content, color || 'bg-yellow-100');
      
      const newPraise = db.prepare('SELECT * FROM praises WHERE id = ?').get(info.lastInsertRowid);

      // 2. Give student +20 experience automatically
      const pet = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(student_id) as any;
      if (pet) {
        const expGain = 20;
        let newExp = pet.experience + expGain;
        let newLevel = pet.level;
        let newAttack = Math.floor(newExp * 0.1) || 10;
        const calculatedLevel = Math.floor(newExp / 100) + 1;
        if (calculatedLevel > newLevel && calculatedLevel <= 6) {
          newLevel = calculatedLevel;
        }
        
        // 3. Set pet mood to excited
        db.prepare('UPDATE pets SET experience = ?, level = ?, attack_power = ?, mood = ? WHERE id = ?')
          .run(newExp, newLevel, newAttack, 'excited', pet.id);
      }

      return newPraise;
    });

    const newPraise = transaction();
    res.json({ success: true, praise: newPraise });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete a praise
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM praises WHERE id = ?').run(id);
    res.json({ success: true, message: 'Praise deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;