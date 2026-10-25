/**
 * First-run guidance for a teacher with no class yet.
 *
 * ## Why this exists
 *
 * The application boots with an empty database on purpose: `api/db.ts` seeds no example teacher, no
 * default class, no shop items and no point presets, and the superadmin is the only account that
 * exists after `install.sh`. That is the right call for a real deployment - fabricated data in a
 * product that stores children's names is a liability - but it left the first screen a teacher sees
 * completely blank: an empty class list, and the 19 `enable_*` switches only become reachable once
 * a class exists to hold them.
 *
 * So this is not seeded data and not a demo. It is a short, dismissible sequence that walks the one
 * teacher who owns the instance through the three things that have to exist before anything else
 * works, using the same endpoints the ordinary pages use:
 *
 *   1. `POST /api/classes` - a class, which also mints its invite code
 *   2. `POST /api/students/batch-import` - the roster, which creates the logins
 *   3. `PUT /api/classes/:id/features` - the 19 feature flags, which a new class starts with OFF
 *
 * ## Why it is dismissible and not a hard gate
 *
 * A teacher may want to import a roster from a file first, or simply look around. The wizard is a
 * scaffold, not a mode: "先跳过" records the choice locally and the ordinary dashboard renders
 * underneath. It is offered only on a browser that saw the account empty (see `useFirstRun`), so it
 * never reappears for a teacher who already had classes, while a class created *inside* the wizard
 * does not tear the remaining steps down.
 */

import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Compass, GraduationCap, ListChecks, Users } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import ClassFeaturePanel from '@/pages/Teacher/components/ClassFeaturePanel';
import { apiErrorMessage } from '@/lib/api';
import { classroomApi } from '@/features/classroom/api/classesApi';
import { studentsApi } from '@/features/classroom/api/studentsApi';
import { useClasses } from '@/hooks/queries/useClasses';
import { parseRoster } from './rosterInput';

