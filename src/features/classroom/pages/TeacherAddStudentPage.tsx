import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { apiErrorMessage } from '@/lib/api';
import { studentsApi } from '@/features/classroom/api/studentsApi';
import { useClasses } from '@/hooks/queries/useClasses';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * 添加学生.
 *
 * Two forms behind one tab strip. The visible copy, the payloads and the
 * `navigate` state transition are unchanged; what moved is the presentation - a
 * hand-written header, raw controls and indigo/blue accents became the kit's form
 * controls and the token palette, and the scaffold's `form` variant carries the
 * page's actions: 返回班级 in the context bar, 取消/确认 in the sticky footer.
 *
 * The class list comes from the shared `useClasses` query, not a fire-and-forget fetch: its
 * loading/error/empty states are rendered and retryable, a failed read no longer leaves a required
 * select with no options (the footer button bypasses the form, so that used to become a server 400
 * reported as 「网络错误」), and an account with no class gets a way to create one.
 *
 * `error` stays the single source of truth for the inline message: it sits next to the form rather
 * than only in a toast, because the form remains on screen after a failure.
 */
export default function AddStudent() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationClassId = Number(location.state?.classId) || null;

  const {
    data: classes = [],
    isLoading: classesLoading,
    isError: classesError,
    refetch: refetchClasses,
  } = useClasses();

  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [newStudent, setNewStudent] = useState<{ name: string; username: string; class_id: number | null }>({
    name: '',
    username: '',
    class_id: locationClassId,
  });
  const [batchData, setBatchData] = useState('');
  const [batchClassId, setBatchClassId] = useState<number | null>(locationClassId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Seed the class fields once the list is known: the route state from the dashboard first, then
  // the teacher's first class. A field the teacher already set is left alone.
  useEffect(() => {
    if (classes.length === 0) return;
    const preferred =
      locationClassId !== null && classes.some((cls) => cls.id === locationClassId)
        ? locationClassId
        : classes[0].id;
    setNewStudent((prev) => (prev.class_id === null ? { ...prev, class_id: preferred } : prev));
    setBatchClassId((prev) => (prev === null ? preferred : prev));
  }, [classes, locationClassId]);

  const classReady = !classesLoading && !classesError && classes.length > 0;

  const handleCreateStudent = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newStudent.class_id) {
      setError('请先选择班级');
      return;
    }
    if (creating) return;

    setCreating(true);
    setError('');

    try {
      await studentsApi.createStudent({ ...newStudent, class_id: newStudent.class_id });

      // The dashboard's roster is `['students', classId]` with a five-minute staleTime, so without
      // this the pupil the teacher just added is missing from the list they land on.
      await queryClient.invalidateQueries({ queryKey: ['students', newStudent.class_id] });
      toast.success('学生添加成功');
      navigate('/teacher', { state: { classId: newStudent.class_id } }); // Redirect to dashboard and keep class selected
    } catch (err) {
      // Inline, with the server's own sentence (duplicate username, missing class, ...); the api
      // layer already toasted that same sentence once.
      setError(apiErrorMessage(err, '添加学生失败，请重试'));
    } finally {
      setCreating(false);
    }
  };

  const handleBatchImport = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!batchData.trim()) {
      setError('请输入学生数据');
      return;
    }
    if (!batchClassId) {
      setError('请先选择班级');
      return;
    }
    if (creating) return;

    setCreating(true);
    setError('');

    // Parse batch data: expected format is "name,username" per line
    const lines = batchData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const students = lines.map(line => {
      // support comma, tab, or space separation
      const parts = line.split(/[, \t]+/);
      return {
        name: parts[0] || '',
        username: parts[1] || ''
      };
    }).filter(s => s.name && s.username);

    if (students.length === 0) {
      setError('未识别到有效的学生数据，请检查格式');
      setCreating(false);
      return;
    }

    try {
      const data = await studentsApi.batchImportStudents({ students, class_id: batchClassId });

      await queryClient.invalidateQueries({ queryKey: ['students', batchClassId] });
      toast.success(`成功导入 ${data.importedCount ?? students.length} 名学生`);
      navigate('/teacher', { state: { classId: batchClassId } });
    } catch (err) {
      // Inline, with the server's own sentence; the pasted roster stays for correction.
      setError(apiErrorMessage(err, '导入失败，请重试'));
    } finally {
      setCreating(false);
    }
  };

  const goBack = () => navigate('/teacher', { state: { classId: locationClassId } });

  // The page's one action: whichever tab is open decides what "confirm" means.
  useRegisterPageCommands([
    {
      id: 'teacher-add-student:confirm',
      label: activeTab === 'single' ? '确认添加' : '确认导入',
      icon: activeTab === 'single' ? UserPlus : Upload,
      keywords: ['学生', '添加', '导入'],
      disabled:
        creating ||
        !classReady ||
        (activeTab === 'batch' && !batchData.trim()),
      run: () => void (activeTab === 'single' ? handleCreateStudent() : handleBatchImport()),
    },
  ]);

  const errorBanner = error ? (
    <div
      role="alert"
      className="flex items-center rounded-card border border-danger/20 bg-danger/10 p-4 text-sm text-danger"
    >
      {error}
    </div>
  ) : null;

  /** The class query's own states, shown above whichever form is active. */
  const classStateBanner = classesError ? (
    <div role="alert" className="rounded-card border border-danger/20 bg-danger/10 p-4 text-sm">
      <p className="font-semibold text-danger">班级列表加载失败</p>
      <p className="mt-1 text-fg-3">这不代表你没有班级，请重试后再选择所属班级。</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchClasses()}>
        重新加载
      </Button>
    </div>
  ) : classesLoading ? (
    <p className="text-sm text-fg-3">正在加载班级…</p>
  ) : classes.length === 0 ? (
    <div className="rounded-card border border-dashed border-line-1 bg-surface-3/40 p-4 text-sm">
      <p className="font-semibold text-fg-1">你还没有班级</p>
      <p className="mt-1 text-fg-3">添加学生前需要先创建一个班级。</p>
      <Button size="sm" className="mt-3" onClick={goBack}>
        去创建班级
      </Button>
    </div>
  ) : null;

  const submitBlocked = creating || !classReady;

  return (
    <PageScaffold
      variant="form"
      contentClassName="mx-auto max-w-2xl"
      actions={
        <Button type="button" variant="outline" onClick={goBack}>
          返回班级
        </Button>
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={goBack}>
            取消
          </Button>
          {activeTab === 'single' ? (
            <Button
              type="button"
              disabled={submitBlocked || !newStudent.class_id}
              onClick={() => void handleCreateStudent()}
            >
              {creating ? <Spinner size="sm" label="创建中" /> : <UserPlus data-icon="inline-start" />}
              {creating ? '创建中...' : '确认添加'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={submitBlocked || !batchClassId || !batchData.trim()}
              onClick={() => void handleBatchImport()}
            >
              {creating ? <Spinner size="sm" label="导入中" /> : <Upload data-icon="inline-start" />}
              {creating ? '导入中...' : '确认导入'}
            </Button>
          )}
        </>
      }
    >
      <div className="overflow-hidden rounded-panel border border-line-1 bg-surface-2 shadow-card">
        {/* Both tabs stay mounted-in-place as one switch: `activeTab` is a form mode, not a route. */}
        <div className="flex border-b border-line-1">
          <Button
            type="button"
            aria-pressed={activeTab === 'single'}
            onClick={() => setActiveTab('single')}
            className={cn(
              'h-auto flex-1 rounded-none border-b-2 border-transparent bg-transparent py-4 text-sm font-medium text-fg-3 hover:bg-transparent hover:text-fg-1',
              activeTab === 'single' && 'border-role bg-role/5 text-role hover:text-role',
            )}
          >
            单个添加
          </Button>
          <Button
            type="button"
            aria-pressed={activeTab === 'batch'}
            onClick={() => setActiveTab('batch')}
            className={cn(
              'h-auto flex-1 rounded-none border-b-2 border-transparent bg-transparent py-4 text-sm font-medium text-fg-3 hover:bg-transparent hover:text-fg-1',
              activeTab === 'batch' && 'border-role bg-role/5 text-role hover:text-role',
            )}
          >
            批量导入
          </Button>
        </div>

        {activeTab === 'single' ? (
          <form onSubmit={handleCreateStudent} className="space-y-6 p-8">
            {classStateBanner}
            {errorBanner}

            <div className="space-y-5">
              <FormField label="所属班级" required>
                <Select
                  required
                  value={newStudent.class_id ?? ''}
                  onChange={(e) => setNewStudent({ ...newStudent, class_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="" disabled>请选择班级</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="学生姓名" required>
                <Input
                  type="text"
                  required
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="例如: 张三"
                />
              </FormField>

              <FormField label="登录账号" required>
                <Input
                  type="text"
                  required
                  value={newStudent.username}
                  onChange={(e) => setNewStudent({ ...newStudent, username: e.target.value })}
                  placeholder="建议使用学号或拼音缩写"
                />
              </FormField>

              <div className="rounded-card border border-role/20 bg-role/5 p-3">
                <p className="flex items-center text-sm text-fg-2">
                  <span className="mr-1 font-semibold">提示:</span>
                  新创建的学生账号默认登录密码为
                  <code className="mx-1 rounded bg-role/10 px-1.5 py-0.5 font-mono text-role">123456</code>
                </p>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBatchImport} className="space-y-6 p-8">
            {classStateBanner}
            {errorBanner}

            <div className="space-y-5">
              <FormField label="导入至班级" required>
                <Select
                  required
                  value={batchClassId ?? ''}
                  onChange={(e) => setBatchClassId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="" disabled>请选择班级</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </Select>
              </FormField>

              <div>
                <FormField label="粘贴学生数据" required>
                  <Textarea
                    required
                    value={batchData}
                    onChange={(e) => setBatchData(e.target.value)}
                    rows={8}
                    className="font-mono"
                    placeholder="张三 zhangsan&#10;李四 lisi&#10;王五,wangwu"
                  />
                </FormField>
                {/*
                  Outside the `FormField`: its `<label>` wraps the control, so a paragraph
                  inside it would join the textarea's accessible name.
                */}
                <div className="mt-2 text-sm text-fg-3">
                  请按照 <strong>姓名 账号</strong> 的格式输入，每行一个学生。支持使用空格、制表符（Tab）或逗号分隔。
                </div>
              </div>

              <div className="rounded-card border border-role/20 bg-role/5 p-3">
                <p className="text-sm text-fg-2">
                  <span className="mr-1 font-semibold">提示:</span>
                  您可以直接从 Excel 表格中复制两列（姓名列、账号列），然后粘贴到上方输入框中。默认密码均为 123456。
                </p>
              </div>
            </div>
          </form>
        )}
      </div>
    </PageScaffold>
  );
}
