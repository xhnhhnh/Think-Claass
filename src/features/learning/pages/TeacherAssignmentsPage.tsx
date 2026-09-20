import { useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Edit, FileText, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { assignmentsApi } from '@/features/learning/api/assignmentsApi';
import {
  useAssignments,
  useCreateAssignmentMutation,
  useDeleteAssignmentMutation,
  useUpdateStudentAssignmentMutation,
} from '@/features/learning/hooks/useAssignments';
import { useStudents } from '@/hooks/queries/useStudents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Textarea } from '@/components/ui/textarea';

/** One `student_assignments` row joined with the submitting student's name. */
interface Submission {
  id: number;
  assignmentId: number;
  studentName: string;
  content: string | null;
  status: string;
  score: number | null;
}

const submissionKeys = {
  all: ['assignment-submissions'] as const,
  byAssignment: (assignmentId: number) => ['assignment-submissions', assignmentId] as const,
};

/** Today as `YYYY-MM-DD` in local time, so a due date compares as a plain string. */
function localDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 作业管理.
 *
 * The submissions list is real: one
 * `GET /api/assignments/student-assignments?assignment_id=` per assignment of the
 * class, because that endpoint filters by assignment and `StudentAssignment` carries
 * `student_id` without a name - the name is joined from `GET /api/students?classId=`.
 * Grading writes `score` / `teacher_feedback` through
 * `PUT /api/assignments/student-assignments/:id`; nothing is graded in local state.
 */
export default function TeacherAssignments() {
  const user = useStore((state) => state.user);
  const queryClient = useQueryClient();
  const classId = user?.class_id ?? 1;
  const teacherId = user?.id ?? 1;
  const { data: assignments = [] } = useAssignments(classId);
  const { data: students = [] } = useStudents(classId);
  const createAssignmentMutation = useCreateAssignmentMutation(classId);
  const deleteAssignmentMutation = useDeleteAssignmentMutation(classId);
  const updateSubmissionMutation = useUpdateStudentAssignmentMutation();

  const submissionQueries = useQueries({
    queries: assignments.map((assignment) => ({
      queryKey: submissionKeys.byAssignment(assignment.id),
      queryFn: async () =>
        (await assignmentsApi.listStudentAssignments({ assignmentId: assignment.id })).data,
    })),
  });

  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const studentNames = new Map(students.map((student) => [student.id, student.name]));
  const submissions: Submission[] = submissionQueries
    .flatMap((query) => query.data ?? [])
    .filter((row) => assignmentIds.has(row.assignment_id))
    .map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      studentName: studentNames.get(row.student_id) ?? `学生 #${row.student_id}`,
      content: row.content,
      status: row.status,
      score: row.score,
    }));
  const submissionsLoading = submissionQueries.some((query) => query.isLoading);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  const today = localDateString();

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createAssignmentMutation.mutateAsync({
      class_id: classId,
      teacher_id: teacherId,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      due_date: newDueDate || null,
      reward_points: 0,
    });
    setShowCreateModal(false);
    setNewTitle('');
    setNewDesc('');
    setNewDueDate('');
    toast.success('作业发布成功');
  };

  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSubmission || !gradeInput) return;

    const score = Number.parseInt(gradeInput, 10);
    if (Number.isNaN(score)) return;

    try {
      await updateSubmissionMutation.mutateAsync({
        id: currentSubmission.id,
        payload: { status: 'graded', score, teacher_feedback: feedbackInput.trim() || null },
      });
    } catch {
      // The api layer already surfaced the failure; keep the dialog open to retry.
      return;
    }
    await queryClient.invalidateQueries({ queryKey: submissionKeys.all });
    setShowGradeModal(false);
    toast.success('批改完成');
  };

  const deleteAssignment = async (id: number) => {
    await deleteAssignmentMutation.mutateAsync(id);
    toast.success('作业已删除');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="作业管理"
        icon={FileText}
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <PlusCircle data-icon="inline-start" />
            发布作业
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Assignments List */}
        <SectionCard title="已发布的作业">
          {assignments.length === 0 ? (
            <EmptyState icon={FileText} title="暂无发布的作业" />
          ) : (
            <div className="space-y-4">
              {assignments.map(assignment => {
                const closed = !!assignment.due_date && assignment.due_date < today;
                return (
                  <div key={assignment.id} className="rounded-card border border-border bg-muted/50 p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h4 className="font-bold text-ink-1">{assignment.title}</h4>
                      <Badge variant={closed ? 'secondary' : 'default'}>
                        {closed ? '已截止' : '进行中'}
                      </Badge>
                    </div>
                    <p className="mb-3 text-sm text-ink-2">{assignment.description}</p>
                    <div className="flex items-center justify-between text-xs text-ink-3">
                      <span>截止日期: {assignment.due_date || '无'}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`删除${assignment.title}`}
                        title="删除"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => deleteAssignment(assignment.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Submissions List */}
        <SectionCard title="学生提交">
          {submissionsLoading ? (
            <p className="py-6 text-center text-sm text-ink-3">加载中...</p>
          ) : submissions.length === 0 ? (
            <EmptyState icon={FileText} title="暂无学生提交" />
          ) : (
            <div className="space-y-4">
              {submissions.map(sub => {
                const assignment = assignments.find(a => a.id === sub.assignmentId);
                return (
                  <div key={sub.id} className="rounded-card border border-border p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="font-medium text-ink-1">
                        {sub.studentName} <span className="text-sm text-ink-3">提交了</span> {assignment?.title ?? `作业 #${sub.assignmentId}`}
                      </div>
                      {sub.status === 'graded' ? (
                        <Badge variant="success">
                          {sub.score === null ? '已批改' : `已批改: ${sub.score}分`}
                        </Badge>
                      ) : sub.status === 'submitted' ? (
                        <Badge variant="warning">待批改</Badge>
                      ) : (
                        <Badge variant="secondary">未提交</Badge>
                      )}
                    </div>
                    <p className="mb-3 rounded-card bg-muted/50 p-2 text-sm text-ink-2">
                      {sub.content ?? '（未填写提交内容）'}
                    </p>

                    {sub.status === 'submitted' && (
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCurrentSubmission(sub);
                            setGradeInput('');
                            setFeedbackInput('');
                            setShowGradeModal(true);
                          }}
                        >
                          <Edit data-icon="inline-start" />
                          去批改
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Create Assignment Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>发布新作业</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAssignment} className="flex flex-col gap-4">
            <FormField label="作业标题" required>
              <Input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="输入作业标题"
              />
            </FormField>
            <FormField label="作业内容要求" required>
              <Textarea
                required
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                placeholder="输入详细的作业要求..."
              />
            </FormField>
            <FormField label="截止日期">
              <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                取消
              </Button>
              <Button type="submit">确认发布</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Grade Modal */}
      <Dialog open={showGradeModal && currentSubmission !== null} onOpenChange={setShowGradeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批改作业 - {currentSubmission?.studentName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGradeSubmit} className="flex flex-col gap-4">
            <div className="rounded-card bg-muted/50 p-3 text-sm text-ink-2">
              <strong>提交内容：</strong><br/>
              {currentSubmission?.content ?? '（未填写提交内容）'}
            </div>
            <FormField label="分数 (0-100)" required>
              <Input
                type="number"
                required
                min="0"
                max="100"
                value={gradeInput}
                onChange={(e) => setGradeInput(e.target.value)}
                placeholder="例如：95"
              />
            </FormField>
            <FormField label="评语反馈">
              <Textarea
                value={feedbackInput}
                onChange={(e) => setFeedbackInput(e.target.value)}
                rows={2}
                placeholder="写点评语鼓励一下学生吧..."
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowGradeModal(false)}>
                取消
              </Button>
              <Button type="submit" disabled={updateSubmissionMutation.isPending}>提交批改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
