import { useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useClasses } from '@/hooks/queries/useClasses';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import ClassFeaturePanel from './components/ClassFeaturePanel';

/**
 * 课堂功能开关.
 *
 * Choosing the class is a form control, not a row of pills that printed the class id and
 * invite code into every tab. The invite code stays, but as a labelled value with a copy
 * action - it is a join credential, not navigation.
 */
export default function TeacherFeatures() {
  const { data: classes = [], isLoading, isError, refetch } = useClasses();
  const [classId, setClassId] = useState<number | null>(null);

  useEffect(() => {
    if (!classId && classes.length > 0) {
      setClassId(classes[0].id);
    }
  }, [classId, classes]);

  const currentClass = classes.find((cls) => cls.id === classId);

  const copyInvite = async () => {
    if (!currentClass) return;
    try {
      await navigator.clipboard.writeText(currentClass.invite_code);
      toast.success('班级邀请码已复制');
    } catch {
      toast.error('复制失败，请手动选择邀请码');
    }
  };

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
        <div className="rounded-card border border-danger/20 bg-danger-soft px-6 py-10 text-center">
          <p className="font-semibold text-danger">班级列表加载失败</p>
          <p className="mt-1 text-body-sm text-fg-3">这不代表没有班级，请重试。</p>
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
        <EmptyState title="请先在教师工作台创建班级" />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="form"
      contentClassName="mx-auto max-w-6xl"
      actions={
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw aria-hidden="true" />
          刷新班级
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-card border border-line-1 bg-surface-2 p-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="flex flex-col gap-1 text-caption text-fg-3">
            当前班级
            <Select
              aria-label="选择班级"
              value={classId ?? ''}
              onChange={(event) => setClassId(Number(event.target.value))}
              className="h-9 w-56"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </Select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-fg-3">邀请码</span>
            <span className="rounded-md bg-surface-3 px-2.5 py-1 font-mono text-body-sm font-semibold tracking-wider text-fg-1">
              {currentClass?.invite_code ?? '—'}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyInvite()}>
              <Copy aria-hidden="true" />
              复制
            </Button>
          </div>
        </div>

        <div className="rounded-card border border-line-1 bg-surface-2 p-5">
          <div className="mb-5">
            <h2 className="text-section-title text-fg-1">功能开关</h2>
            <p className="mt-1 text-body-sm text-fg-3">
              开关会立即生效；关闭后学生端不再显示对应玩法，已产生的数据不会删除。
            </p>
          </div>
          <ClassFeaturePanel classId={classId} />
        </div>
      </div>
    </PageScaffold>
  );
}
