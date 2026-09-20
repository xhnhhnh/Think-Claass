import { useState } from 'react';
import { Edit, FileText, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useAssignments, useCreateAssignmentMutation, useDeleteAssignmentMutation } from '@/features/learning/hooks/useAssignments';
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

interface Assignment {
  id: number;
  title: string;
  description: string;
  dueDate: string;
  classId: number;
  status: 'active' | 'closed';
}

interface Submission {
  id: number;
  studentName: string;
  assignmentId: number;
  content: string;
  status: 'submitted' | 'graded';
  grade?: number;
  feedback?: string;
}

/**
 * 作业管理.
 *
 * Two fixed-overlay modals became `Dialog`s, so the close buttons, the submit buttons
 * and the four form controls came with them. The two lists are `SectionCard`s - the
 * page was a pair of hand-built `bg-white/80` boxes - and the status chips are
 * `Badge` tones instead of four `bg-*-100 text-*-700` pairs. The submissions block is
 * still seeded locally: the page has no submissions endpoint, and inventing one is not
 * this phase's job.
 */
export default function TeacherAssignments() {
  const user = useStore((state) => state.user);
  const classId = user?.class_id ?? 1;
  const teacherId = user?.id ?? 1;
  const { data: assignmentRows = [] } = useAssignments(classId);
  const createAssignmentMutation = useCreateAssignmentMutation(classId);
  const deleteAssignmentMutation = useDeleteAssignmentMutation(classId);
  const assignments: Assignment[] = assignmentRows.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? '',
    dueDate: assignment.due_date ?? '',
    classId: assignment.class_id,
    status: 'active',
  }));
  const [submissions, setSubmissions] = useState<Submission[]>([
    { id: 1, studentName: '张三', assignmentId: 1, content: '已完成所有练习题，拍照上传。', status: 'submitted' },
    { id: 2, studentName: '李四', assignmentId: 1, content: '最后一题不会做。', status: 'graded', grade: 85, feedback: '再接再厉' }
  ]);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

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

  const handleGradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSubmission || !gradeInput) return;
    
    setSubmissions(submissions.map(s => 
      s.id === currentSubmission.id 
        ? { ...s, status: 'graded', grade: parseInt(gradeInput), feedback: feedbackInput }
        : s
    ));
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
              {assignments.map(assignment => (
                <div key={assignment.id} className="rounded-card border border-border bg-muted/50 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h4 className="font-bold text-ink-1">{assignment.title}</h4>
                    <Badge variant={assignment.status === 'active' ? 'default' : 'secondary'}>
                      {assignment.status === 'active' ? '进行中' : '已结束'}
                    </Badge>
                  </div>
                  <p className="mb-3 text-sm text-ink-2">{assignment.description}</p>
                  <div className="flex items-center justify-between text-xs text-ink-3">
                    <span>截止日期: {assignment.dueDate || '无'}</span>
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
              ))}
            </div>
          )}
        </SectionCard>

        {/* Submissions List */}
        <SectionCard title="学生提交">
          <div className="space-y-4">
            {submissions.map(sub => {
              const assignment = assignments.find(a => a.id === sub.assignmentId);
              return (
                <div key={sub.id} className="rounded-card border border-border p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-medium text-ink-1">
                      {sub.studentName} <span className="text-sm text-ink-3">提交了</span> {assignment?.title}
                    </div>
                    {sub.status === 'graded' ? (
                      <Badge variant="success">已批改: {sub.grade}分</Badge>
                    ) : (
                      <Badge variant="warning">待批改</Badge>
                    )}
                  </div>
                  <p className="mb-3 rounded-card bg-muted/50 p-2 text-sm text-ink-2">{sub.content}</p>
                  
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
              {currentSubmission?.content}
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
              <Button type="submit">提交批改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
