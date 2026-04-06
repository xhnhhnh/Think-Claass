import db from './api/db.js';
try {
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(true, 'allow_teacher_registration');
  console.log("Success");
} catch (e) {
  console.log("Error:", e.message);
}
