import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, FileSpreadsheet, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { examsApi, type Exam } from '@/features/learning/api/examsApi';
import { apiErrorMessage } from '@/lib/api';
import { useExamGrades, useExams } from '@/features/learning/hooks/useExams';
import { useClasses } from '@/hooks/queries/useClasses';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
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
import { KpiStrip } from '@/components/ui/kpi-strip';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRegisterPageCommands } from '@/app/commands/registry';

/**
 * 考试与成绩.
 *
 * Two hand-rolled fixed-overlay modals, nine raw buttons, four raw inputs and a
 * `` className={`…${…}`} `` status colour are gone: the modals are `Dialog`s, the
 * controls are kit primitives, and the status is a `Badge` tone. The grade rows have
 * no visible label to borrow a name from - the table header above them is the label -
 * so each score input carries an `aria-label` built from the student's name.
 *
 * `TeacherExamsPage.test.tsx` reaches this page by placeholder, by displayed value
 * and by button name (`新建考试`, `确认新建`, `录入成绩`, `保存成绩`), all of which are
 * unchanged.
 */
export default function TeacherExams() {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const { data: classes = [] } = useClasses();
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const teacherId = user?.id ?? 1;

  /**
   * The class comes from the teacher's own class list.
   *
   * A teacher's login carries no `class_id` - only a student's and a parent's do (`identity.login`) -
   * so `user?.class_id ?? 1` silently made class 1 the working class for every teacher. Creating an
   * exam then wrote the exam *and one `student_exams` row per pupil of class 1* while the list
   * (filtered by the teacher's own id) showed the teacher their own rows. The class dashboard,
   * attendance and the analytics page all pick from `useClasses`; this page does the same.
   */
  useEffect(() => {
    if (selectedClassId === null && classes.length > 0) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  const classId = selectedClassId;

  const { data: exams = [], isLoading, error, refetch } = useExams(classId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTotalScore, setNewTotalScore] = useState('100');
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [createError, setCreateError] = useState('');
  const [editingGrades, setEditingGrades] = useState<Record<number, string>>({});
  /**
   * Exams whose grade sheet has been loaded *or saved* and has at least one score.
   *
   * The badge used to be computed from `currentExam` only, so on page load every exam read
   * 「待录入成绩」 even when grades existed, and after opening a second exam the first one flipped
   * back to 「待录入」. Recorded-ness is a property of the row that survives the dialog closing.
   */
  const [recordedExamIds, setRecordedExamIds] = useState<Set<number>>(() => new Set());

  const { data: examGradesData, isLoading: isGradesLoading } = useExamGrades(currentExam?.id ?? null, showGradeModal);

  useEffect(() => {
    if (!examGradesData?.grades) return;
    const nextState: Record<number, string> = {};
    for (const grade of examGradesData.grades) {
      nextState[grade.student_id] = grade.score === null ? '' : grade.score.toString();
    }
    setEditingGrades(nextState);

    // Remember what this read said about the exam, so the list badge does not depend on the dialog
    // staying open on that one row.
    if (currentExam) {
      const examId = currentExam.id;
      const hasAnyGrade = examGradesData.grades.some((grade) => grade.score !== null);
      setRecordedExamIds((prev) => {
        if (prev.has(examId) === hasAnyGrade) return prev;
        const next = new Set(prev);
        if (hasAnyGrade) next.add(examId);
        else next.delete(examId);
        return next;
      });
    }
  }, [examGradesData, currentExam]);

  const createMutation = useMutation({
    mutationFn: examsApi.createExam,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exams', classId] });
      // The analytics page's "近期考试趋势" is built from these rows; without this it kept the old
      // series for the whole 5-minute stale window.
      await queryClient.invalidateQueries({ queryKey: ['analytics', 'class-overview', classId] });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewDate('');
      setNewTotalScore('100');
      setCreateError('');
      toast.success('考试创建成功');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: examsApi.deleteExam,
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ['exams', classId] });
      if (currentExam?.id === deletedId) {
        setCurrentExam(null);
        setShowGradeModal(false);
      }
      toast.success('考试已删除');
    },
  });

  const saveGradesMutation = useMutation({
    mutationFn: async () => {
      if (!currentExam || !examGradesData?.grades) {
        throw new Error('当前没有可保存的成绩')
      }

      await examsApi.saveExamGrades(
        currentExam.id,
        examGradesData.grades.map((grade) => ({
          student_id: grade.student_id,
          score: editingGrades[grade.student_id] === '' ? null : Number(editingGrades[grade.student_id] ?? ''),
        })),
      );
    },
    onSuccess: async () => {
      if (currentExam) {
        const examId = currentExam.id;
        const hasAnyScore = Object.values(editingGrades).some((value) => String(value).trim() !== '');
        setRecordedExamIds((prev) => {
          if (prev.has(examId) === hasAnyScore) return prev;
          const next = new Set(prev);
          if (hasAnyScore) next.add(examId);
          else next.delete(examId);
          return next;
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['exam-grades', currentExam.id] }),
          queryClient.invalidateQueries({ queryKey: ['exams', classId] }),
          queryClient.invalidateQueries({ queryKey: ['analytics', 'class-overview', classId] }),
        ]);
      }
      setShowGradeModal(false);
      toast.success('成绩录入成功');
    },
  });

  const handleCreateExam = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newTotalScore) return;
    if (classId === null) {
      toast.error('请先选择班级');
      return;
    }
    if (createMutation.isPending) return;

    try {
      await createMutation.mutateAsync({
        class_id: classId,
        teacher_id: teacherId,
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        exam_date: newDate || null,
        total_score: parseInt(newTotalScore, 10),
      });
    } catch (error) {
      // Inline, with the server's own sentence; the typed exam stays in the dialog.
      setCreateError(apiErrorMessage(error, '创建失败，请重试'));
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // The api layer already toasted the server's reason; the confirm stays open for a retry.
    }
  };

  const openGradeModal = (exam: Exam) => {
    setCurrentExam(exam);
    setShowGradeModal(true);
  };

  const handleSaveGrades = async () => {
    try {
      await saveGradesMutation.mutateAsync();
    } catch {
      // The api layer already toasted the failure; the typed scores stay in the dialog.
    }
  };

  // The page's primary action, reachable from the command palette as well as the context bar.
  useRegisterPageCommands([
    {
      id: 'teacher-exams:create',
      label: '新建考试',
      icon: PlusCircle,
      keywords: ['考试', '新建', '成绩'],
      run: () => setShowCreateModal(true),
    },
  ]);

  return (
    <PageScaffold
      variant="dashboard"
      title="考试与成绩"
      actions={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-fg-2">
            当前班级
            <Select
              aria-label="选择班级"
              value={classId ?? ''}
              onChange={(event) => setSelectedClassId(Number(event.target.value))}
              className="min-w-40 rounded-card border border-line-1 bg-surface-2 px-3 py-2 text-fg-1"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </Select>
          </label>
          <Button onClick={() => setShowCreateModal(true)} disabled={classId === null}>
            <PlusCircle data-icon="inline-start" />
            新建考试
          </Button>
        </div>
      }
    >

      <div className="space-y-5">
        {!isLoading && !error && classes.length > 0 ? (
          <KpiStrip
            items={[
              { label: '考试总数', value: exams.length, icon: FileSpreadsheet, tone: 'role' },
              { label: '待录入成绩', value: exams.filter((exam) => !recordedExamIds.has(exam.id)).length, icon: Award, tone: 'warning' },
              { label: '已录入成绩', value: exams.filter((exam) => recordedExamIds.has(exam.id)).length, icon: CheckCircle2, tone: 'success' },
            ]}
          />
        ) : null}

        {isLoading ? (
          <div className="space-y-2 rounded-card border border-line-1 bg-surface-2 p-4" aria-busy="true" aria-label="正在加载考试列表">
            {[0, 1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-14 w-full" />)}
          </div>
        ) : error ? (
          <div className="rounded-card border border-danger/20 bg-danger-soft px-6 py-10 text-center">
            <p className="font-semibold text-danger">考试列表加载失败</p>
            <p className="mt-1 text-body-sm text-fg-3">这不代表没有考试，请重试。</p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              重新加载
            </Button>
          </div>
        ) : classes.length === 0 ? (
          <EmptyState icon={Award} title="还没有班级" description="请先在教师工作台创建班级，再安排考试。" />
        ) : exams.length === 0 ? (
          <EmptyState
            icon={Award}
            title="还没有安排任何考试"
            description="新建一场考试后，就可以在这里录入成绩。"
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <PlusCircle data-icon="inline-start" />
                新建考试
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-line-1 bg-surface-2">
            <div className="flex items-center gap-4 border-b border-line-1 bg-surface-3/40 px-4 py-2 text-caption text-fg-3">
              <span className="min-w-0 flex-1">考试</span>
              <span className="hidden w-28 sm:block">日期</span>
              <span className="hidden w-14 text-right sm:block">总分</span>
              <span className="w-28">状态</span>
              <span className="w-28 text-right">操作</span>
            </div>
            <div className="divide-y divide-line-2">
              {exams.map((exam) => (
                <div key={exam.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-fg-1">{exam.title}</p>
                    <p className="mt-0.5 truncate text-caption text-fg-3">{exam.description || '暂无说明'}</p>
                  </div>
                  <span className="hidden w-28 shrink-0 text-body-sm text-fg-2 sm:block">
                    {exam.exam_date || '未定'}
                  </span>
                  <span className="hidden w-14 shrink-0 text-right text-body-sm font-medium text-fg-2 tabular-nums sm:block">
                    {exam.total_score}
                  </span>
                  <span className="w-28 shrink-0">
                    <Badge variant={recordedExamIds.has(exam.id) ? 'success' : 'warning'}>
                      {recordedExamIds.has(exam.id) ? '已录入' : '待录入'}
                    </Badge>
                  </span>
                  <div className="flex w-28 shrink-0 justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => openGradeModal(exam)}>
                      录入成绩
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除${exam.title}`}
                      title="删除"
                      className="text-danger hover:bg-danger-soft hover:text-danger-ink"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteTarget(exam)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) setCreateError('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建考试</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateExam} className="flex flex-col gap-4">
            <FormField label="考试名称" required>
              <Input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例如：期中考试"
              />
            </FormField>
            <FormField label="考试说明">
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                placeholder="可填写考试范围、注意事项等"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="考试日期">
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </FormField>
              <FormField label="总分" required>
                <Input
                  type="number"
                  min="1"
                  required
                  value={newTotalScore}
                  onChange={(e) => setNewTotalScore(e.target.value)}
                />
              </FormField>
            </div>
            {createError && (
              <p role="alert" className="rounded-card border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                {createError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? '创建中...' : '确认新建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showGradeModal && currentExam !== null} onOpenChange={setShowGradeModal}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>成绩录入</DialogTitle>
            <DialogDescription>{currentExam?.title}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {isGradesLoading ? (
              <div className="flex items-center justify-center gap-3 py-10 text-fg-3">
                <Spinner label="正在加载成绩数据" />
                正在加载成绩数据...
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between rounded-card bg-surface-3/50 px-4 py-2 text-sm font-bold text-fg-2">
                  <span>学生姓名</span>
                  <span>分数</span>
                </div>
                {(examGradesData?.grades ?? []).map((grade) => (
                  <div
                    key={grade.student_id}
                    className="flex items-center justify-between gap-4 border-b border-line-1 px-4 py-2"
                  >
                    <span className="font-medium text-fg-1">{grade.student_name}</span>
                    <Input
                      type="number"
                      min="0"
                      max={currentExam?.total_score}
                      aria-label={`${grade.student_name}分数`}
                      value={editingGrades[grade.student_id] || ''}
                      onChange={(e) => setEditingGrades((prev) => ({ ...prev, [grade.student_id]: e.target.value }))}
                      className="w-24 text-center"
                      placeholder="未录入"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGradeModal(false)}>
              取消
            </Button>
            <Button onClick={handleSaveGrades} disabled={saveGradesMutation.isPending || isGradesLoading}>
              {saveGradesMutation.isPending ? '保存中...' : '保存成绩'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        destructive
        title="删除这场考试？"
        description={
          deleteTarget
            ? `「${deleteTarget.title}」以及已经录入的成绩都会被删除，且无法恢复。`
            : '删除后无法恢复。'
        }
        confirmLabel="删除"
        pendingLabel="删除中..."
        isPending={deleteMutation.isPending}
        onConfirm={() => void handleDeleteExam()}
      />
    </PageScaffold>
  );
}
