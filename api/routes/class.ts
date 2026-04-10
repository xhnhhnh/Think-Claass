import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';

const router = Router();

// Get all classes
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { teacherId } = req.query;
  let classes;
  if (teacherId) {
    classes = db.prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at ASC').all(teacherId);
  } else {
    classes = db.prepare('SELECT * FROM classes ORDER BY created_at ASC').all();
  }
  res.json({ success: true, classes });
}));

// Get students of a class by invite code (unregistered only for student role)
router.get('/invite/:code', asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  const { role } = req.query;
  const cls = db.prepare('SELECT id, name FROM classes WHERE invite_code = ?').get(code) as any;
  if (!cls) {
    throw new ApiError(404, '无效的邀请码');
  }

  let students;
  if (role === 'parent') {
    // Parents can select any student in the class
    students = db.prepare('SELECT id, name FROM students WHERE class_id = ?').all(cls.id) as any[];
  } else {
    // Fetch students in this class who haven't registered (user_id is NULL)
    students = db.prepare('SELECT id, name FROM students WHERE class_id = ? AND user_id IS NULL').all(cls.id) as any[];
  }
  
  // Decrypt student names
  students = students.map(s => ({ ...s, name: decrypt(s.name) }));

  res.json({ success: true, class: cls, students });
}));

// Create a class
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, teacher_id } = req.body;
  if (!name) {
    throw new ApiError(400, 'Class name is required');
  }

  let tId = teacher_id;
  if (!tId) {
    const teacher = db.prepare('SELECT id FROM users WHERE role = ?').get('teacher') as any;
    if (!teacher) {
      throw new ApiError(400, 'Teacher not found');
    }
    tId = teacher.id;
  }

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const stmt = db.prepare('INSERT INTO classes (name, teacher_id, invite_code) VALUES (?, ?, ?)');
  const info = stmt.run(name, tId, inviteCode);
  
  res.json({ success: true, class: { id: info.lastInsertRowid, name, teacher_id: tId, invite_code: inviteCode } });
}));

// Get a single class
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
  if (!cls) {
    throw new ApiError(404, 'Class not found');
  }
  res.json({ success: true, class: cls });
}));

// Get class data for big screen (read-only, no strict auth)
router.get('/:id/bigscreen', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const cls = db.prepare('SELECT id, name, invite_code FROM classes WHERE id = ?').get(id) as any;
  if (!cls) {
    throw new ApiError(404, '班级未找到');
  }

  // Top 10 students by points
  const topStudentsRaw = db.prepare(`
    SELECT id, name, total_points, available_points 
    FROM students 
    WHERE class_id = ? 
    ORDER BY total_points DESC 
    LIMIT 10
  `).all(id) as any[];
  const topStudents = topStudentsRaw.map(s => ({ ...s, name: decrypt(s.name) }));

  // Latest 10 praises (表扬动态)
  const latestPraisesRaw = db.prepare(`
    SELECT p.id, p.content, p.color, p.created_at, s.name as student_name, 'praise' as type
    FROM praises p
    JOIN students s ON p.student_id = s.id
    WHERE s.class_id = ?
    ORDER BY p.created_at DESC
    LIMIT 10
  `).all(id) as any[];
  const latestPraises = latestPraisesRaw.map(p => ({ ...p, student_name: decrypt(p.student_name) }));

  // Latest 10 point records (积分动态)
  const latestRecordsRaw = db.prepare(`
    SELECT r.id, r.type, r.amount, r.description as content, r.created_at, s.name as student_name
    FROM records r
    JOIN students s ON r.student_id = s.id
    WHERE s.class_id = ? AND r.type = 'ADD_POINTS'
    ORDER BY r.created_at DESC
    LIMIT 10
  `).all(id) as any[];
  const latestRecords = latestRecordsRaw.map(r => ({ ...r, student_name: decrypt(r.student_name) }));

  // Check for active World Boss
  const activeBoss = db.prepare('SELECT * FROM world_bosses WHERE status = ? ORDER BY id DESC LIMIT 1').get('active');

  res.json({ 
    success: true, 
    class: cls, 
    topStudents, 
    latestPraises,
    latestRecords,
    activeBoss
  });
}));

