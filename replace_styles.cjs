const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

function replaceStyles(filePath) {
  if (!filePath.endsWith('.tsx')) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // Teacher styles
  if (filePath.includes('Teacher')) {
    content = content
      .replace(/bg-white/g, 'bg-white/80 backdrop-blur-xl')
      .replace(/shadow-sm/g, 'shadow-[0_2px_12px_rgba(0,0,0,0.03)]')
      .replace(/border-gray-100/g, 'border-white/60')
      .replace(/text-gray-900/g, 'text-slate-800')
      .replace(/text-gray-800/g, 'text-slate-800')
      .replace(/text-gray-500/g, 'text-slate-500')
      .replace(/text-gray-600/g, 'text-slate-600')
      .replace(/text-gray-700/g, 'text-slate-700')
      .replace(/bg-gray-50/g, 'bg-slate-50/50')
      .replace(/bg-gray-100/g, 'bg-slate-100/50')
      .replace(/rounded-lg/g, 'rounded-2xl')
      .replace(/rounded-md/g, 'rounded-xl')
      .replace(/text-green-500/g, 'text-indigo-500')
      .replace(/bg-green-500/g, 'bg-gradient-to-r from-indigo-500 to-cyan-500')
      .replace(/hover:bg-green-600/g, 'hover:from-indigo-600 hover:to-cyan-600')
      .replace(/ring-green-500/g, 'ring-indigo-500')
      .replace(/border-green-500/g, 'border-indigo-500')
      .replace(/text-green-600/g, 'text-indigo-600')
      .replace(/bg-green-50([^0-9])/g, 'bg-indigo-50/50$1')
      .replace(/text-green-700/g, 'text-indigo-700')
      .replace(/border-green-200/g, 'border-indigo-200/50')
      .replace(/hover:bg-green-50([^0-9])/g, 'hover:bg-indigo-50/80$1')
      .replace(/bg-green-100/g, 'bg-indigo-100/50')
      .replace(/text-green-800/g, 'text-indigo-800');
  } else if (filePath.includes('Admin')) {
    content = content
      .replace(/bg-white/g, 'bg-white/80 backdrop-blur-xl')
      .replace(/shadow-sm/g, 'shadow-[0_2px_12px_rgba(0,0,0,0.03)]')
      .replace(/border-gray-200/g, 'border-slate-200/60')
      .replace(/border-gray-100/g, 'border-slate-100/60')
      .replace(/text-gray-900/g, 'text-slate-800')
      .replace(/text-gray-800/g, 'text-slate-800')
      .replace(/text-gray-500/g, 'text-slate-500')
      .replace(/text-gray-600/g, 'text-slate-600')
      .replace(/text-gray-700/g, 'text-slate-700')
      .replace(/bg-gray-50/g, 'bg-slate-50/50')
      .replace(/bg-gray-100/g, 'bg-slate-100/50')
      .replace(/rounded-lg/g, 'rounded-2xl')
      .replace(/rounded-md/g, 'rounded-xl')
      .replace(/bg-blue-600/g, 'bg-gradient-to-r from-blue-600 to-indigo-600')
      .replace(/hover:bg-blue-700/g, 'hover:from-blue-700 hover:to-indigo-700')
      .replace(/bg-blue-50([^0-9])/g, 'bg-blue-50/50$1')
      .replace(/border-blue-200/g, 'border-blue-200/50');
  }

  fs.writeFileSync(filePath, content);
}

walk('src/pages/Teacher', replaceStyles);
walk('src/pages/Admin', replaceStyles);

