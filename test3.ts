import db from './api/db.js';
db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)').run('teacher', 'test', 'test');
console.log(db.prepare('SELECT * FROM users').all());
