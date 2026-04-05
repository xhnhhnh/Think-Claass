import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/challenge/questions
router.get('/questions', (req: Request, res: Response) => {
  try {
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

export default router;
