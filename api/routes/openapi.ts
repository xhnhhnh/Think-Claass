import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = Router();

// ==========================
// API Keys Management
// ==========================

// Get all API keys
router.get('/keys', (req: Request, res: Response): void => {
  try {
    const keys = db.prepare('SELECT id, name, key, created_at, last_used_at, is_active FROM api_keys ORDER BY created_at DESC').all();
    res.json({ success: true, keys });
  } catch (error) {
    console.error('Fetch API keys error:', error);
    res.status(500).json({ success: false, message: '获取API Keys失败' });
  }
});

// Generate a new API key
router.post('/keys', (req: Request, res: Response): void => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: '名称为必填项' });
      return;
    }

    const key = 'sk_' + crypto.randomBytes(24).toString('hex');
    const info = db.prepare('INSERT INTO api_keys (name, key) VALUES (?, ?)').run(name, key);
    const newKey = db.prepare('SELECT id, name, key, created_at, last_used_at, is_active FROM api_keys WHERE id = ?').get(info.lastInsertRowid);
    
    res.json({ success: true, key: newKey });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ success: false, message: '创建API Key失败' });
  }
});

// Delete an API key
router.delete('/keys/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ success: false, message: '删除API Key失败' });
  }
});

// ==========================
// Schools (Campus) Management
// ==========================

// Get all schools
router.get('/schools', (req: Request, res: Response): void => {
  try {
    const schools = db.prepare('SELECT * FROM schools ORDER BY created_at DESC').all();
    res.json({ success: true, schools });
  } catch (error) {
    console.error('Fetch schools error:', error);
    res.status(500).json({ success: false, message: '获取校园列表失败' });
  }
});

// Create a school
router.post('/schools', (req: Request, res: Response): void => {
  try {
    const { name, description, contact_info } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: '校园名称为必填项' });
      return;
    }

    const info = db.prepare('INSERT INTO schools (name, description, contact_info) VALUES (?, ?, ?)').run(name, description || '', contact_info || '');
    const newSchool = db.prepare('SELECT * FROM schools WHERE id = ?').get(info.lastInsertRowid);
    
    res.json({ success: true, school: newSchool });
  } catch (error) {
    console.error('Create school error:', error);
    res.status(500).json({ success: false, message: '创建校园失败' });
  }
});

// Update a school
router.put('/schools/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { name, description, contact_info } = req.body;
    
    if (!name) {
      res.status(400).json({ success: false, message: '校园名称为必填项' });
      return;
    }

    db.prepare('UPDATE schools SET name = ?, description = ?, contact_info = ? WHERE id = ?').run(name, description || '', contact_info || '', id);
    const updatedSchool = db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
    
    res.json({ success: true, school: updatedSchool });
  } catch (error) {
    console.error('Update school error:', error);
    res.status(500).json({ success: false, message: '更新校园失败' });
  }
});

// Delete a school
router.delete('/schools/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM schools WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete school error:', error);
    res.status(500).json({ success: false, message: '删除校园失败' });
  }
});

export default router;