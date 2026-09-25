import { useNavigate } from 'react-router-dom';
import { FileText, PlayCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';

import { usePapers } from '@/hooks/queries/usePapers';

/**
 * 试卷练习.
 *
 * A `list` page on the scaffold: the shell's context bar owns the heading, so the
 * page no longer prints its own `h2` inside a card. The request (`usePapers`), the
 * route each row navigates to and every label are unchanged; only the surface
 * moved from the old `paper`/`primary` aliases onto the surface, fg, line and role
 * tokens, and the row action is the kit's `Button` instead of a hand-tinted one.
 */
export default function StudentPapers() {
  const navigate = useNavigate();
  const { data: papers = [], isLoading } = usePapers();

  if (isLoading) {
    return (
      <PageScaffold variant="list" className="flex items-center justify-center py-20">
        <div className="flex items-center justify-center gap-3 text-fg-3">
          <Spinner size="lg" label="正在加载试卷" />
          正在加载试卷...
        </div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold variant="list" title="试卷练习">
      {papers.length === 0 ? (
        <EmptyState icon={FileText} title="暂无可练习试卷" />
      ) : (
        <ul className="space-y-3">
          {papers.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-3 rounded-panel border border-line-1 bg-surface-2 p-5 shadow-card transition-colors hover:border-role/40 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-role-soft text-role-ink">
                  <FileText aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-bold text-fg-1">{p.title}</div>
                  <div className="text-sm text-fg-3">
                    {p.subjects?.name ? `学科：${p.subjects.name}` : '未设置学科'}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate(`/student/papers/${p.id}`)}
                className="shrink-0"
              >
                <PlayCircle aria-hidden="true" className="size-4" />
                开始练习
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageScaffold>
  );
}
