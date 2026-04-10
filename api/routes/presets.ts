import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// Get all presets for a teacher
router.get('/', (req: Request, res: Response) => {
  const { teacherId } = req.query;
  try {
    let presets;
    if (teacherId) {
      presets = db.prepare('SELECT * FROM point_presets WHERE teacher_id = ? ORDER BY id ASC').all(teacherId);
    } else {
      presets = db.prepare('SELECT * FROM point_presets ORDER BY id ASC').all();
    }
    res.json({ success: true, presets });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a new preset
router.post('/', (req: Request, res: Response) => {
  const { label, amount, teacher_id } = req.body;
  if (!label || amount === undefined) {
    return res.status(400).json({ success: false, message: 'Label and amount are required' });
  }

  try {
    let tId = teacher_id;
    if (!tId) {
      // We assume teacherId is 1 for now or fetch the default teacher
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as any;
      tId = teacher ? teacher.id : 1;
    }

    const info = db.prepare('INSERT INTO point_presets (label, amount, teacher_id) VALUES (?, ?, ?)').run(label, amount, tId);
    
    const newPreset = db.prepare('SELECT * FROM point_presets WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, preset: newPreset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete a preset
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM point_presets WHERE id = ?').run(id);
    res.json({ success: true, message: 'Preset deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;