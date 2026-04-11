import express, { Request, Response } from 'express';
import db from '../db.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../utils/classFeatures.js';

const router = express.Router();

// ========================
// TEACHER ENDPOINTS
// ========================

// Get all task nodes for a class
router.get('/teacher/:classId', (req: Request, res: Response) => {
  const { classId } = req.params;
  try {
    assertClassFeatureEnabled(Number(classId), 'enable_task_tree');
    const nodes = db.prepare('SELECT * FROM task_nodes WHERE class_id = ?').all(classId);
    res.json({ success: true, nodes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new task node
router.post('/teacher', (req: Request, res: Response) => {
  const { class_id, title, description, points_reward, parent_node_id, x_pos, y_pos } = req.body;
  if (!class_id || !title) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    assertClassFeatureEnabled(Number(class_id), 'enable_task_tree');
    const stmt = db.prepare(`
      INSERT INTO task_nodes (class_id, title, description, points_reward, parent_node_id, x_pos, y_pos) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(class_id, title, description || '', points_reward || 0, parent_node_id || null, x_pos || 0, y_pos || 0);
    
    // Auto unlock for students if it has no parent (root node)
    if (!parent_node_id) {
      const students = db.prepare('SELECT id FROM students WHERE class_id = ?').all(class_id);
      const insertStudentNode = db.prepare('INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)');
      const tx = db.transaction((stds: any[]) => {
        for (const s of stds) {
          insertStudentNode.run(s.id, info.lastInsertRowid, 'unlocked');
        }
      });
      tx(students);
    }
    
    const newNode = db.prepare('SELECT * FROM task_nodes WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, node: newNode });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update a task node
router.put('/teacher/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, points_reward, x_pos, y_pos } = req.body;

  try {
    const node = db.prepare('SELECT class_id FROM task_nodes WHERE id = ?').get(id) as { class_id: number } | undefined;
    if (!node) {
      return res.status(404).json({ success: false, message: 'Task node not found' });
    }
    assertClassFeatureEnabled(node.class_id, 'enable_task_tree');
    db.prepare(`
      UPDATE task_nodes 
      SET title = ?, description = ?, points_reward = ?, x_pos = ?, y_pos = ? 
      WHERE id = ?
    `).run(title, description, points_reward, x_pos, y_pos, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete a task node
router.delete('/teacher/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const node = db.prepare('SELECT class_id FROM task_nodes WHERE id = ?').get(id) as { class_id: number } | undefined;
    if (!node) {
      return res.status(404).json({ success: false, message: 'Task node not found' });
    }
    assertClassFeatureEnabled(node.class_id, 'enable_task_tree');
    // Check if it has children
    const hasChildren = db.prepare('SELECT 1 FROM task_nodes WHERE parent_node_id = ?').get(id);
    if (hasChildren) {
      return res.status(400).json({ success: false, message: '请先删除子节点' });
    }
    
    db.prepare('DELETE FROM student_task_nodes WHERE task_node_id = ?').run(id);
    db.prepare('DELETE FROM task_nodes WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ========================
// STUDENT ENDPOINTS
// ========================

// Get tree status for a student
router.get('/student/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_task_tree');
    const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId) as any;
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Ensure all root nodes are unlocked for this student
    const rootNodes = db.prepare('SELECT id FROM task_nodes WHERE class_id = ? AND parent_node_id IS NULL').all(student.class_id);
    const insertStudentNode = db.prepare('INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)');
    for (const root of rootNodes) {
      insertStudentNode.run(studentId, (root as any).id, 'unlocked');
    }

    const nodes = db.prepare(`
      SELECT tn.*, stn.status, stn.completed_at 
      FROM task_nodes tn
      LEFT JOIN student_task_nodes stn ON tn.id = stn.task_node_id AND stn.student_id = ?
      WHERE tn.class_id = ?
    `).all(studentId, student.class_id);

    // Format nodes, mapping null status to 'locked'
    const formattedNodes = nodes.map((n: any) => ({
      ...n,
      status: n.status || 'locked'
    }));

    res.json({ success: true, nodes: formattedNodes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Complete a task node
router.post('/student/:studentId/complete/:nodeId', (req: Request, res: Response) => {
  const { studentId, nodeId } = req.params;
  
  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_task_tree');
    const tx = db.transaction(() => {
      const node = db.prepare('SELECT * FROM task_nodes WHERE id = ?').get(nodeId) as any;
      if (!node) throw new Error('Task node not found');

      // Update node status
      const stmt = db.prepare('INSERT OR REPLACE INTO student_task_nodes (student_id, task_node_id, status, completed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
      stmt.run(studentId, nodeId, 'completed');

      // Award points
      if (node.points_reward > 0) {
        db.prepare('UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?')
          .run(node.points_reward, node.points_reward, studentId);
        db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
          .run(studentId, 'TASK_TREE_REWARD', node.points_reward, `Completed task node: ${node.title}`);
      }

      // Unlock children nodes
      const children = db.prepare('SELECT id FROM task_nodes WHERE parent_node_id = ?').all(nodeId);
      const unlockStmt = db.prepare('INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)');
      for (const child of children) {
        unlockStmt.run(studentId, (child as any).id, 'unlocked');
      }
    });

    tx();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
