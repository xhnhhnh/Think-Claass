import express, { Request, Response } from 'express';
import db from '../db.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../utils/classFeatures.js';

const router = express.Router();

// ========================
// SHARED ENDPOINTS
// ========================

// Get map state for a class
router.get('/map/:classId', (req: Request, res: Response) => {
  const { classId } = req.params;
  try {
    assertClassFeatureEnabled(Number(classId), 'enable_slg');
    const territories = db.prepare('SELECT * FROM territories WHERE class_id = ?').all(classId);
    
    // Ensure class_resources exists
    db.prepare('INSERT OR IGNORE INTO class_resources (class_id) VALUES (?)').run(classId);
    const resources = db.prepare('SELECT * FROM class_resources WHERE class_id = ?').get(classId);
    
    res.json({ success: true, territories, resources });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================
// STUDENT ENDPOINTS
// ========================

// Contribute to a territory
router.post('/student/:studentId/contribute/:territoryId', (req: Request, res: Response) => {
  const { studentId, territoryId } = req.params;
  const { amount } = req.body;
  
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_slg');
    const tx = db.transaction(() => {
      const student = db.prepare('SELECT available_points FROM students WHERE id = ?').get(studentId) as any;
      if (!student || student.available_points < amount) throw new Error('Insufficient points');

      const territory = db.prepare('SELECT * FROM territories WHERE id = ?').get(territoryId) as any;
      if (!territory) throw new Error('Territory not found');
      if (territory.status === 'owned') throw new Error('Territory already owned');

      // Deduct points
      db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?').run(amount, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'SLG_CONTRIBUTE', -amount, `Contributed to territory: ${territory.name}`);

      // Add to territory
      const newContrib = territory.current_contribution + amount;
      if (newContrib >= territory.cost_to_unlock) {
        db.prepare('UPDATE territories SET current_contribution = ?, status = ? WHERE id = ?')
          .run(territory.cost_to_unlock, 'owned', territoryId);
      } else {
        db.prepare('UPDATE territories SET current_contribution = ?, status = ? WHERE id = ?')
          .run(newContrib, 'unlocking', territoryId);
      }
    });

    tx();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================
// TEACHER ENDPOINTS
// ========================

// Create/Update territory
router.post('/teacher', (req: Request, res: Response) => {
  const { class_id, name, type, cost_to_unlock, x_pos, y_pos } = req.body;
  if (!class_id || !name || !type) return res.status(400).json({ success: false, message: 'Missing fields' });

  try {
    assertClassFeatureEnabled(Number(class_id), 'enable_slg');
    db.prepare(`
      INSERT INTO territories (class_id, name, type, cost_to_unlock, x_pos, y_pos)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(class_id, name, type, cost_to_unlock || 1000, x_pos || 0, y_pos || 0);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Simulate Resource Yields (Teacher triggers this or it runs on a cron)
router.post('/teacher/yield/:classId', (req: Request, res: Response) => {
  const { classId } = req.params;
  try {
    assertClassFeatureEnabled(Number(classId), 'enable_slg');
    const tx = db.transaction(() => {
      const owned = db.prepare("SELECT type, level FROM territories WHERE class_id = ? AND status = 'owned'").all(classId);
      let wood = 0, stone = 0, magic = 0, gold = 0;
      
      for (const t of owned as any[]) {
        if (t.type === 'forest') wood += t.level * 10;
        if (t.type === 'mine') stone += t.level * 10;
        if (t.type === 'magic_spring') magic += t.level * 5;
        if (t.type === 'city') gold += t.level * 20;
      }

      if (wood || stone || magic || gold) {
        db.prepare(`
          UPDATE class_resources 
          SET wood = wood + ?, stone = stone + ?, magic_dust = magic_dust + ?, gold = gold + ?
          WHERE class_id = ?
        `).run(wood, stone, magic, gold, classId);
      }
    });

    tx();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
