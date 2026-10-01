import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, UploadCloud } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { papersApi } from '@/features/learning/api/papersApi';
import { knowledgeApi } from '@/features/learning/api/knowledgeApi';
import { useClasses } from '@/hooks/queries/useClasses';
import { usePapers } from '@/features/learning/hooks/usePapers';
import { useSubjects } from '@/features/learning/hooks/useKnowledge';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Toolbar } from '@/components/ui/toolbar';

/**
 * 试卷库.
 *
 * A `list` page: the scaffold owns the width and the heading, the create/filter row is
 * its sticky `toolbar` slot (its three controls keep their visible labels through
 * `FormField`), the loading and empty blocks are `Spinner` and `EmptyState`, and the
 * four action buttons are the kit's `Button`. The hand-built `Card` that wrapped the
 * toolbar and the list was a second container for the same content.
 *
 * `管理学科` used to call `prompt()`, which is a blocking browser dialog this refactor
 * is removing - it is a one-field `Dialog` now, and `handleCreateSubject` is unchanged
 * underneath (same `knowledgeApi.createSubject` payload, same toast).
 */
export default function TeacherPapers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const { data: subjects = [] } = useSubjects();
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const { data: papers = [], isLoading, isError, refetch } = usePapers(selectedClassId ?? undefined);

  const [createState, setCreateState] = useState({
    title: '',
    class_id: null as number | null,
    subject_id: null as number | null,
    total_points: 100,
  });

  const [showSubjectDialog, setShowSubjectDialog] = useState(false);
  const [subjectName, setSubjectName] = useState('');

  const classOptions = useMemo(() => classes, [classes]);

  // The filter is the strongest hint about which class a new paper is for, so it seeds the form -
  // but only when the teacher has not chosen one themselves.
  useEffect(() => {
    if (selectedClassId === null) return;
    setCreateState((prev) => (prev.class_id === null ? { ...prev, class_id: selectedClassId } : prev));
  }, [selectedClassId]);

  const handleCreatePaper = async () => {
    if (!createState.title.trim()) {
      toast.error('请输入试卷名称');
      return;
    }
    /**
     * The class is required, and this is why.
     *
     * A paper's class is what makes it visible to a pupil: `learning.getPaper` refuses a student
     * whose class is not `paper.class_id`, and the student list is filtered the same way. This form
     * used to offer no class field at all, so every paper was created with `class_id: null` and no
     * teacher could ever publish one a student could open - the editor has no class field either.
     */
    if (createState.class_id === null) {
      toast.error('请选择试卷所属班级');
      return;
    }
    try {
      const created = await papersApi.create({
        title: createState.title.trim(),
        class_id: createState.class_id,
        subject_id: createState.subject_id,
        total_points: createState.total_points,
      });
      toast.success('已创建试卷');
      setCreateState((prev) => ({ ...prev, title: '' }));
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      navigate(`/teacher/papers/${created.data.id}/edit`);
    } catch (error) {
      // Was an empty `catch`: a refusal (or a bad payload) looked like a dead button.
      toast.error(error instanceof Error ? error.message : '创建失败，请重试');
    }
  };

  const handleCreateSubject = async (event: FormEvent) => {
    event.preventDefault();
    const name = subjectName.trim();
    if (!name) return;
    try {
      await knowledgeApi.createSubject({ name });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-subjects'] });
      toast.success('已新增学科');
      setSubjectName('');
      setShowSubjectDialog(false);
    } catch (e) {
      // Was an empty `catch`: a refused subject name looked like a dialog that would not close.
      toast.error(e instanceof Error ? e.message : '新增学科失败，请重试');
    }
  };

  const handlePublish = async (paperId: number) => {
    try {
      await papersApi.update(paperId, { status: 'published' });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('已发布');
    } catch (e) {
      /**
       * Was an empty `catch`, and this is the one that mattered: the backend refuses to publish a
       * paper with no questions (400). The button looked dead - the row kept saying 草稿 with no
       * reason given - so the teacher's next move was to press it again.
       */
      toast.error(e instanceof Error ? e.message : '发布失败，请重试');
    }
  };

  const handleUnpublish = async (paperId: number) => {
    try {
      await papersApi.update(paperId, { status: 'draft' });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('已取消发布');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '取消发布失败，请重试');
    }
  };

  // The page's primary action, reachable from the command palette as well as the toolbar.
  useRegisterPageCommands([
    {
      id: 'teacher-papers:create',
      label: '创建',
      icon: Plus,
      keywords: ['试卷', '新建'],
      run: () => void handleCreatePaper(),
    },
  ]);

  return (
    <PageScaffold
      variant="list"
      title="试卷库"
      actions={
        <Button variant="outline" onClick={() => setShowSubjectDialog(true)}>
          管理学科
        </Button>
      }
      toolbar={
        <Toolbar
          filters={
            <>
              <FormField label="新建试卷" className="w-full sm:w-72">
                <Input
                  value={createState.title}
                  onChange={(e) => setCreateState((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="试卷名称"
                />
              </FormField>
              <FormField label="班级筛选" className="w-full sm:w-44">
                <Select
                  value={selectedClassId ?? ''}
                  onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">全部班级</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="新建试卷班级" className="w-full sm:w-44">
                <Select
                  aria-label="新建试卷班级"
                  value={createState.class_id ?? ''}
                  onChange={(e) =>
                    setCreateState((prev) => ({ ...prev, class_id: e.target.value ? Number(e.target.value) : null }))
                  }
                >
                  <option value="">请选择班级</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="新建默认学科" className="w-full sm:w-44">
                <Select
                  value={createState.subject_id ?? ''}
                  onChange={(e) => setCreateState((prev) => ({ ...prev, subject_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">不设置</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </>
          }
          actions={
            <Button onClick={handleCreatePaper}>
              <Plus data-icon="inline-start" />
              创建
            </Button>
          }
        />
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-fg-3">
          <Spinner label="正在加载试卷" />
          正在加载试卷...
        </div>
      ) : isError ? (
        <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
          <p className="font-semibold text-danger">试卷列表加载失败</p>
          <p className="mt-1 text-sm text-fg-3">这不代表试卷库是空的，请重试。</p>
          <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      ) : papers.length === 0 ? (
        <EmptyState icon={FileText} title="暂无试卷" />
      ) : (
        <div className="space-y-3">
          {papers.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-card border border-line-1 bg-surface-2 p-5 shadow-card md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate font-bold text-fg-1">{p.title}</div>
                <div className="text-sm text-fg-3">
                  状态：{p.status} {p.subjects?.name ? `· 学科：${p.subjects.name}` : ''} {p.class_id ? `· 班级ID：${p.class_id}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/teacher/papers/${p.id}/edit`)}
                >
                  编辑
                </Button>
                {p.status === 'published' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleUnpublish(p.id)}
                  >
                    取消发布
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handlePublish(p.id)}
                  >
                    发布
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/teacher/papers/${p.id}/edit#upload`)}
                >
                  <UploadCloud data-icon="inline-start" />
                  上传试卷
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showSubjectDialog} onOpenChange={setShowSubjectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>管理学科</DialogTitle>
            <DialogDescription>请输入学科名称（如：数学）</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubject} className="flex flex-col gap-4">
            <FormField label="学科名称" required>
              <Input
                required
                value={subjectName}
                onChange={(event) => setSubjectName(event.target.value)}
                placeholder="例如：数学"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSubjectDialog(false)}>
                取消
              </Button>
              <Button type="submit">确认新增</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