// Get Guild PK Leaderboard
router.get('/:id/guild-ranking', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const cls = db.prepare('SELECT id, enable_guild_pk FROM classes WHERE id = ?').get(id) as any;
  if (!cls) {
    throw new ApiError(404, '班级未找到');
  }
  
  if (!cls.enable_guild_pk) {
    return res.json({ success: true, rankings: [], isEnabled: false });
  }

  // Get total points sum for each group
  const rankingsRaw = db.prepare(`
    SELECT sg.id, sg.name, SUM(s.total_points) as total_score
    FROM student_groups sg
    JOIN students s ON s.group_id = sg.id
    WHERE sg.class_id = ?
    GROUP BY sg.id
    ORDER BY total_score DESC
  `).all(id) as any[];

  res.json({ success: true, rankings: rankingsRaw, isEnabled: true });
}));

// Update class settings/features
router.put(['/:id/settings', '/:id/features'], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { 
    enable_chat_bubble, 
    enable_peer_review, 
    enable_tree_hole,
    enable_shop,
    enable_lucky_draw,
    enable_challenge,
    enable_family_tasks,
    enable_world_boss,
    enable_guild_pk,
    enable_auction_blind_box,
    enable_achievements,
    enable_parent_buff,
    pet_selection_mode
  } = req.body;

  const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(id) as any;
  if (!cls) {
    throw new ApiError(404, 'Class not found');
  }

  db.prepare(`
    UPDATE classes 
    SET enable_chat_bubble = COALESCE(?, enable_chat_bubble),
        enable_peer_review = COALESCE(?, enable_peer_review),
        enable_tree_hole = COALESCE(?, enable_tree_hole),
        enable_shop = COALESCE(?, enable_shop),
        enable_lucky_draw = COALESCE(?, enable_lucky_draw),
        enable_challenge = COALESCE(?, enable_challenge),
        enable_family_tasks = COALESCE(?, enable_family_tasks),
        enable_world_boss = COALESCE(?, enable_world_boss),
        enable_guild_pk = COALESCE(?, enable_guild_pk),
        enable_auction_blind_box = COALESCE(?, enable_auction_blind_box),
        enable_achievements = COALESCE(?, enable_achievements),
        enable_parent_buff = COALESCE(?, enable_parent_buff),
        pet_selection_mode = COALESCE(?, pet_selection_mode)
    WHERE id = ?
  `).run(
    enable_chat_bubble !== undefined ? (enable_chat_bubble ? 1 : 0) : null,
    enable_peer_review !== undefined ? (enable_peer_review ? 1 : 0) : null,
    enable_tree_hole !== undefined ? (enable_tree_hole ? 1 : 0) : null,
    enable_shop !== undefined ? (enable_shop ? 1 : 0) : null,
    enable_lucky_draw !== undefined ? (enable_lucky_draw ? 1 : 0) : null,
    enable_challenge !== undefined ? (enable_challenge ? 1 : 0) : null,
    enable_family_tasks !== undefined ? (enable_family_tasks ? 1 : 0) : null,
    enable_world_boss !== undefined ? (enable_world_boss ? 1 : 0) : null,
    enable_guild_pk !== undefined ? (enable_guild_pk ? 1 : 0) : null,
    enable_auction_blind_box !== undefined ? (enable_auction_blind_box ? 1 : 0) : null,
    enable_achievements !== undefined ? (enable_achievements ? 1 : 0) : null,
    enable_parent_buff !== undefined ? (enable_parent_buff ? 1 : 0) : null,
    pet_selection_mode !== undefined ? pet_selection_mode : null,
    id
  );

  res.json({ success: true, message: 'Settings updated successfully' });
}));

export default router;
