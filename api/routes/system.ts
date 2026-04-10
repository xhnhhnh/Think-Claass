import { Router } from 'express';
import db from '../db.js';
import fs from 'fs';
import path from 'path';

const router = Router();

// =======================
// Question Bank
// =======================

router.get('/questions', (req, res) => {
  const { teacherId } = req.query;
  try {
    const questions = db.prepare('SELECT * FROM question_bank WHERE teacher_id = ? ORDER BY created_at DESC').all(teacherId);
    res.json({ success: true, questions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/questions', (req, res) => {
  const { title, type, options, answer, explanation, teacher_id } = req.body;
  try {
    const stmt = db.prepare('INSERT INTO question_bank (title, type, options, answer, explanation, teacher_id) VALUES (?, ?, ?, ?, ?, ?)');
    const info = stmt.run(title, type, options, answer, explanation, teacher_id);
    const newQuestion = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, question: newQuestion });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/questions/:id', (req, res) => {
  const { id } = req.params;
  const { title, type, options, answer, explanation } = req.body;
  try {
    const stmt = db.prepare('UPDATE question_bank SET title = ?, type = ?, options = ?, answer = ?, explanation = ? WHERE id = ?');
    stmt.run(title, type, options, answer, explanation, id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/questions/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM question_bank WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =======================
// System Settings
// =======================

router.get('/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM system_settings').all();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/settings', (req, res) => {
  const { key, value, description } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM system_settings WHERE key = ?').get(key);
    if (existing) {
      db.prepare('UPDATE system_settings SET value = ?, description = ? WHERE key = ?').run(value, description, key);
    } else {
      db.prepare('INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)').run(key, value, description);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =======================
// Operation Logs
// =======================

router.get('/logs', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT l.*, u.username as teacher_name 
      FROM operation_logs l
      LEFT JOIN users u ON l.teacher_id = u.id
      ORDER BY l.created_at DESC 
      LIMIT 100
    `).all();
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =======================
// Data Backup
// =======================

router.get('/backup/export', (req, res) => {
  try {
    const tables = ['users', 'classes', 'students', 'pets', 'shop_items', 'records', 'point_presets', 'student_groups', 'praises', 'announcements', 'settings', 'certificates', 'messages', 'family_tasks', 'class_announcements', 'question_bank', 'system_settings'];
    const data: any = {};
    
    for (const table of tables) {
      data[table] = db.prepare(`SELECT * FROM ${table}`).all();
    }
    
    const jsonStr = JSON.stringify(data, null, 2);
    
    res.setHeader('Content-disposition', 'attachment; filename=backup.json');
    res.setHeader('Content-type', 'application/json');
    res.send(jsonStr);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;