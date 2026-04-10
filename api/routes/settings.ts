import { Router } from 'express';
import db from '../db';

const router = Router();

// 获取公开的站点设置
router.get('/', (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings').all() as {key: string, value: string}[];
    const data = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取设置失败:', error);
    res.status(500).json({ success: false, message: '获取设置失败' });
  }
});

export default router;
