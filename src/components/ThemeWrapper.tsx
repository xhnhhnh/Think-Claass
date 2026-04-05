import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const root = document.documentElement;

    // 移除所有已知的主题类
    root.classList.remove('theme-student', 'theme-admin', 'theme-parent');

    // 根据路径添加对应的主题类
    if (path.startsWith('/student')) {
      root.classList.add('theme-student');
    } else if (path.startsWith('/beiadmin')) {
      root.classList.add('theme-admin');
    } else if (path.startsWith('/parent')) {
      root.classList.add('theme-parent');
    }
    // 教师或默认路径不添加特定主题类，使用默认主题
  }, [location.pathname]);

  return <>{children}</>;
}
