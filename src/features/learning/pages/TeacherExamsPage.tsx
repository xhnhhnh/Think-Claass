import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, FileSpreadsheet, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { examsApi, type Exam } from '@/features/learning/api/examsApi';
import { useExamGrades, useExams } from '@/features/learning/hooks/useExams';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

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
  const classId = user?.class_id ?? 1;
  const teacherId = user?.id ?? 1;

  const { data: exams = [], isLoading, error } = useExams(classId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTotalScore, setNewTotalScore] = useState('100');
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [editingGrades, setEditingGrades] = useState<Record<number, string>>({});

  const { data: examGradesData, isLoading: isGradesLoading } = useExamGrades(currentExam?.id ?? null, showGradeModal);

  useEffect(() => {
    if (!examGradesData?.grades) return;
    const nextState: Record<number, string> = {};
    for (const grade of examGradesData.grades) {
      nextState[grade.student_id] = grade.score === null ? '' : grade.score.toString();
    }
    setEditingGrades(nextState);
  }, [examGradesData]);

  const createMutation = useMutation({
    mutationFn: examsApi.createExam,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exams', classId] });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewDate('');
      setNewTotalScore('100');
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
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['exam-grades', currentExam.id] }),
          queryClient.invalidateQueries({ queryKey: ['exams', classId] }),
        ]);
      }
      setShowGradeModal(false);
      toast.success('成绩录入成功');
    },
  });

  const handleCreateExam = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newTotalScore) return;

    await createMutation.mutateAsync({
      class_id: classId,
      teacher_id: teacherId,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      exam_date: newDate || null,
      total_score: parseInt(newTotalScore, 10),
    });
  };

  const handleDeleteExam = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const openGradeModal = (exam: Exam) => {
    setCurrentExam(exam);
    setShowGradeModal(true);
  };

  const handleSaveGrades = async () => {
    try {
      await saveGradesMutation.mutateAsync();
    } catch (mutationError: any) {
      toast.error(mutationError.message || '保存失败，请重试');
    }
  };

  const hasRecordedGrades = (examId: number) => {
    if (currentExam?.id !== examId || !examGradesData?.grades) return false;
    return examGradesData.grades.some((grade) => grade.score !== null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="考试与成绩"
        icon={Award}
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <PlusCircle data-icon="inline-start" />
            新建考试
          </Button>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center gap-3 rounded-panel border border-border bg-paper py-16 text-ink-3">
          <Spinner label="正在加载考试列表" />
          正在加载考试列表...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-panel border border-destructive/20 bg-destructive/10 px-6 py-10 text-center text-destructive">
          考试列表加载失败，请稍后重试
        </div>
      )}

      {!isLoading && !error && exams.length === 0 && (
        <EmptyState icon={Award} title="还没有安排任何考试" />
      )}

      {!isLoading && !error && exams.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="h-full">
              <CardContent className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge variant="secondary">总分 {exam.total_score}</Badge>
                    <h3 className="mt-3 text-lg font-bold break-words text-ink-1">{exam.title}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除${exam.title}`}
                    title="删除"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDeleteExam(exam.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="flex-grow space-y-2 text-sm text-ink-3">
                  <p>考试日期: {exam.exam_date || '未定'}</p>
                  <p>说明: {exam.description || '暂无说明'}</p>
                  <p className="flex items-center gap-2">
                    状态:
                    <Badge variant={hasRecordedGrades(exam.id) ? 'success' : 'warning'}>
                      {hasRecordedGrades(exam.id) ? '已录入部分成绩' : '待录入成绩'}
                    </Badge>
                  </p>
                </div>

                <Button variant="outline" className="w-full" onClick={() => openGradeModal(exam)}>
                  <FileSpreadsheet data-icon="inline-start" />
                  录入成绩
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
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
              <div className="flex items-center justify-center gap-3 py-10 text-ink-3">
                <Spinner label="正在加载成绩数据" />
                正在加载成绩数据...
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between rounded-card bg-muted/50 px-4 py-2 text-sm font-bold text-ink-2">
                  <span>学生姓名</span>
                  <span>分数</span>
                </div>
                {(examGradesData?.grades ?? []).map((grade) => (
                  <div
                    key={grade.student_id}
                    className="flex items-center justify-between gap-4 border-b border-border px-4 py-2"
                  >
                    <span className="font-medium text-ink-1">{grade.student_name}</span>
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
    </div>
  );
}
