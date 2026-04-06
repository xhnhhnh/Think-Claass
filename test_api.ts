import express from 'express';
import adminRoutes from './api/routes/admin.js';
import db from './api/db.js';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

app.listen(3000, async () => {
  console.log('Server started');
  
  // Make a request
  const res = await fetch('http://localhost:3000/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_title: 'My Awesome Site',
      allow_teacher_registration: '1'
    })
  });
  
  console.log(await res.json());
  console.log(db.prepare('SELECT * FROM settings').all());
  process.exit(0);
});
