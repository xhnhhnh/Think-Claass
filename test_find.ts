import db from './api/db.js';
console.log(db.prepare('SELECT * FROM settings WHERE value LIKE \'%object%\'').all());
console.log(db.prepare('SELECT * FROM announcements WHERE content LIKE \'%object%\'').all());
