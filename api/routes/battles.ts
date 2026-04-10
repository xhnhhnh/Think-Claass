import express, { Request, Response } from 'express';
import db from '../db.js';

const router = express.Router();

// ========================
// TEACHER ENDPOINTS
// ========================

// Get all battles for a class
router.get('/teacher/:classId', (req: Request, res: Response) => {
  const { classId } = req.params;
  try {
    const battles = db.prepare(`
      SELECT cb.*, 
             c1.name as initiator_class_name,
             c2.name as target_class_name
      FROM class_battles cb
      JOIN classes c1 ON cb.initiator_class_id = c1.id
      JOIN classes c2 ON cb.target_class_id = c2.id
      WHERE cb.initiator_class_id = ? OR cb.target_class_id = ?
      ORDER BY cb.id DESC
    `).all(classId, classId);
    
    res.json({ success: true, battles });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initiate a battle
router.post('/teacher/initiate', (req: Request, res: Response) => {
  const { initiator_class_id, target_class_id } = req.body;
  if (!initiator_class_id || !target_class_id) {
    return res.status(400).json({ success: false, message: 'Missing class IDs' });
  }

  try {
    // Check if there is already an active battle
    const existing = db.prepare(`
      SELECT * FROM class_battles 
      WHERE status IN ('pending', 'active') 
      AND (initiator_class_id = ? OR target_class_id = ?)
    `).get(initiator_class_id, initiator_class_id);

    if (existing) {
      return res.status(400).json({ success: false, message: 'Class is already in a battle' });
    }

    const stmt = db.prepare(`
      INSERT INTO class_battles (initiator_class_id, target_class_id, status)
      VALUES (?, ?, 'pending')
    `);
    const info = stmt.run(initiator_class_id, target_class_id);
    
    res.json({ success: true, battleId: info.lastInsertRowid });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Accept a battle
router.put('/teacher/accept/:battleId', (req: Request, res: Response) => {
  const { battleId } = req.params;
  try {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 15 * 60000); // 15 mins default
    
    db.prepare(`
      UPDATE class_battles 
      SET status = 'active', start_time = ?, end_time = ? 
      WHERE id = ? AND status = 'pending'
    `).run(startTime.toISOString(), endTime.toISOString(), battleId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reject a battle
router.put('/teacher/reject/:battleId', (req: Request, res: Response) => {
  const { battleId } = req.params;
  try {
    db.prepare(`
      UPDATE class_battles 
      SET status = 'rejected' 
      WHERE id = ? AND status = 'pending'
    `).run(battleId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// End a battle manually
router.put('/teacher/end/:battleId', (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { winner_class_id } = req.body;
  try {
    db.prepare(`
      UPDATE class_battles 
      SET status = 'ended', winner_class_id = ? 
      WHERE id = ? AND status = 'active'
    `).run(winner_class_id || null, battleId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get battle stats
router.get('/stats/:battleId', (req: Request, res: Response) => {
  const { battleId } = req.params;
  try {
    const battle = db.prepare(`
      SELECT cb.*, 
             c1.name as initiator_class_name,
             c2.name as target_class_name
      FROM class_battles cb
      JOIN classes c1 ON cb.initiator_class_id = c1.id
      JOIN classes c2 ON cb.target_class_id = c2.id
      WHERE cb.id = ?
    `).get(battleId) as any;

    if (!battle) return res.status(404).json({ success: false, message: 'Battle not found' });

    // Calculate score for initiator
    // Here we use challenge_records total score added after start_time as an example proxy for battle power
    let initiatorScore = 0;
    let targetScore = 0;

    if (battle.start_time) {
      const recordsInitiator = db.prepare(`
        SELECT SUM(amount) as total FROM records 
        JOIN students s ON records.student_id = s.id 
        WHERE s.class_id = ? AND records.created_at >= ? AND type = 'ADD_POINTS'
      `).get(battle.initiator_class_id, battle.start_time) as any;

      const recordsTarget = db.prepare(`
        SELECT SUM(amount) as total FROM records 
        JOIN students s ON records.student_id = s.id 
        WHERE s.class_id = ? AND records.created_at >= ? AND type = 'ADD_POINTS'
      `).get(battle.target_class_id, battle.start_time) as any;

      initiatorScore = recordsInitiator?.total || 0;
      targetScore = recordsTarget?.total || 0;
    }

    res.json({
      success: true,
      battle,
      initiatorScore,
      targetScore
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Search all classes to challenge
router.get('/classes/search', (req: Request, res: Response) => {
  const { q, excludeClassId } = req.query;
  try {
    let classes;
    if (q) {
      classes = db.prepare(`
        SELECT id, name FROM classes 
        WHERE name LIKE ? AND id != ?
      `).all(`%${q}%`, excludeClassId || 0);
    } else {
      classes = db.prepare(`
        SELECT id, name FROM classes 
        WHERE id != ? LIMIT 10
      `).all(excludeClassId || 0);
    }
    
    res.json({ success: true, classes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;