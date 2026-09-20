import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { classroomApi } from '@/features/classroom/api/classesApi';
import { studentsApi } from '@/features/classroom/api/studentsApi';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * 添加学生.
 *
 * Two forms behind one tab strip. The visible copy, the payloads and the
 * `navigate` state transition are unchanged; what moved is the presentation - a
 * hand-written header, raw controls and indigo/blue accents became `PageHeader`,
 * the kit's form controls and the token palette.
 *
 * The `error` string is still the single source of truth for both the inline message
 * and the toast: it stays next to the form rather than being left to the toast alone,
 * because the form remains on screen after a failure.
 */
export default function AddStudent() {
  const navigate = useNavigate();
  const location = useLocation();
  const defaultClassId = location.state?.classId || '';
  
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [newStudent, setNewStudent] = useState({ name: '', username: '', class_id: defaultClassId });
  const [batchData, setBatchData] = useState('');
  const [batchClassId, setBatchClassId] = useState(defaultClassId);
  const [classes, setClasses] = useState<{id: number, name: string}[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const data = await classroomApi.getClasses();
        if (data.success) {
          setClasses(data.classes);
          if (data.classes.length > 0 && !defaultClassId) {
            setNewStudent(prev => ({ ...prev, class_id: data.classes[0].id }));
            setBatchClassId(data.classes[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch classes:', err);
      }
    };
    fetchClasses();
  }, [defaultClassId]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const data = await studentsApi.createStudent(newStudent);

      if (data.success) {
        toast.success('学生添加成功');
        navigate('/teacher', { state: { classId: newStudent.class_id } }); // Redirect to dashboard and keep class selected
      } else {
        setError(data.message || '创建失败');
        toast.error(data.message || '创建失败');
      }
    } catch (err) {
      setError('网络错误');
      toast.error('网络错误');
    } finally {
      setCreating(false);
    }
  };

  const handleBatchImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchData.trim()) {
      setError('请输入学生数据');
      return;
    }

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
      toast.error('未识别到有效的学生数据，请检查格式');
      setCreating(false);
      return;
    }

    try {
      const data = await studentsApi.batchImportStudents({ students, class_id: batchClassId });

      if (data.success) {
        toast.success(`成功导入 ${students.length} 名学生`);
        navigate('/teacher', { state: { classId: batchClassId } });
      } else {
        setError(data.message || '导入失败');
        toast.error(data.message || '导入失败');
      }
    } catch (err) {
      setError('网络错误');
      toast.error('网络错误');
    } finally {
      setCreating(false);
    }
  };

  const goBack = () => navigate('/teacher', { state: { classId: defaultClassId } });

  const errorBanner = error ? (
    <div
      role="alert"
      className="flex items-center rounded-card border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
    >
      {error}
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="添加学生"
        description="为班级添加新的学生账号"
        icon={UserPlus}
        actions={
          <Button type="button" variant="outline" onClick={goBack}>
            返回班级
          </Button>
        }
      />

      <div className="overflow-hidden rounded-panel border border-border bg-paper shadow-card">
        {/* Both tabs stay mounted-in-place as one switch: `activeTab` is a form mode, not a route. */}
        <div className="flex border-b border-border">
          <Button
            type="button"
            aria-pressed={activeTab === 'single'}
            onClick={() => setActiveTab('single')}
            className={cn(
              'h-auto flex-1 rounded-none border-b-2 border-transparent bg-transparent py-4 text-sm font-medium text-ink-3 hover:bg-transparent hover:text-ink-1',
              activeTab === 'single' && 'border-primary bg-primary/5 text-primary hover:text-primary',
            )}
          >
            单个添加
          </Button>
          <Button
            type="button"
            aria-pressed={activeTab === 'batch'}
            onClick={() => setActiveTab('batch')}
            className={cn(
              'h-auto flex-1 rounded-none border-b-2 border-transparent bg-transparent py-4 text-sm font-medium text-ink-3 hover:bg-transparent hover:text-ink-1',
              activeTab === 'batch' && 'border-primary bg-primary/5 text-primary hover:text-primary',
            )}
          >
            批量导入
          </Button>
        </div>

        {activeTab === 'single' ? (
          <form onSubmit={handleCreateStudent} className="space-y-6 p-8">
            {errorBanner}

            <div className="space-y-5">
              <FormField label="所属班级" required>
                <Select
                  required
                  value={newStudent.class_id}
                  onChange={(e) => setNewStudent({ ...newStudent, class_id: parseInt(e.target.value) })}
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

              <div className="rounded-card border border-primary/20 bg-primary/5 p-3">
                <p className="flex items-center text-sm text-ink-2">
                  <span className="mr-1 font-semibold">提示:</span>
                  新创建的学生账号默认登录密码为
                  <code className="mx-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">123456</code>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-6">
              <Button type="button" variant="outline" onClick={goBack}>
                取消
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Spinner size="sm" label="创建中" /> : <UserPlus data-icon="inline-start" />}
                {creating ? '创建中...' : '确认添加'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBatchImport} className="space-y-6 p-8">
            {errorBanner}

            <div className="space-y-5">
              <FormField label="导入至班级" required>
                <Select
                  required
                  value={batchClassId}
                  onChange={(e) => setBatchClassId(parseInt(e.target.value))}
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
                <div className="mt-2 text-sm text-ink-3">
                  请按照 <strong>姓名 账号</strong> 的格式输入，每行一个学生。支持使用空格、制表符（Tab）或逗号分隔。
                </div>
              </div>

              <div className="rounded-card border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm text-ink-2">
                  <span className="mr-1 font-semibold">提示:</span>
                  您可以直接从 Excel 表格中复制两列（姓名列、账号列），然后粘贴到上方输入框中。默认密码均为 123456。
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-6">
              <Button type="button" variant="outline" onClick={goBack}>
                取消
              </Button>
              <Button type="submit" disabled={creating || !batchData.trim()}>
                {creating ? <Spinner size="sm" label="导入中" /> : <Upload data-icon="inline-start" />}
                {creating ? '导入中...' : '确认导入'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
