import { Link, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';

import { homePathForRole } from './homePath';

/**
 * The page for an address this application does not know.
 *
 * Without this route React Router rendered nothing at all: a mistyped URL, a stale bookmark or a
 * deleted page produced an empty document with no title and no way back. The signed-in case offers
 * the reader's own console; the visitor case offers the public site and the sign-in form.
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const home = user ? homePathForRole(user.role) : '/';

  return (
    <main
      data-slot="not-found"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-surface-1 px-6 text-center text-fg-1"
    >
      <span className="flex size-16 items-center justify-center rounded-panel bg-role-soft text-role shadow-card">
        <Compass aria-hidden="true" className="size-8" />
      </span>
      <div>
        <p className="text-sm font-bold tracking-widest text-fg-3">404</p>
        <h1 className="mt-1 text-2xl font-bold">这个页面不存在</h1>
        <p className="mt-2 text-sm text-fg-3">
          地址可能已经更改，或者链接里有错字。回到你该在的地方继续吧。
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => navigate(home)}>
          {user ? '回到我的控制台' : '回到官网首页'}
        </Button>
        {!user ? (
          <Button variant="outline" onClick={() => navigate('/login')}>
            去登录
          </Button>
        ) : null}
      </div>
      <Link to="/" className="inline-flex items-center gap-2 text-xs text-fg-3 hover:text-fg-1">
        <BrandMark variant="glyph" className="size-4" />
        Think-Class
      </Link>
    </main>
  );
}
