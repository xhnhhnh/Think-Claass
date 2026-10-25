import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

import learningWorld from '@/assets/brand/learning-world.png';
import BrandMark from '@/components/BrandMark';

/**
 * The shared entry layout for both sign-in surfaces.
 *
 * One composition, two voices: the public login and the superadmin login used to be two
 * cards floating in a field of paper, with nothing telling a first-time visitor what the
 * product is for. The left panel carries the brand and the promise; the right panel is
 * the task. On a phone the brand collapses to a compact header and the task gets the
 * whole screen.
 *
 * The illustration is the local `learning-world.png` used by the public hero, not a new
 * asset and not an external URL - the login page and the marketing page should look like
 * the same product.
 */
export interface AuthLayoutProps {
  /** Admin uses a security-first voice; public uses the product's teaching voice. */
  variant: 'public' | 'admin';
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}

const PUBLIC_POINTS = ['成长记录看得见', '合作任务一起做', '家校沟通更顺畅'];
const ADMIN_POINTS = ['教师与班级统一管理', '激活码与权限可追溯', '系统配置即时生效'];

export function AuthLayout({ variant, title, subtitle, children }: AuthLayoutProps) {
  const admin = variant === 'admin';
  const points = admin ? ADMIN_POINTS : PUBLIC_POINTS;

  return (
    <div className="grid min-h-dvh bg-surface-1 text-fg-1 lg:grid-cols-[1.05fr_1fr]">
      {/* ---- brand panel ------------------------------------------------- */}
      <aside className="surface-brand relative hidden overflow-hidden lg:flex lg:flex-col">
        <div aria-hidden="true" className="pattern-grid-light pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand-contrast/10 blur-3xl" />

        <div className="relative flex min-h-0 flex-1 flex-col px-10 py-10 xl:px-14">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-card bg-brand-contrast/10 text-brand-contrast">
              <BrandMark variant="glyph" className="size-7" />
            </span>
            <div>
              <div className="text-lg font-semibold tracking-tight">Think-Class</div>
              <div className="text-caption text-brand-contrast/70">课堂成长记录与协作平台</div>
            </div>
          </div>

          <div className="mt-auto max-w-[34rem] pb-10">
            <p className="text-caption font-semibold tracking-[0.18em] text-brand-contrast/60">
              {admin ? 'PLATFORM OPERATIONS' : 'FOR EVERY CLASSROOM'}
            </p>
            <h1 className="mt-4 text-display text-brand-contrast">
              {admin ? '把平台运营，做得简单而可靠。' : '让每一堂课，都成为成长的起点。'}
            </h1>
            <p className="mt-4 max-w-[30rem] text-body text-brand-contrast/75">
              {admin
                ? '教师、班级、内容与系统配置集中在一处；每一次改动都可追溯，每一个开关都有明确的影响范围。'
                : '成长记录、合作任务、竞技挑战与日常参与，连接教师、学生与家长，让每一份进步都被看见。'}
            </p>

            <ul className="mt-7 space-y-2.5">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-body text-brand-contrast/80">
                  <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-brand-contrast/60" />
                  {point}
                </li>
              ))}
            </ul>

            <div className="mt-9 overflow-hidden rounded-panel border border-brand-contrast/15 bg-brand-contrast/5">
              <img
                src={learningWorld}
                alt="书本、望远镜、积木与星星构成的探索学习世界"
                className="aspect-[16/7] w-full object-cover"
              />
            </div>
          </div>

          <p className="text-caption text-brand-contrast/50">
            Think-Class · 让每一份进步都被看见
          </p>
        </div>
      </aside>

      {/* ---- form panel -------------------------------------------------- */}
      <div className="relative flex min-h-dvh flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-body-sm text-fg-3 transition-colors hover:text-fg-1"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回官网
          </Link>
          <span className="text-caption text-fg-3">Think-Class</span>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[26rem]">
            <h2 className="text-page-title text-fg-1">{title}</h2>
            <p className="mt-1.5 text-body text-fg-3">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-4 text-caption text-fg-3 sm:px-8">
          <span>© {new Date().getFullYear()} Think-Class</span>
          <span>{admin ? '仅限授权管理员访问' : '让每一份进步都被看见'}</span>
        </footer>
      </div>
    </div>
  );
}

export default AuthLayout;
