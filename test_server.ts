import express from 'express';
import settingsRoutes from './api/routes/settings.js';
import adminRoutes from './api/routes/admin.js';
import db from './api/db.js';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);

app.listen(3001, async () => {
  console.log('Server started on 3001');
  
  // 1. Fetch settings
  const res1 = await fetch('http://localhost:3001/api/settings');
  console.log('GET /api/settings:', await res1.json());
  
  // 2. Modify settings
  const res2 = await fetch('http://localhost:3001/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_title: 'Modified Title',
      allow_teacher_registration: '0'
    })
  });
  console.log('PUT /api/admin/settings:', await res2.json());
  
  // 3. Fetch settings again
  const res3 = await fetch('http://localhost:3001/api/settings');
  console.log('GET /api/settings after PUT:', await res3.json());
  
  process.exit(0);
});
