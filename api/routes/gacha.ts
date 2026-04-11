import express, { Request, Response } from 'express';
import db from '../db.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../utils/classFeatures.js';

const router = express.Router();

// Get dictionary (Teacher/Student)
router.get('/dictionary', (req: Request, res: Response) => {
  try {
    const pets = db.prepare('SELECT * FROM pet_dictionary').all();
    res.json({ success: true, pets });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Teacher create dictionary entry
router.post('/dictionary', (req: Request, res: Response) => {
  const { name, element, rarity, base_power, description } = req.body;
  if (!name || !element || !rarity || !base_power) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }
  try {
    const stmt = db.prepare('INSERT INTO pet_dictionary (name, element, rarity, base_power, description) VALUES (?, ?, ?, ?, ?)');
    stmt.run(name, element, rarity, base_power, description || '');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get gacha pools for class
router.get('/pools/:classId', (req: Request, res: Response) => {
  const { classId } = req.params;
  try {
    assertClassFeatureEnabled(Number(classId), 'enable_gacha');
    // Auto-create a default pool if none exists
    const existing = db.prepare('SELECT * FROM gacha_pools WHERE class_id = ?').all(classId);
    if (existing.length === 0) {
      db.prepare(`
        INSERT INTO gacha_pools (class_id, name, cost_points, ssr_rate, sr_rate, r_rate, n_rate)
        VALUES (?, '限定召唤: 星空之约', 100, 0.01, 0.1, 0.3, 0.59)
      `).run(classId);
    }
    const pools = db.prepare('SELECT * FROM gacha_pools WHERE class_id = ? AND is_active = 1').all(classId);
    res.json({ success: true, pools });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Student perform Gacha Draw (1x or 10x)
router.post('/draw/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { poolId, times } = req.body; // times = 1 or 10
  
  if (!poolId || !times) return res.status(400).json({ success: false, message: 'Invalid request' });

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_gacha');
    const tx = db.transaction(() => {
      const student = db.prepare('SELECT available_points FROM students WHERE id = ?').get(studentId) as any;
      const pool = db.prepare('SELECT * FROM gacha_pools WHERE id = ?').get(poolId) as any;
      
      if (!student || !pool) throw new Error('Not found');
      
      const totalCost = pool.cost_points * times;
      if (student.available_points < totalCost) throw new Error('Insufficient points');

      // Deduct points
      db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?').run(totalCost, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'GACHA_PULL', -totalCost, `Performed ${times}x Gacha Pull from ${pool.name}`);

      // Perform RNG logic
      const results = [];
      const insertPet = db.prepare('INSERT INTO student_pets (student_id, pet_dict_id) VALUES (?, ?)');
      
      for (let i = 0; i < times; i++) {
        const rand = Math.random();
        let rarityRolled = 'N';
        
        if (rand < pool.ssr_rate) rarityRolled = 'SSR';
        else if (rand < pool.ssr_rate + pool.sr_rate) rarityRolled = 'SR';
        else if (rand < pool.ssr_rate + pool.sr_rate + pool.r_rate) rarityRolled = 'R';

        // Select random pet from dictionary matching the rarity
        const possiblePets = db.prepare('SELECT id, name, rarity, element FROM pet_dictionary WHERE rarity = ?').all(rarityRolled) as any[];
        
        if (possiblePets.length > 0) {
          const wonPet = possiblePets[Math.floor(Math.random() * possiblePets.length)];
          insertPet.run(studentId, wonPet.id);
          results.push(wonPet);
        } else {
          // Fallback if dictionary is empty for that rarity
          results.push({ id: 0, name: '星尘碎片 (未找到图鉴)', rarity: rarityRolled, element: 'neutral' });
        }
      }

      return results;
    });

    const results = tx();
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get student's collected pets
router.get('/collection/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_gacha');
    const collection = db.prepare(`
      SELECT sp.id as instance_id, sp.level, sp.experience, sp.is_active,
             pd.* 
      FROM student_pets sp
      JOIN pet_dictionary pd ON sp.pet_dict_id = pd.id
      WHERE sp.student_id = ?
      ORDER BY 
        CASE pd.rarity 
          WHEN 'SSR' THEN 1 
          WHEN 'SR' THEN 2 
          WHEN 'R' THEN 3 
          ELSE 4 
        END, 
        sp.level DESC
    `).all(studentId);
    
    res.json({ success: true, collection });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Set active pet
router.put('/active/:studentId/:instanceId', (req: Request, res: Response) => {
  const { studentId, instanceId } = req.params;
  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_gacha');
    db.prepare('UPDATE student_pets SET is_active = 0 WHERE student_id = ?').run(studentId);
    db.prepare('UPDATE student_pets SET is_active = 1 WHERE student_id = ? AND id = ?').run(studentId, instanceId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
