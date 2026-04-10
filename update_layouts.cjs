const fs = require('fs');

const teacherLayoutPath = 'src/components/Layout/TeacherLayout.tsx';
let teacherLayout = fs.readFileSync(teacherLayoutPath, 'utf8');
teacherLayout = teacherLayout.replace(
  'className="min-h-screen bg-gray-50 flex flex-col"',
  'className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex flex-col font-sans"'
).replace(
  'className="w-64 bg-white shadow-lg flex flex-col z-10 relative"',
  'className="w-64 bg-white/70 backdrop-blur-xl border-r border-white/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex flex-col z-10 relative"'
).replace(
  'className="h-16 flex items-center px-6 bg-green-500 text-white font-bold text-xl tracking-wider shadow-sm flex-shrink-0"',
  'className="h-16 flex items-center px-6 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-bold text-xl tracking-wide shadow-sm flex-shrink-0"'
).replace(
  /bg-green-50 text-green-700/g,
  'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50'
).replace(
  /text-green-500/g,
  'text-indigo-600'
).replace(
  /bg-gray-50 flex flex-col/g,
  'bg-transparent flex flex-col'
).replace(
  /bg-white shadow-sm h-16/g,
  'bg-white/60 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-16 border-b border-white/40'
).replace(
  /bg-gray-50 overflow-hidden/g,
  'bg-transparent overflow-hidden'
);
fs.writeFileSync(teacherLayoutPath, teacherLayout);

const adminLayoutPath = 'src/components/Layout/AdminLayout.tsx';
let adminLayout = fs.readFileSync(adminLayoutPath, 'utf8');
adminLayout = adminLayout.replace(
  'className="min-h-screen bg-gray-50 flex"',
  'className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex font-sans"'
).replace(
  'className="w-64 bg-slate-900 text-white shadow-xl flex flex-col"',
  'className="w-64 bg-slate-900/95 backdrop-blur-2xl text-white shadow-[4px_0_24px_rgba(0,0,0,0.1)] flex flex-col border-r border-slate-700/50"'
).replace(
  'className="h-16 flex items-center px-6 bg-slate-800 font-bold text-xl tracking-wider shadow-sm"',
  'className="h-16 flex items-center px-6 bg-slate-800/50 font-bold text-xl tracking-wide shadow-sm border-b border-slate-700/50"'
).replace(
  /bg-blue-600 text-white shadow-md/g,
  'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20'
).replace(
  /bg-white shadow-sm h-16/g,
  'bg-white/60 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-16 border-b border-white/40'
);
fs.writeFileSync(adminLayoutPath, adminLayout);
