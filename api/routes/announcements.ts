import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// Get active announcement
router.get('/active', (req: Request, res: Response): void => {
  try {
    const announcement = db.prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1').get();
    res.json({ success: true, announcement: announcement || null });
  } catch (error) {
    console.error('Fetch active announcement error:', error);
    res.status(500).json({ success: false, message: '获取公告失败' });
  }
});

export default router;