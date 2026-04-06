import db from './api/db.js';
console.log(db.prepare('SELECT * FROM settings').all());
