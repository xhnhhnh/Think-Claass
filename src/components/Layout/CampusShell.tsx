import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Sprout } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import AnnouncementBanner from '@/components/AnnouncementBanner';
import WebsiteIcon from '@/components/WebsiteIcon';
import learningWorld from '@/assets/portal/learning-world.png';
import { cn } from '@/lib/utils';

export type CampusNavItem = {
  path: string;
  icon: LucideIcon;
  label: string;
};

type CampusRole = 'teacher' | 'student' | 'parent' | 'admin';

type CampusShellProps = {
  role: CampusRole;
  title: string;
  subtitle?: string;
  navItems: CampusNavItem[];
  brandLabel: string;
  userLabel?: string;
  userMeta?: string;
  homePath: string;
  logoutLabel?: string;
  showAnnouncement?: boolean;
  onLogout: () => void;
  children: ReactNode;
};

const roleCopy: Record<
  CampusRole,
  {
    badge: string;
    eyebrow: string;
    accent: string;
    active: string;
    icon: string;
    profile: string;
  }
> = {
  teacher: {
    badge: '教师',
    eyebrow: '课堂运营',
    accent: 'from-emerald-50 via-white to-sky-50',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    icon: 'text-emerald-600 bg-emerald-50',
    profile: 'border-emerald-100 bg-emerald-50/70',
  },
  student: {
    badge: '学生',
    eyebrow: '今日成长',
    accent: 'from-emerald-50 via-amber-50/40 to-sky-50',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    icon: 'text-amber-600 bg-amber-50',
    profile: 'border-amber-100 bg-amber-50/70',
  },
  parent: {
    badge: '家长',
    eyebrow: '校园陪伴',
    accent: 'from-orange-50 via-white to-emerald-50',
    active: 'bg-orange-50 text-orange-700 border-orange-100',
    icon: 'text-orange-600 bg-orange-50',
    profile: 'border-orange-100 bg-orange-50/70',
  },
  admin: {
    badge: '管理员',
    eyebrow: '系统工作台',
    accent: 'from-slate-50 via-white to-sky-50',
    active: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: 'text-slate-700 bg-slate-100',
    profile: 'border-slate-200 bg-slate-50',
  },
};

export default function CampusShell({
  role,
  title,
  subtitle,
  navItems,
  brandLabel,
  userLabel,
  userMeta,
  homePath,
  logoutLabel = '退出登录',
  showAnnouncement = false,
  onLogout,
  children,
}: CampusShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = roleCopy[role];

  return (
    <div className={cn('campus-shell min-h-screen bg-[var(--campus-canvas)] text-slate-900', `theme-${role}`)}>
      {showAnnouncement ? <AnnouncementBanner /> : null}
      <div className="flex min-h-screen">
        <aside className="hidden w-[272px] shrink-0 border-r border-[var(--campus-border)] bg-white/88 lg:flex lg:flex-col">
          <button
            type="button"
            onClick={() => navigate(homePath)}
            className="flex h-20 items-center gap-3 border-b border-[var(--campus-border)] px-5 text-left transition-colors hover:bg-emerald-50/50"
          >
            <WebsiteIcon className="size-10 rounded-lg object-cover" />
            <div className="min-w-0">
              <div className="truncate text-lg font-bold tracking-tight text-slate-950">{brandLabel}</div>
              <div className="text-xs font-medium text-slate-500">{theme.eyebrow}</div>
            </div>
          </button>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-lg border border-transparent px-3 text-left text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950',
                    isActive && theme.active,
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400',
                      isActive && theme.icon,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-[var(--campus-border)] p-4">
            <div className={cn('rounded-lg border p-3', theme.profile)}>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
                  <Sprout className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">{userLabel || theme.badge}</div>
                  <div className="truncate text-xs font-medium text-slate-500">{userMeta || theme.badge}</div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-100 bg-white text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="size-4" />
              {logoutLabel}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-[var(--campus-border)] bg-white/88 backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:min-h-20 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(homePath)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--campus-border)] bg-white lg:hidden"
                  aria-label="返回首页"
                >
                  <WebsiteIcon className="size-7 rounded-md object-cover" />
                </button>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      {theme.badge}
                    </span>
                    <span className="hidden text-xs font-medium text-slate-400 sm:inline">{theme.eyebrow}</span>
                  </div>
                  <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
                </div>
              </div>

              <div className="hidden items-center gap-3 sm:flex">
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900">{userLabel || theme.badge}</div>
                  <div className="text-xs font-medium text-slate-500">{userMeta || brandLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex size-10 items-center justify-center rounded-lg border border-[var(--campus-border)] bg-white text-slate-500 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600"
                  aria-label={logoutLabel}
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>

            <nav className="flex gap-2 overflow-x-auto border-t border-[var(--campus-border)] px-4 py-2 lg:hidden">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={cn(
                      'flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--campus-border)] bg-white px-3 text-sm font-semibold text-slate-600',
                      isActive && theme.active,
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </header>

          <main className="relative flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            <div className={cn('campus-hero mb-5 overflow-hidden rounded-lg border border-[var(--campus-border)] bg-gradient-to-r p-5', theme.accent)}>
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-700">{theme.eyebrow}</p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {subtitle || '把课堂、家庭与成长记录放在同一条清晰的校园旅程线上。'}
                  </p>
                </div>
                <img
                  src={learningWorld}
                  alt=""
                  className="hidden h-24 w-60 shrink-0 rounded-lg object-cover object-center opacity-90 md:block"
                />
              </div>
            </div>
            <div className="campus-content">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
