const fs = require('fs');

function replaceFile(file, oldStr, newStr) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(oldStr)) {
    fs.writeFileSync(file, content.replace(oldStr, newStr), 'utf8');
    console.log('Fixed', file);
  }
}

// 1. DanmakuOverlay
replaceFile('src/components/DanmakuOverlay.tsx', 
`      const res = await fetch('/api/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          sender_name: user.name || user.username,
          content: currentInput,
          color: color
        })
      });`, 
`      await apiPost('/api/danmaku', {
        class_id: classId,
        sender_name: user.name || user.username,
        content: currentInput,
        color: color
      });`);

// 2. Parent/Dashboard
replaceFile('src/pages/Parent/Dashboard.tsx',
`        const [studentRes, recordsRes, tasksRes, petRes] = await Promise.all([
          fetch(\`/api/student/\${user.studentId}\`),
          fetch(\`/api/student/records?studentId=\${user.studentId}\`),
          fetch(\`/api/familyTasks?studentId=\${user.studentId}\`),
          fetch(\`/api/pets/\${user.studentId}\`)
        ]);

        const studentData = await studentRes.json();
        const recordsData = await recordsRes.json();
        const tasksData = await tasksRes.json();
        const petData = await petRes.json();`,
`        const [studentData, recordsData, tasksData, petData] = await Promise.all([
          apiGet(\`/api/student/\${user.studentId}\`),
          apiGet(\`/api/student/records?studentId=\${user.studentId}\`),
          apiGet(\`/api/familyTasks?studentId=\${user.studentId}\`),
          apiGet(\`/api/pets/\${user.studentId}\`)
        ]);`);

replaceFile('src/pages/Parent/Dashboard.tsx', `import { apiPost } from "@/lib/api";`, `import { apiGet, apiPost } from "@/lib/api";`);

// 3. Dungeon
replaceFile('src/pages/Student/Dungeon.tsx',
`      const res = await fetch(\`/api/dungeon/abandon/\${user.id}\`, { method: 'POST' });
      if (res.ok) {`,
`      const data = await apiPost(\`/api/dungeon/abandon/\${user.id}\`);
      if (data.success !== false) {`);

// For the rest Promise.all ones
function fixPromiseAll(file, resources) {
  let content = fs.readFileSync(file, 'utf8');
  // ensure apiGet is imported
  if (!content.includes('apiGet')) {
    content = content.replace(`import { apiPost } from "@/lib/api";`, `import { apiGet, apiPost } from "@/lib/api";`);
    if (!content.includes('apiGet')) {
        content = content.replace(`import { apiGet, apiPost }`, `import { apiGet }`); // hacky
    }
  }
  
  // Regex to find:
  // const [res1, res2] = await Promise.all([ fetch(...), fetch(...) ]);
  // const data1 = await res1.json();
  // const data2 = await res2.json();
  
  content = content.replace(/const \[([^\]]+)\] = await Promise\.all\(\[\s*fetch\(([^)]+)\),\s*fetch\(([^)]+)\)\s*\]\);\s*const ([^\s]+) = await [^\.]+\.json\(\);\s*const ([^\s]+) = await [^\.]+\.json\(\);/g, 
  (match, resVars, fetch1, fetch2, data1, data2) => {
      return `const [${data1}, ${data2}] = await Promise.all([\n          apiGet(${fetch1}),\n          apiGet(${fetch2})\n        ]);`;
  });
  
  content = content.replace(/const \[([^\]]+)\] = await Promise\.all\(\[\s*fetch\(([^)]+)\),\s*fetch\(([^)]+)\),\s*fetch\(([^)]+)\)\s*\]\);\s*const ([^\s]+) = await [^\.]+\.json\(\);\s*const ([^\s]+) = await [^\.]+\.json\(\);\s*const ([^\s]+) = await [^\.]+\.json\(\);/g, 
  (match, resVars, fetch1, fetch2, fetch3, data1, data2, data3) => {
      return `const [${data1}, ${data2}, ${data3}] = await Promise.all([\n          apiGet(${fetch1}),\n          apiGet(${fetch2}),\n          apiGet(${fetch3})\n        ]);`;
  });

  fs.writeFileSync(file, content, 'utf8');
}

fixPromiseAll('src/pages/Student/Auction.tsx');
fixPromiseAll('src/pages/Student/Bank.tsx');
fixPromiseAll('src/pages/Student/Challenge.tsx');
fixPromiseAll('src/pages/Student/Gacha.tsx');
fixPromiseAll('src/pages/Student/Shop.tsx');
fixPromiseAll('src/pages/Teacher/Brawl.tsx');
fixPromiseAll('src/pages/Teacher/Certificates.tsx');
fixPromiseAll('src/pages/Teacher/Features.tsx');
fixPromiseAll('src/pages/Teacher/TaskTree.tsx');
fixPromiseAll('src/pages/Teacher/Territory.tsx');

console.log("Promise.all fixes done");
