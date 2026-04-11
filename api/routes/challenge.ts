import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import {
  assertActorFeatureEnabled,
  assertClassFeatureEnabled,
  assertStudentFeatureEnabled,
} from '../utils/classFeatures.js';
import { getRequestActor } from '../utils/requestAuth.js';

const router = Router();

// GET /api/challenge/questions
router.get('/questions', (req: Request, res: Response) => {
  try {
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_challenge');
    }

    const limit = parseInt(req.query.limit as string) || 10;
    
    // Get random questions from question_bank
    const questions = db.prepare(`
      SELECT id, title, type, options
      FROM question_bank
      ORDER BY RANDOM()
      LIMIT ?
    `).all(limit);

    const formattedQuestions = questions.map((q: any) => {
      let parsedOptions = q.options;
      if (typeof q.options === 'string') {
        try {
          parsedOptions = JSON.parse(q.options);
        } catch (e) {
          parsedOptions = q.options;
        }
      }
      return {
        ...q,
        options: parsedOptions
      };
    });

    res.json({ success: true, questions: formattedQuestions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/challenge/submit
router.post('/submit', (req: Request, res: Response) => {
  const { studentId, answers } = req.body;
  
  if (!studentId || !answers) {
    res.status(400).json({ success: false, message: 'Missing required fields' });
    return;
  }

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_challenge');

    const transaction = db.transaction(() => {
      let correctCount = 0;
      let wrongCount = 0;
      let score = 0;
      const results: any[] = [];

      const answersList = Array.isArray(answers) 
        ? answers 
        : Object.entries(answers).map(([id, answer]) => ({ questionId: parseInt(id), answer }));

      for (const item of answersList) {
        const { questionId, answer } = item;
        const question = db.prepare('SELECT answer, explanation FROM question_bank WHERE id = ?').get(questionId) as any;
        
        if (!question) continue;

        // Compare answer (handle array or string appropriately depending on question type if needed, but standardizing to string match is common)
        // Let's do a loose check or JSON stringify if it's an array
        let isCorrect = false;
        
        const answerStr = typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
        const qAnswerStr = typeof question.answer === 'object' ? JSON.stringify(question.answer) : String(question.answer);

        if (answerStr === qAnswerStr) {
          isCorrect = true;
        } else {
          // fallback for multiple choice arrays with different orders
          try {
            const parsedAns = JSON.parse(answerStr);
            const parsedQAns = JSON.parse(qAnswerStr);
            if (Array.isArray(parsedAns) && Array.isArray(parsedQAns)) {
              isCorrect = parsedAns.length === parsedQAns.length && 
                          parsedAns.every(a => parsedQAns.includes(a));
            }
          } catch(e) {}
        }

        if (isCorrect) {
          correctCount++;
          score += 2; // Each correct answer gives 2 points
        } else {
          wrongCount++;
        }

        results.push({
          questionId,
          isCorrect,
          correctAnswer: question.answer,
          explanation: question.explanation,
          userAnswer: answer
        });
      }

      if (score > 0) {
        const student = db.prepare('SELECT total_points, available_points FROM students WHERE id = ?').get(studentId) as any;
        if (student) {
          const newTotal = student.total_points + score;
          const newAvailable = student.available_points + score;
          db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?')
            .run(newTotal, newAvailable, studentId);

          db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
            .run(studentId, 'CHALLENGE_REWARD', score, '挑战模式加分');
        }
      }

      db.prepare('INSERT INTO challenge_records (student_id, score, correct_count, wrong_count) VALUES (?, ?, ?, ?)')
        .run(studentId, score, correctCount, wrongCount);

      return { score, correctCount, wrongCount, results };
    });

    const result = transaction();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/challenge/boss/active/:classId
router.get('/boss/active/:classId', (req: Request, res: Response) => {
  const { classId } = req.params;
  try {
    assertClassFeatureEnabled(Number(classId), 'enable_world_boss');

    const boss = db.prepare(`
      SELECT * FROM world_bosses 
      WHERE status = 'active' 
      ORDER BY id DESC LIMIT 1
    `).get();

    res.json({ success: true, boss: boss || null });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/challenge/boss/:id/attack
router.post('/boss/:id/attack', (req: Request, res: Response) => {
  const { id } = req.params;
  const { studentId } = req.body;

  if (!studentId) {
    return res.status(400).json({ success: false, message: 'Missing studentId' });
  }

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_world_boss');

    const result = db.transaction(() => {
      const boss = db.prepare("SELECT * FROM world_bosses WHERE id = ? AND status = 'active'").get(id) as any;
      if (!boss) {
        throw new Error('Boss not found or already defeated');
      }

      const student = db.prepare('SELECT id, name, class_id FROM students WHERE id = ?').get(studentId) as any;
      if (!student) {
        throw new Error('Student not found');
      }

      const pet = db.prepare('SELECT attack_power FROM pets WHERE student_id = ?').get(studentId) as any;
      const attackPower = pet ? pet.attack_power : 10;

      let newHp = boss.hp - attackPower;
      let defeated = false;
      const rewardPoints = boss.level * 100; // Reward points based on boss level, or fixed? The prompt doesn't specify, let's use 100. Let's say 50 * level.
      // Wait, "award points to all students in class" -> I'll use 50.

      if (newHp <= 0) {
        newHp = 0;
        defeated = true;
        db.prepare("UPDATE world_bosses SET hp = ?, status = 'defeated' WHERE id = ?").run(newHp, id);

        // Award points to all students in the class
        const studentsInClass = db.prepare('SELECT id, total_points, available_points FROM students WHERE class_id = ?').all(student.class_id) as any[];
        
        for (const s of studentsInClass) {
          const newTotal = s.total_points + 50;
          const newAvailable = s.available_points + 50;
          db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?').run(newTotal, newAvailable, s.id);
          db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
            .run(s.id, 'BOSS_REWARD', 50, `世界Boss被击败奖励`);
        }
      } else {
        db.prepare('UPDATE world_bosses SET hp = ? WHERE id = ?').run(newHp, id);
      }

      // Record the attack
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'BOSS_ATTACK', 0, `攻击了世界Boss，造成 ${attackPower} 点伤害`);

      return { defeated, damage: attackPower, newHp, rewardPoints: defeated ? 50 : 0 };
    })();

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/challenge/boss
router.get('/boss', (req: Request, res: Response) => {
  try {
    const bosses = db.prepare('SELECT * FROM world_bosses ORDER BY id DESC').all();
    res.json({ success: true, bosses });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/challenge/boss
router.post('/boss', (req: Request, res: Response) => {
  const { name, description, hp, level, start_time, end_time } = req.body;
  
  if (!name || typeof hp !== 'number' || hp <= 0) {
    res.status(400).json({ success: false, message: 'Invalid input' });
    return;
  }

  try {
    const stmt = db.prepare('INSERT INTO world_bosses (name, description, hp, max_hp, level, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(name, description || '', hp || 10000, hp || 10000, level || 1, start_time || null, end_time || null);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE /api/challenge/boss/:id
router.delete('/boss/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM world_bosses WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