/** The steps, in order. `features` is the last one that changes anything. */
const STEPS = [
  { key: 'class', title: '创建班级', icon: GraduationCap },
  { key: 'students', title: '添加学生', icon: Users },
  { key: 'features', title: '开启课堂功能', icon: ListChecks },
  { key: 'done', title: '开始使用', icon: CheckCircle2 },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export function FirstRunWizard({ onFinish }: { onFinish: () => void }) {
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const [step, setStep] = useState<StepKey>('class');
  const [className, setClassName] = useState('');
  const [classId, setClassId] = useState<number | null>(null);
  const [roster, setRoster] = useState('');
  const [imported, setImported] = useState(0);
  /** The last failed step, inline: the api layer already toasted the server's own sentence. */
  const [stepError, setStepError] = useState('');

  const parsed = useMemo(() => parseRoster(roster), [roster]);
  const inviteCode = classes.find((entry) => entry.id === classId)?.invite_code;
  const stepIndex = STEPS.findIndex((entry) => entry.key === step);

  const createClass = useMutation({
    mutationFn: (name: string) => classroomApi.createClass(name),
    onSuccess: async (data) => {
      // The contract is `{ success, class }`; guard rather than assert, because a malformed reply
      // must not leave the wizard stuck on a step it cannot advance from.
      const created = (data as unknown as { class?: { id: number; name: string } }).class;
      if (!created?.id) {
        toast.error('班级已创建，但服务端没有返回班级信息，请刷新后继续');
        return;
      }
      setClassId(created.id);
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      setStepError('');
      toast.success(`班级「${created.name}」已创建`);
      setStep('students');
    },
    onError: (error) => setStepError(apiErrorMessage(error, '班级创建失败，请重试')),
  });

  const importRoster = useMutation({
    mutationFn: (payload: { students: { name: string; username: string }[]; class_id: number }) =>
      studentsApi.batchImportStudents(payload),
    onSuccess: async (data) => {
      const count = (data as unknown as { importedCount?: number }).importedCount ?? parsed.entries.length;
      setImported(count);
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      setStepError('');
      toast.success(`已导入 ${count} 名学生`);
      setStep('features');
    },
    onError: (error) => setStepError(apiErrorMessage(error, '学生导入失败，请检查名单后重试')),
  });

  const StepIcon = STEPS[stepIndex].icon;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-card bg-role-soft">
            <Compass className="size-6 text-role-ink" />
          </div>
          <div>
            <h1 className="text-page-title text-fg-1">欢迎使用 Think-Class</h1>
            <p className="mt-1 text-body text-fg-3">
              这个实例是全新的，还没有任何班级。按下面三步走完，就能开始上课了。
            </p>
          </div>
        </div>

        {/* Progress is the visible contract of "how much is left", so it is derived from the step
            list rather than tracked separately. */}
        <div className="mt-5 space-y-2">
          <Progress label="设置进度" value={((stepIndex + 1) / STEPS.length) * 100} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
            {STEPS.map((entry, index) => (
              <span
                key={entry.key}
                className={index <= stepIndex ? 'font-semibold text-role-ink' : 'text-fg-3'}
              >
                {index + 1}. {entry.title}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <StepIcon className="size-5 text-role-ink" />
          <h2 className="text-section-title text-fg-1">{STEPS[stepIndex].title}</h2>
        </div>

        {stepError ? (
          <p role="alert" className="mb-4 rounded-card border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {stepError}
          </p>
        ) : null}

        {step === 'class' && (
          <div className="space-y-4">
            <FormField label="班级名称" hint="例如「三年二班」。学生登录后看到的就是这个名字。">
              <Input
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                data-tour="firstrun-class-name"
                placeholder="三年二班"
                autoFocus
              />
            </FormField>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => createClass.mutate(className.trim())}
                disabled={className.trim().length === 0 || createClass.isPending}
              >
                {createClass.isPending ? <Spinner size="sm" /> : null}
                创建班级
                <ArrowRight className="ml-1 size-4" />
              </Button>
              <Button variant="ghost" onClick={onFinish}>
                先跳过
              </Button>
            </div>
          </div>
        )}

        {step === 'students' && (
          <div className="space-y-4">
            {inviteCode && (
              <p className="rounded-card border border-line-1 bg-surface-3/50 p-3 text-body text-fg-2">
                学生也可以自己注册：把这个邀请码给他们 ——{' '}
                <span className="font-mono font-bold text-role-ink">{inviteCode}</span>
              </p>
            )}
            <FormField
              label="学生名单"
              hint="每行一个：先写姓名，再写登录名（可省略，省略时自动生成，初始密码 123456）。"
            >
              <Textarea
                value={roster}
                onChange={(event) => setRoster(event.target.value)}
                data-tour="firstrun-roster"
                rows={8}
                placeholder={'张三 2023001\n李四 2023002\n王五'}
              />
            </FormField>

            {parsed.problems.length > 0 && (
              <ul className="space-y-1 text-xs text-warning">
                {parsed.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}

            <p className="text-body text-fg-3">
              将导入 <span className="font-bold text-fg-1">{parsed.entries.length}</span> 名学生
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() =>
                  classId && importRoster.mutate({ students: parsed.entries, class_id: classId })
                }
                disabled={parsed.entries.length === 0 || !classId || importRoster.isPending}
              >
                {importRoster.isPending ? <Spinner size="sm" /> : null}
                导入名单
                <ArrowRight className="ml-1 size-4" />
              </Button>
              <Button variant="ghost" onClick={() => setStep('features')}>
                稍后再加
              </Button>
            </div>
          </div>
        )}

        {step === 'features' && (
          <div className="space-y-4">
            <p className="text-body text-fg-3">
              这些开关控制学生能看到哪些玩法。新班级的开关默认全部关闭——想让学生用哪一项，就在这里打开它；
              之后随时可以在「功能开关」里改。
            </p>
            {/* Reuses the real panel, so the wizard cannot drift from the page it previews. */}
            <div data-tour="firstrun-features">
              <ClassFeaturePanel classId={classId} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setStep('done')}>
                下一步
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <ul className="space-y-2 text-body text-fg-2">
              {[
                `班级已创建${inviteCode ? `（邀请码 ${inviteCode}）` : ''}`,
                `已导入 ${imported} 名学生`,
                '已确认课堂功能开关（新班级默认全部关闭，可在「功能开关」里随时调整）',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-body text-fg-3">
              学生用姓名或登录名 + 初始密码 <span className="font-mono font-bold">123456</span>{' '}
              登录，登录后请提醒他们尽快修改密码。
            </p>
            <Button onClick={onFinish}>
              进入班级主控台
              <ArrowRight className="ml-1 size-4" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default FirstRunWizard;
