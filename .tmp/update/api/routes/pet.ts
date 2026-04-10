import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';

const router = Router();

const checkIsDead = (studentId: number) => {
  const pet = db.prepare('SELECT last_fed_at FROM pets WHERE student_id = ?').get(studentId) as any;
  if (!pet || !pet.last_fed_at) return false;
  const lastTime = new Date(pet.last_fed_at + 'Z').getTime(); // CURRENT_TIMESTAMP is UTC
  const now = Date.now();
  return (now - lastTime) > 3 * 24 * 60 * 60 * 1000;
};

// Fetch classmates' pets for battle
router.get('/classmates/:studentId', (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  try {
    const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId) as any;
    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    const classmatesPets = db.prepare(`
      SELECT p.*, s.name as student_name 
      FROM pets p
      JOIN students s ON p.student_id = s.id
      WHERE s.class_id = ? AND s.id != ?
    `).all(student.class_id, studentId).map((p: any) => ({
      ...p,
      student_name: decrypt(p.student_name),
      is_dead: checkIsDead(p.student_id)
    }));

    res.json({ success: true, classmatesPets });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Battle endpoint
router.post('/battle', (req: Request, res: Response) => {
  const { studentId, opponentId } = req.body;
  try {
    if (checkIsDead(studentId)) {
      res.status(400).json({ success: false, message: '宠物已饿死，请先努力赚取积分复活它！' });
      return;
    }
    if (checkIsDead(opponentId)) {
      res.status(400).json({ success: false, message: '对方的宠物已饿死，无法对战！' });
      return;
    }

    const myPet = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(studentId) as any;
    const opponentPet = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(opponentId) as any;

    if (!myPet || !opponentPet) {
      res.status(404).json({ success: false, message: 'Pet not found' });
      return;
    }

    // Battle logic: base power + dice roll (1-20)
    const myRoll = Math.floor(Math.random() * 20) + 1;
    const opponentRoll = Math.floor(Math.random() * 20) + 1;

    const myTotalPower = (myPet.attack_power || 10) + myRoll;
    const opponentTotalPower = (opponentPet.attack_power || 10) + opponentRoll;

    const isWin = myTotalPower > opponentTotalPower;
    const isDraw = myTotalPower === opponentTotalPower;

    // Optional: give 10 exp to winner's pet
    if (isWin) {
      db.prepare('UPDATE pets SET experience = experience + 10 WHERE id = ?').run(myPet.id);
    } else if (!isDraw) {
      db.prepare('UPDATE pets SET experience = experience + 10 WHERE id = ?').run(opponentPet.id);
    }

    res.json({
      success: true,
      result: {
        isWin,
        isDraw,
        myRoll,
        opponentRoll,
        myTotalPower,
        opponentTotalPower
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get pet for a student
router.get('/:studentId', (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  try {
    const pet = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(studentId) as any;
    let has_parent_buff = false;
    
    if (pet) {
      pet.is_dead = checkIsDead(studentId);
      
      const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId) as any;
      if (student) {
        const cls = db.prepare('SELECT enable_parent_buff FROM classes WHERE id = ?').get(student.class_id) as any;
        if (cls && cls.enable_parent_buff === 1) {
          const parentActivity = db.prepare(`
            SELECT 1 FROM parent_activity 
            WHERE student_id = ? AND last_active_date = DATE('now')
            LIMIT 1
          `).get(studentId);
          if (parentActivity) {
            has_parent_buff = true;
          }
        }
      }
    }
    res.json({ success: true, pet, has_parent_buff });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Adopt a pet
router.post('/adopt', (req: Request, res: Response) => {
  const { 
    studentId, 
    elementType, 
    customImage,
    image_stage1,
    image_stage2,
    image_stage3,
    image_stage4,
    image_stage5,
    image_stage6
  } = req.body;
  try {
    const existing = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(studentId);
    if (existing) {
      res.status(400).json({ success: false, message: 'Pet already adopted' });
      return;
    }
    
    const insert = db.prepare(`
      INSERT INTO pets (
        student_id, element_type, custom_image,
        image_stage1, image_stage2, image_stage3,
        image_stage4, image_stage5, image_stage6
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(
      studentId, 
      elementType, 
      customImage || null,
      image_stage1 || null,
      image_stage2 || null,
      image_stage3 || null,
      image_stage4 || null,
      image_stage5 || null,
      image_stage6 || null
    );
    
    res.json({ success: true, petId: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Feed/Play with pet (Consume points for experience)
router.post('/interact', (req: Request, res: Response) => {
  const { studentId, actionType, cost, expGain, type } = req.body;
  const recordType = type || 'FEED_PET';
  
  try {
    if (checkIsDead(studentId)) {
      res.status(400).json({ success: false, message: '宠物已饿死，请先努力赚取积分复活它！' });
      return;
    }

    const transaction = db.transaction(() => {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
      if (!student || student.available_points < cost) {
        throw new Error('Not enough points');
      }

      const pet = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(studentId) as any;
      if (!pet) throw new Error('Pet not found');

      // Deduct points
      const newPoints = student.available_points - cost;
      db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(newPoints, studentId);
      
      // Log record
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, recordType, -cost, `Consumed for ${actionType}`);

      // Add experience and check level up
      let newExp = pet.experience + expGain;
      let newLevel = pet.level;
      
      // user requirement: Attack power is total experience * 0.1 rounded down
      let newAttack = Math.floor(newExp * 0.1) || 10;
      
      // Simple level up logic: level = floor(exp / 100) + 1
      const calculatedLevel = Math.floor(newExp / 100) + 1;
      if (calculatedLevel > newLevel && calculatedLevel <= 6) {
        newLevel = calculatedLevel;
      }

      db.prepare('UPDATE pets SET experience = ?, level = ?, attack_power = ?, last_fed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newExp, newLevel, newAttack, pet.id);

      return {
        points: newPoints,
        pet: { ...pet, experience: newExp, level: newLevel, attack_power: newAttack, is_dead: false }
      };
    });

    const result = transaction();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update or Assign a pet by teacher
router.put('/:studentId', (req: Request, res: Response) => {
  const studentId = Number(req.params.studentId);
  const { 
    elementType, 
    customImage,
    image_stage1,
    image_stage2,
    image_stage3,
    image_stage4,
    image_stage5,
    image_stage6
  } = req.body;
  
  try {
    const existing = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(studentId);
    
    if (existing) {
      // Update existing pet
      db.prepare(`
        UPDATE pets SET 
          element_type = COALESCE(?, element_type),
          custom_image = ?,
          image_stage1 = ?,
          image_stage2 = ?,
          image_stage3 = ?,
          image_stage4 = ?,
          image_stage5 = ?,
          image_stage6 = ?
        WHERE student_id = ?
      `).run(
        elementType !== undefined ? elementType : null,
        customImage !== undefined ? customImage : null,
        image_stage1 !== undefined ? image_stage1 : null,
        image_stage2 !== undefined ? image_stage2 : null,
        image_stage3 !== undefined ? image_stage3 : null,
        image_stage4 !== undefined ? image_stage4 : null,
        image_stage5 !== undefined ? image_stage5 : null,
        image_stage6 !== undefined ? image_stage6 : null,
        studentId
      );
    } else {
      // Assign new pet
      db.prepare(`
        INSERT INTO pets (
          student_id, element_type, custom_image,
          image_stage1, image_stage2, image_stage3,
          image_stage4, image_stage5, image_stage6
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        studentId, 
        elementType || 'normal', 
        customImage || null,
        image_stage1 || null,
        image_stage2 || null,
        image_stage3 || null,
        image_stage4 || null,
        image_stage5 || null,
        image_stage6 || null
      );
    }
    
    res.json({ success: true, message: 'Pet updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get pet leaderboard for a class
router.get('/leaderboard/:classId', (req: Request, res: Response) => {
  const classId = Number(req.params.classId);
  try {
    const leaderboard = db.prepare(`
      SELECT p.*, s.name as student_name
      FROM pets p
      JOIN students s ON p.student_id = s.id
      WHERE s.class_id = ?
      ORDER BY p.level DESC, p.experience DESC
      LIMIT 10
    `).all(classId) as any[];

    const decryptedLeaderboard = leaderboard.map(p => ({
      ...p,
      student_name: decrypt(p.student_name),
      is_dead: checkIsDead(p.student_id)
    }));

    res.json({ success: true, leaderboard: decryptedLeaderboard });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
