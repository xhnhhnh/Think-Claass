import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The chrome the public sub-pages share.
 *
 * About, Services, News and Contact each carried their own copy of the same sticky
 * header, the same back button, the same `<main>` wrapper and the same footer - four
 * copies, each with its own indigo accent and its own `public-campus-page` class.
 * Extracting it is what makes the public pages a family rather than four pages that
 * happen to look similar.
 *
 * Home keeps its own chrome: it is the marketing page, with a navigation bar rather
 * than a back button.
 */
export default function PortalShell({
  title,
  icon: Icon,
  children,
  mainClassName,
  contentClassName,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  mainClassName?: string;
  contentClassName?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-canvas font-sans text-ink-1 selection:bg-primary/10">
      <header className="sticky top-0 z-40 border-b border-border bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-card bg-primary text-primary-foreground">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="text-base font-semibold text-ink-1">{title}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="bg-paper text-ink-3 shadow-sm hover:text-primary"
          >
            <ArrowLeft data-icon="inline-start" />
            返回首页
          </Button>
        </div>
      </header>

      <main className={cn('mx-auto w-full flex-1 px-6 py-12 md:py-20', mainClassName)}>
        <div className={contentClassName}>{children}</div>
      </main>

      <footer className="border-t border-border bg-paper py-6 text-center">
        <p className="text-sm text-ink-3">
          &copy; {new Date().getFullYear()} Think-Class. 保留所有权利。
        </p>
      </footer>
    </div>
  );
}
