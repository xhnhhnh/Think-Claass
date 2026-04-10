import express, { Request, Response } from 'express';
import db from '../db.js';

const router = express.Router();

// Get dungeon run state
router.get('/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  try {
    let run = db.prepare("SELECT * FROM dungeon_runs WHERE student_id = ? AND status = 'active'").get(studentId) as any;
    
    if (!run) {
      // No active run, fetch stats
      const stats = db.prepare("SELECT MAX(max_floor) as best_floor FROM dungeon_runs WHERE student_id = ?").get(studentId) as any;
      return res.json({ success: true, run: null, best_floor: stats?.best_floor || 0 });
    }
    
    // Parse buffs
    if (run.active_buffs) {
      try { run.active_buffs = JSON.parse(run.active_buffs); } catch(e){ run.active_buffs = []; }
    } else {
      run.active_buffs = [];
    }

    // Generate current floor choices based on seed/floor (pseudo-random for statelessness)
    const choices = generateFloorChoices(run.current_floor);
    
    res.json({ success: true, run, choices });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start new run
router.post('/start/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  try {
    const tx = db.transaction(() => {
      // End any existing active run
      db.prepare("UPDATE dungeon_runs SET status = 'died' WHERE student_id = ? AND status = 'active'").run(studentId);
      
      // Start new run
      const stmt = db.prepare(`
        INSERT INTO dungeon_runs (student_id, current_floor, max_floor, active_buffs, current_hp, max_hp, status)
        VALUES (?, 1, 1, '[]', 100, 100, 'active')
      `);
      const info = stmt.run(studentId);
      return info.lastInsertRowid;
    });
    
    const runId = tx();
    res.json({ success: true, runId });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Process a choice/room
router.post('/choice/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { choiceType, hpCost, rewardType, rewardValue } = req.body;
  
  try {
    const tx = db.transaction(() => {
      const run = db.prepare("SELECT * FROM dungeon_runs WHERE student_id = ? AND status = 'active'").get(studentId) as any;
      if (!run) throw new Error('No active run');

      let newHp = run.current_hp - (hpCost || 0);
      let status = 'active';
      let newFloor = run.current_floor;
      let activeBuffs = run.active_buffs ? JSON.parse(run.active_buffs) : [];

      if (newHp <= 0) {
        status = 'died';
        newHp = 0;
      } else {
        newFloor += 1;
        // Process Rewards
        if (rewardType === 'heal') {
          newHp = Math.min(run.max_hp, newHp + rewardValue);
        } else if (rewardType === 'buff') {
          activeBuffs.push(rewardValue); // rewardValue is buff name/id
        } else if (rewardType === 'points') {
          db.prepare('UPDATE students SET available_points = available_points + ? WHERE id = ?').run(rewardValue, studentId);
          db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
            .run(studentId, 'DUNGEON_REWARD', rewardValue, `Found treasure on floor ${run.current_floor}`);
        }
      }

      db.prepare(`
        UPDATE dungeon_runs 
        SET current_floor = ?, max_floor = ?, current_hp = ?, active_buffs = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newFloor, Math.max(newFloor, run.max_floor), newHp, JSON.stringify(activeBuffs), status, run.id);

      return { status, newHp, newFloor };
    });

    const result = tx();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Abandon run
router.post('/abandon/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  try {
    db.prepare("UPDATE dungeon_runs SET status = 'died' WHERE student_id = ? AND status = 'active'").run(studentId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to generate roguelike choices
function generateFloorChoices(floor: number) {
  const choices = [];
  
  // Every 5th floor is a boss/elite
  if (floor % 5 === 0) {
    choices.push({
      id: 'boss',
      title: '深渊首领',
      description: '强大的怪物拦住了去路。需消耗大量生命值换取史诗级遗物。',
      type: 'combat',
      hpCost: Math.floor(Math.random() * 30) + 40,
      rewardType: 'buff',
      rewardValue: '史诗遗物: 吸血面具'
    });
    return choices;
  }

  // Normal floors have 3 random doors
  const types = ['combat', 'event', 'treasure', 'rest'];
  for (let i = 0; i < 3; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    
    if (type === 'combat') {
      choices.push({
        id: `combat_${i}`,
        title: '怪物房间',
        description: '一群小怪。',
        type: 'combat',
        hpCost: Math.floor(Math.random() * 15) + 5,
        rewardType: 'points',
        rewardValue: Math.floor(Math.random() * 50) + 20
      });
    } else if (type === 'event') {
      choices.push({
        id: `event_${i}`,
        title: '神秘祭坛',
        description: '献祭生命获取随机增益。',
        type: 'event',
        hpCost: 20,
        rewardType: 'buff',
        rewardValue: '神秘恩赐: 攻击力+10%'
      });
    } else if (type === 'treasure') {
      choices.push({
        id: `treasure_${i}`,
        title: '宝箱房间',
        description: '需要消耗一点生命值强行破开陷阱锁。',
        type: 'treasure',
        hpCost: 10,
        rewardType: 'points',
        rewardValue: 100
      });
    } else {
      choices.push({
        id: `rest_${i}`,
        title: '营地',
        description: '安全的休息区，恢复生命值。',
        type: 'rest',
        hpCost: 0,
        rewardType: 'heal',
        rewardValue: 30
      });
    }
  }
  
  return choices;
}

export default router;