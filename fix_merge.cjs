const fs = require('fs');

const content = fs.readFileSync('src/components/Layout/TeacherLayout.tsx', 'utf8');

// Replace the top conflict
let newContent = content.replace(/<<<<<<< HEAD[\s\S]*?=======\s*import { Users, ClipboardList, LogOut, Award, Store, Settings, MonitorPlay, BarChart, MessageCircle, Gift, Wrench, CheckCircle, UserCog, BookOpen, FileSpreadsheet, CalendarCheck, Target, Sparkles, ShieldAlert, Package, Gavel, GitBranch, Swords, Map } from "lucide-react";\s*import { useEffect, useState } from 'react';\s*>>>>>>> trae\/solo-agent-CB3Lq9/, 
`import {
  Users, ClipboardList, LogOut, Award, Store, Settings,
  MonitorPlay, BarChart, MessageCircle, Gift, Wrench,
  CheckCircle, UserCog, BookOpen, FileSpreadsheet,
  CalendarCheck, Target, Sparkles, ShieldAlert, Package,
  Gavel, GitBranch, Swords, Map
} from "lucide-react";
import { useEffect, useState } from 'react';`);

// Find the bottom conflict and replace it with the new mapped list logic
newContent = newContent.replace(/<<<<<<< HEAD[\s\S]*?=======\s*<nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">[\s\S]*?>>>>>>> trae\/solo-agent-CB3Lq9/,
`          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
            {MENU_ITEMS.filter(item => {
              if (item.path === '/teacher/shop' && !features.enableShop) return false;
              if (item.path === '/teacher/pets' && !features.enablePets) return false;
              if (item.path === '/teacher/records' && !features.enableRecords) return false;
              return true;
            }).map((item) => {
              const isActive = location.pathname === item.path;
              const styles = colorStyles[item.color] || colorStyles.indigo;
              
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={\`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 group \${
                    isActive 
                      ? styles.activeBg + ' ' + styles.activeText 
                      : 'text-gray-600 hover:text-gray-900 border border-transparent ' + styles.hoverBg
                  }\`}
                >
                  <item.icon 
                    className={\`mr-3 h-5 w-5 transition-colors duration-200 \${
                      isActive ? styles.activeIcon : 'text-gray-400 group-hover:text-gray-600'
                    }\`} 
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t border-gray-100/80 bg-white/30 backdrop-blur-md">
            <div className="flex items-center px-4 py-3 text-sm text-gray-700 font-medium mb-2 bg-white/40 rounded-xl shadow-sm border border-white/50">
              <span className="truncate">欢迎, 老师 {user.username}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl text-red-600 hover:bg-red-50 hover:shadow-sm border border-transparent hover:border-red-100/50 transition-all duration-200"
            >
              <LogOut className="mr-3 h-5 w-5 text-red-400" />
              退出登录
            </button>`);

fs.writeFileSync('src/components/Layout/TeacherLayout.tsx', newContent);
