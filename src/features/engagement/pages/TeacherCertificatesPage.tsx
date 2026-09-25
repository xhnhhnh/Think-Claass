import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Award, Plus, Calendar, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { certificatesApi } from '@/features/engagement/api/certificatesApi';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { useRegisterPageCommands } from '@/app/commands/registry';
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
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Textarea } from '@/components/ui/textarea';
import { Toolbar } from '@/components/ui/toolbar';

interface Student {
  id: number;
  name: string;
  total_points: number;
}

interface Certificate {
  id: number;
  student_id: number;
  student_name: string;
  title: string;
  description: string;
  created_at: string;
}

/**
 * 荣誉奖状.
 *
 * The award cards are the game surface: each one keeps its amber hero band and its
 * `motion` entrance, and issuing one still fires confetti - now through the shared
 * `CELEBRATION.brand` palette instead of the library default, because this is the
 * ceremony the palette was named for. The hand-built overlay became the kit `Dialog`
 * so the close button, the focus trap and the entrance animation are not re-invented.
 */
export default function TeacherCertificates() {
  const user = useStore((state) => state.user);
  const [students, setStudents] = useState<Student[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [selectedStudent, setSelectedStudent] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsData, certsData] = await Promise.all([
          studentsApi.getStudents(),
          certificatesApi.getCertificates()
        ]);

      if (studentsData.success) {
        setStudents(studentsData.students);
      }
      if (certsData.success) {
        setCertificates(certsData.certificates);
      }
    } catch (error) {
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !title.trim()) {
      toast.error('请选择学生并填写荣誉称号');
      return;
    }

    setSubmitting(true);
    try {
      const data = await certificatesApi.issueCertificate({
        student_id: selectedStudent,
        title: title.trim(),
        description: description.trim()
      });

      if (data.success) {
        toast.success('奖状颁发成功！');
        void launchConfetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: [...CELEBRATION.brand]
        });
        setIsModalOpen(false);
        setSelectedStudent('');
        setTitle('');
        setDescription('');
        fetchData(); // Refresh list
      } else {
        toast.error(data.message || '颁发失败');
      }
    } catch (error) {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCerts = certificates.filter(cert => 
    cert.student_name.includes(searchTerm) || cert.title.includes(searchTerm)
  );

  // The page's primary action, reachable from the command palette as well as the context bar.
  useRegisterPageCommands([
    {
      id: 'teacher-certificates:issue',
      label: '颁发新奖状',
      icon: Plus,
      keywords: ['奖状', '荣誉', '颁发'],
      run: () => setIsModalOpen(true),
    },
  ]);

  return (
    <PageScaffold
      variant="list"
      title="荣誉奖状"
      description="为表现优异的学生颁发专属荣誉"
      actions={
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-gradient-to-r from-role to-warning text-role-contrast hover:from-role hover:to-warning"
        >
          <Plus data-icon="inline-start" />
          颁发新奖状
        </Button>
      }
      toolbar={
        <Toolbar
          search={{
            value: searchTerm,
            onChange: setSearchTerm,
            placeholder: '搜索学生姓名或荣誉称号...',
          }}
          searchLabel="搜索学生姓名或荣誉称号"
        />
      }
    >

      {/* Stats */}
      <StatCard
        label="累计颁发"
        value={certificates.length}
        icon={Award}
        tone="warning"
        className="md:w-64"
      />

      {/* Certificates List */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-card" />
          ))
        ) : filteredCerts.length === 0 ? (
          <EmptyState
            icon={Award}
            title="暂无颁发记录"
            className="col-span-full"
          />
        ) : (
          filteredCerts.map((cert) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={cert.id}
              className="overflow-hidden rounded-card border border-line-1 bg-surface-2 shadow-card transition-all hover:shadow-raised"
            >
              <div className="relative border-b border-warning/20 bg-gradient-to-br from-warning/15 to-warning/5 p-6 text-center">
                <div className="absolute top-4 right-4 opacity-20">
                  <Award className="size-16 text-warning" />
                </div>
                <h3 className="relative z-10 mb-1 text-xl font-black text-warning">{cert.title}</h3>
                <p className="relative z-10 text-sm font-medium text-warning/80">授予：{cert.student_name}</p>
              </div>
              <div className="p-6">
                <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-fg-2">
                  {cert.description || '表现优异，特发此状，以资鼓励。'}
                </p>
                <div className="flex items-center text-xs text-fg-3">
                  <Calendar className="mr-1.5 size-4" />
                  {new Date(cert.created_at).toLocaleDateString()}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Issue Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Award className="mr-2 size-5 text-role" />
              颁发荣誉奖状
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleIssueCertificate} className="space-y-5">
            <FormField label="选择学生" required>
              <Select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(Number(e.target.value))}
                required
              >
                <option value="">请选择要表彰的学生</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="荣誉称号" required>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如：阅读之星、进步标兵"
                required
              />
            </FormField>

            <FormField label="表彰寄语">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="写几句鼓励的话语...（选填）"
                rows={3}
              />
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-gradient-to-r from-role to-info text-role-contrast hover:from-role hover:to-info"
              >
                {submitting ? (
                  <>
                    <Spinner size="sm" label="正在颁发" />
                    颁发中...
                  </>
                ) : (
                  <>
                    <CheckCircle data-icon="inline-start" /> 确认颁发
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
