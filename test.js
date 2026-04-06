import db from './api/db.js';
db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('test title', 'site_title');
const res = db.prepare('SELECT * FROM settings WHERE key = ?').get('site_title');
console.log(res);
