import db from './api/db.js';
db.prepare('INSERT INTO announcements (title, content, is_active) VALUES (?, ?, ?)').run('test', 'content', 1);
console.log(db.prepare('SELECT * FROM announcements').all());
