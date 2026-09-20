import { useState } from 'react';
import { AlertCircle, Award, BarChart3, BookOpen, CheckCircle, Clock, FileText, Star, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';

interface Assignment {
  id: number;
  title: string;
  subject: string;
  dueDate: string;
  status: 'pending' | 'submitted' | 'graded';
  score?: number;
}

interface Exam {
  id: number;
  title: string;
  subject: string;
  date: string;
  score: number;
  totalScore: number;
  classAverage: number;
}

/**
 * Subject chips, as complete class strings.
 *
 * The four subjects used to pick indigo/coral/amber/green by `switch`, and `coral` is not
 * a family `tailwind.config.js` registers - two of the four chips had no background at
 * all. The map keeps one hue per subject out of the token set (the parent theme's orange
 * is `primary`), and it is spelled out rather than composed because Tailwind cannot
 * compile a class name it cannot see.
 */
const SUBJECT_TONES: Record<string, string> = {
  数学: 'border-info/20 bg-info/10 text-info',
  语文: 'border-primary/20 bg-primary/5 text-primary',
  英语: 'border-warning/20 bg-warning/10 text-warning',
};

const DEFAULT_SUBJECT_TONE = 'border-success/20 bg-success/10 text-success';

const getSubjectTone = (subject: string) => SUBJECT_TONES[subject] ?? DEFAULT_SUBJECT_TONE;

/**
 * 学习采撷.
 *
 * The three header tiles were gradients in the coral, green and indigo/purple families -
 * coral is not registered in `tailwind.config.js` at all and the other two are off-brand -
 * so they are `StatCard`s now, whose `tone` is an enum. The completion bar was a hard-coded
 * `style={{ width: '75%' }}` that did not even agree with the figure printed above it, and
 * it is the kit's `Progress` fed by the same computation. There is no `PageHeader` here:
 * the shell already prints this route's title, and duplicating it is P6's open question.
 */
export default function ParentAssignments() {
  const [activeTab, setActiveTab] = useState<'assignments' | 'exams'>('assignments');

  const assignments: Assignment[] = [
    { id: 1, title: '数学课后练习', subject: '数学', dueDate: '2023-11-15', status: 'pending' },
    { id: 2, title: '语文阅读分享', subject: '语文', dueDate: '2023-11-14', status: 'submitted' },
    { id: 3, title: '英语单词记忆', subject: '英语', dueDate: '2023-11-10', status: 'graded', score: 95 },
    { id: 4, title: '科学小实验', subject: '科学', dueDate: '2023-11-08', status: 'graded', score: 88 },
  ];

  const exams: Exam[] = [
    { id: 1, title: '期中数学检测', subject: '数学', date: '2023-11-01', score: 92, totalScore: 100, classAverage: 85 },
    { id: 2, title: '期中语文检测', subject: '语文', date: '2023-11-02', score: 88, totalScore: 100, classAverage: 82 },
    { id: 3, title: '英语单元小测', subject: '英语', date: '2023-10-20', score: 95, totalScore: 100, classAverage: 90 },
  ];

  const pendingCount = assignments.filter(a => a.status === 'pending').length;
  const averageScore = Math.round(exams.reduce((acc, curr) => acc + curr.score, 0) / (exams.length || 1));
  const completionRate = Math.round(
    (assignments.filter(a => a.status !== 'pending').length / assignments.length) * 100,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          label="待完成学习"
          value={
            <>
              {pendingCount}
              <span className="ml-1 text-sm font-medium text-ink-3">项</span>
            </>
          }
          icon={Clock}
          tone="warning"
          hint="陪伴宝贝一起完成吧"
        />
        <StatCard
          label="平均成绩"
          value={
            <>
              {averageScore}
              <span className="ml-1 text-sm font-medium text-ink-3">分</span>
            </>
          }
          icon={BarChart3}
          tone="success"
          hint={
            <span className="flex items-center gap-1.5">
              <TrendingUp aria-hidden="true" className="size-4" />
              表现很棒哦
            </span>
          }
        />
        <StatCard
          label="学习完成率"
          value={
            <>
              {completionRate}
              <span className="ml-1 text-sm font-medium text-ink-3">%</span>
            </>
          }
          icon={CheckCircle}
          tone="info"
          hint={
            <Progress
              value={completionRate}
              label={`学习完成率 ${completionRate}%`}
              tone="info"
              className="mt-2"
            />
          }
        />
      </div>

      <Card className="gap-0 py-0">
        {/*
          The two raw buttons were an underline tab strip. A two-way switch is the kit's
          segmented control instead - `Button` owns its own border and radius, so an
          underline would have to be fought through them - and it is also where
          `aria-pressed` comes from.
        */}
        <div className="border-b border-border p-4">
          <div className="flex w-fit rounded-lg border border-border bg-muted/50 p-1">
            <Button
              type="button"
              variant={activeTab === 'assignments' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={activeTab === 'assignments'}
              onClick={() => setActiveTab('assignments')}
            >
              <BookOpen data-icon="inline-start" />
              学习记录
            </Button>
            <Button
              type="button"
              variant={activeTab === 'exams' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={activeTab === 'exams'}
              onClick={() => setActiveTab('exams')}
            >
              <Award data-icon="inline-start" />
              闪光成绩
            </Button>
          </div>
        </div>

        <CardContent className="p-5">
          {activeTab === 'assignments' ? (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex flex-col justify-between gap-4 rounded-panel border border-border bg-muted/50 p-5 md:flex-row md:items-center"
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={cn(
                        'shrink-0 rounded-card border px-3 py-1.5 text-sm font-bold',
                        getSubjectTone(assignment.subject),
                      )}
                    >
                      {assignment.subject}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold tracking-wide text-ink-1">{assignment.title}</h3>
                      <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-3">
                        <Clock aria-hidden="true" className="size-4" />
                        截止: {assignment.dueDate}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:w-48 md:justify-end">
                    {assignment.status === 'pending' && (
                      <Badge variant="warning">
                        <AlertCircle data-icon="inline-start" />
                        待完成
                      </Badge>
                    )}
                    {assignment.status === 'submitted' && (
                      <Badge variant="info">
                        <FileText data-icon="inline-start" />
                        老师查看中
                      </Badge>
                    )}
                    {assignment.status === 'graded' && (
                      <div className="text-right">
                        <span className="block text-xs font-bold uppercase tracking-widest text-ink-3">得分</span>
                        <span className="text-2xl font-bold text-success">{assignment.score}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {exams.map((exam) => (
                <div key={exam.id} className="rounded-panel border border-border bg-muted/50 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'rounded-card border px-3 py-1.5 text-sm font-bold',
                          getSubjectTone(exam.subject),
                        )}
                      >
                        {exam.subject}
                      </span>
                      <span className="text-sm font-medium tracking-wider text-ink-3">{exam.date}</span>
                    </div>
                    {exam.score >= 90 && (
                      <Badge variant="warning">
                        <Star data-icon="inline-start" className="fill-current" />
                        太棒啦
                      </Badge>
                    )}
                  </div>

                  <h3 className="mt-4 text-lg font-bold tracking-wide text-ink-1">{exam.title}</h3>

                  <div className="mt-5 flex items-end justify-between rounded-panel border border-border bg-paper p-5">
                    <div>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-ink-3">
                        班级平均分
                      </span>
                      <span className="text-xl font-bold text-ink-2">{exam.classAverage}</span>
                    </div>
                    <div className="text-right">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-ink-3">
                        宝贝得分
                      </span>
                      <div className="flex items-baseline justify-end">
                        <span
                          className={cn(
                            'text-3xl font-bold tracking-tight',
                            exam.score >= exam.classAverage ? 'text-success' : 'text-warning',
                          )}
                        >
                          {exam.score}
                        </span>
                        <span className="ml-1.5 text-sm font-medium text-ink-3">/ {exam.totalScore}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
