import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    active: 'bg-success/10 text-success border-success/20',
    icon: 'text-success bg-success/10',
    profile: 'border-success/20 bg-success/10',
  },
  student: {
    badge: '学生',
    eyebrow: '今日成长',
    accent: 'from-emerald-50 via-amber-50/40 to-sky-50',
    active: 'bg-success/10 text-success border-success/20',
    icon: 'text-warning bg-warning/10',
    profile: 'border-warning/20 bg-warning/10',
  },
  parent: {
    badge: '家长',
    eyebrow: '校园陪伴',
    accent: 'from-orange-50 via-white to-emerald-50',
    active: 'bg-warning/10 text-orange-700 border-warning/20',
    icon: 'text-warning bg-warning/10',
    profile: 'border-warning/20 bg-warning/10',
  },
  admin: {
    badge: '管理员',
    eyebrow: '系统工作台',
    accent: 'from-slate-50 via-white to-sky-50',
    active: 'bg-muted text-ink-1 border-border',
    icon: 'text-ink-2 bg-muted',
    profile: 'border-border bg-muted/50',
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
    /*
     * No `theme-<role>` class here on purpose: `ThemeWrapper` owns the role theme and
     * puts it on `<html>`, so portalled dialogs and menus inherit it too. Setting it
     * in both places is how the two drifted apart in the first place.
     */
    <div className={cn('campus-shell min-h-screen bg-canvas text-ink-1')}>
      {showAnnouncement ? <AnnouncementBanner /> : null}
      <div className="flex min-h-screen">
        <aside className="hidden w-[272px] shrink-0 border-r border-[var(--campus-border)] bg-paper/88 lg:flex lg:flex-col">
          <Button variant="ghost"
            type="button"
            onClick={() => navigate(homePath)}
            className="flex h-20 items-center gap-3 border-b border-[var(--campus-border)] px-5 text-left transition-colors hover:bg-success/10"
          >
            <WebsiteIcon className="size-10 rounded-lg object-cover" />
            <div className="min-w-0">
              <div className="truncate text-lg font-bold tracking-tight text-slate-950">{brandLabel}</div>
              <div className="text-xs font-medium text-ink-3">{theme.eyebrow}</div>
            </div>
          </Button>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Button variant="ghost"
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-lg border border-transparent px-3 text-left text-sm font-semibold text-ink-2 transition-colors hover:bg-muted/60 hover:text-slate-950',
                    isActive && theme.active,
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3',
                      isActive && theme.icon,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Button>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-[var(--campus-border)] p-4">
            <div className={cn('rounded-lg border p-3', theme.profile)}>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-paper text-success shadow-sm">
                  <Sprout className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink-1">{userLabel || theme.badge}</div>
                  <div className="truncate text-xs font-medium text-ink-3">{userMeta || theme.badge}</div>
                </div>
              </div>
            </div>
            <Button
              type="button"
              onClick={onLogout}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-destructive/20 bg-paper text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              {logoutLabel}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-[var(--campus-border)] bg-paper/88 backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:min-h-20 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Button variant="ghost"
                  type="button"
                  onClick={() => navigate(homePath)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--campus-border)] bg-paper lg:hidden"
                  aria-label="返回首页"
                >
                  <WebsiteIcon className="size-7 rounded-md object-cover" />
                </Button>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-md bg-success/10 px-2 py-1 text-xs font-bold text-success">
                      {theme.badge}
                    </span>
                    <span className="hidden text-xs font-medium text-ink-3 sm:inline">{theme.eyebrow}</span>
                  </div>
                  <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
                </div>
              </div>

              <div className="hidden items-center gap-3 sm:flex">
                <div className="text-right">
                  <div className="text-sm font-bold text-ink-1">{userLabel || theme.badge}</div>
                  <div className="text-xs font-medium text-ink-3">{userMeta || brandLabel}</div>
                </div>
                <Button
                  type="button"
                  onClick={onLogout}
                  className="flex size-10 items-center justify-center rounded-lg border border-[var(--campus-border)] bg-paper text-ink-3 transition-colors hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                  aria-label={logoutLabel}
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>

            <nav className="flex gap-2 overflow-x-auto border-t border-[var(--campus-border)] px-4 py-2 lg:hidden">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Button variant="ghost"
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={cn(
                      'flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--campus-border)] bg-paper px-3 text-sm font-semibold text-ink-2',
                      isActive && theme.active,
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>
          </header>

          <main className="relative flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            <div className={cn('campus-hero mb-5 overflow-hidden rounded-lg border border-[var(--campus-border)] bg-gradient-to-r p-5', theme.accent)}>
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-success">{theme.eyebrow}</p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-2">
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
