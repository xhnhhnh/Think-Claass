import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { useClasses } from '@/hooks/queries/useClasses';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { Toolbar } from '@/components/ui/toolbar';
import ClassFeaturePanel from './components/ClassFeaturePanel';

/**
 * 课堂功能开关.
 *
 * A configuration page: the scaffold is `form`, the class picker sits in its `toolbar`
 * slot, and the switches themselves are `ClassFeaturePanel` - this page only chooses
 * which class it is configuring.
 */
export default function TeacherFeatures() {
  const { data: classes = [], isLoading, isError, refetch } = useClasses();
  const [classId, setClassId] = useState<number | null>(null);

  useEffect(() => {
    if (!classId && classes.length > 0) {
      setClassId(classes[0].id);
    }
  }, [classId, classes]);

  // The page has no mutation of its own; its one action is re-reading the class list.
  useRegisterPageCommands([
    {
      id: 'teacher-features:refresh',
      label: '刷新班级',
      icon: RefreshCw,
      keywords: ['班级', '功能', '开关'],
      run: () => void refetch(),
    },
  ]);

  if (isLoading) {
    return (
      <PageScaffold variant="form" className="flex justify-center py-16">
        <Spinner size="lg" label="正在加载班级" className="text-role" />
      </PageScaffold>
    );
  }

  /**
   * A failed read is not "you have no classes".
   *
   * Without this branch the page told the teacher to go and create a class they already have,
   * on the one screen whose switches decide what students can see.
   */
  if (isError) {
    return (
      <PageScaffold variant="form">
        <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
          <p className="font-semibold text-danger">班级列表加载失败</p>
          <p className="mt-1 text-sm text-fg-3">这不代表没有班级，请重试。</p>
          <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      </PageScaffold>
    );
  }

  if (classes.length === 0) {
    return (
      <PageScaffold variant="form">
        <EmptyState title="请先在主控台创建班级" />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="form"
      contentClassName="mx-auto max-w-6xl"
      toolbar={
        <Toolbar
          filters={
            <>
              <span className="text-sm font-bold text-fg-3 mr-2 flex-shrink-0">班级:</span>
              {classes.map((cls) => (
                <Button variant="ghost"
                  key={cls.id}
                  onClick={() => setClassId(cls.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    classId === cls.id
                      ? 'bg-gradient-to-r from-role to-role-ink text-role-contrast shadow-card'
                      : 'bg-surface-2/80 backdrop-blur-xl text-fg-2 border border-line-1 hover:bg-surface-3/60'
                  }`}
                >
                  {cls.name} · ID {cls.id} · 邀请码 {cls.invite_code}
                </Button>
              ))}
            </>
          }
        />
      }
    >
      <ClassFeaturePanel classId={classId} />
    </PageScaffold>
  );
}
