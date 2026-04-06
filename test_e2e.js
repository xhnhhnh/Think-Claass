(async () => {
  try {
    // 1. Login as super admin
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Think', password: 'wx951004', role: 'superadmin' })
    });
    const loginData = await loginRes.json();
    console.log('Login:', loginData);
    
    // 2. Modify settings
    const putRes = await fetch('http://localhost:3001/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_title: 'Hacked Title' })
    });
    console.log('PUT Settings:', await putRes.json());
    
    // 3. Fetch settings
    const getRes = await fetch('http://localhost:3001/api/settings');
    console.log('GET Settings:', await getRes.json());
    
    // 4. Login as student to see if it breaks
    const studentRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student123', password: '123456', role: 'student' })
    });
    console.log('Student Login:', await studentRes.json());
    
  } catch(e) {
    console.error(e);
  }
})();
