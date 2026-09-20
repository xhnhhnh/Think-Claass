import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BookOpen,
  Calendar,
  Clock,
  Cpu,
  Download,
  GraduationCap,
  HardDrive,
  RefreshCw,
  School,
  Server,
  ShieldAlert,
  Target,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { ADMIN_PATH } from '@/constants';
import { adminClient } from '@/features/admin/api/adminClient';
import { useAdminStatsQuery, useDatabaseImportMutation } from '@/features/admin/hooks/useAdminSystem';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { FileInput } from '@/components/ui/file-input';
import { Progress, toneForUsage } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';

/**
 * 系统仪表盘.
 *
 * This page was written in the dark "editorial" language of an abandoned design spec -
 * `glass-dark` panels, `bg-slate-800/50` wells, `text-slate-100` headings and eight
 * neon icon colours - and appeared light only because three `!important` rules under
 * `.theme-admin .campus-content` repainted it. That is the third copy of a design the
 * product does not use, and it is what P4 removed: the page is written in the campus
 * language now, so the override block has nothing left to correct and is deleted.
 *
 * `系统仪表盘`, `导出数据`, `导入数据` and `系统重置` are unchanged:
 * `Admin/Dashboard.test.tsx` finds the page by all four.
 */
function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}天 ${h}小时 ${m}分钟`;
}

/** Threshold tones as complete class strings: Tailwind cannot compile `bg-${tone}`. */
function ProgressBar({ value, label }: { value: number; label: string }) {
  return <Progress value={value} label={label} tone={toneForUsage(value)} />;
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: stats, isPending, refetch, isRefetching } = useAdminStatsQuery();
  const importDatabaseMutation = useDatabaseImportMutation();
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  const runExport = () => {
    setExportOpen(false);
    window.location.href = adminClient.getDatabaseExportUrl();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Hold the file instead of uploading straight away: the confirmation is a dialog
    // now, so the decision has to outlive the change event that raised it.
    setPendingImport(file);
  };

  const runImport = async () => {
    const file = pendingImport;
    setPendingImport(null);
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await importDatabaseMutation.mutateAsync(formData);
      toast.success(result.message);
      setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as any)?.data?.message ||
        (error as Error)?.message ||
        '网络错误，导入失败';
      toast.error(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="系统仪表盘"
        description="实时监控系统运行状态与数据统计"
        icon={Server}
        actions={
          <>
            <FileInput
              ref={fileInputRef}
              accept=".sqlite"
              onChange={handleImport}
              label="选择要导入的数据文件"
            />
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download data-icon="inline-start" />
              导出数据
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importDatabaseMutation.isPending}
            >
              <Upload data-icon="inline-start" />
              {importDatabaseMutation.isPending ? '导入中...' : '导入数据'}
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={isPending || isRefetching}>
              <RefreshCw data-icon="inline-start" className={cn((isPending || isRefetching) && 'animate-spin')} />
              刷新数据
            </Button>
            <Button variant="destructive" onClick={() => navigate(`${ADMIN_PATH}/reset`)}>
              <ShieldAlert data-icon="inline-start" />
              系统重置
            </Button>
          </>
        }
      />

      {!stats && isPending ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" label="正在加载系统统计" className="text-primary" />
        </div>
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="总用户数" value={stats.database.totalUsers} icon={Users} tone="primary" />
            <StatCard label="教师人数" value={stats.database.teachers} icon={School} tone="info" />
            <StatCard label="学生人数" value={stats.database.students} icon={GraduationCap} tone="success" />
            <StatCard label="班级数量" value={stats.database.classes} icon={School} tone="warning" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="总作业数" value={stats.database.totalAssignments} icon={BookOpen} tone="info" />
            <StatCard label="请假记录" value={stats.database.totalLeaves} icon={Calendar} tone="warning" />
            <StatCard label="组队任务" value={stats.database.totalTeamQuests} icon={Target} tone="primary" />
            <StatCard label="系统总积分" value={stats.database.totalPoints} icon={Award} tone="success" />
          </div>

          <SectionCard
            title="服务器状态"
            description={`运行平台 ${String(stats.server.platform).toUpperCase()}`}
            className="lg:max-w-3xl"
          >
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex justify-between">
                  <span className="flex items-center text-sm font-medium text-ink-2">
                    <Cpu className="mr-2 size-4" />
                    CPU 使用率 ({stats.server.cpuCount} 核)
                  </span>
                  <span className="text-sm font-bold text-ink-1">{stats.server.cpuUsage}%</span>
                </div>
                <ProgressBar value={stats.server.cpuUsage} label={`CPU 使用率 ${stats.server.cpuUsage}%`} />
              </div>

              <div>
                <div className="mb-2 flex justify-between">
                  <span className="flex items-center text-sm font-medium text-ink-2">
                    <HardDrive className="mr-2 size-4" />
                    内存使用率
                  </span>
                  <span className="text-sm font-bold text-ink-1">{stats.server.memUsage}%</span>
                </div>
                <ProgressBar value={stats.server.memUsage} label={`内存使用率 ${stats.server.memUsage}%`} />
                <p className="mt-2 text-right text-xs text-ink-3">
                  {formatBytes(stats.server.usedMem)} / {formatBytes(stats.server.totalMem)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div className="rounded-card border border-border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center text-sm text-ink-3">
                    <Clock className="mr-2 size-4" />
                    运行时长
                  </div>
                  <p className="font-semibold text-ink-1">{formatUptime(stats.server.uptime)}</p>
                </div>
                <div className="rounded-card border border-border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center text-sm text-ink-3">
                    <Activity className="mr-2 size-4" />
                    运行平台
                  </div>
                  <p className="font-semibold uppercase text-ink-1">{stats.server.platform}</p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : (
        <div className="rounded-panel border border-destructive/30 bg-destructive/10 p-6 text-destructive">
          暂时无法获取系统统计数据，请稍后重试。
        </div>
      )}

      <ConfirmDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="导出全部数据？"
        description="将下载当前数据库的完整备份文件。"
        confirmLabel="导出"
        cancelLabel="取消"
        onConfirm={runExport}
      />

      <ConfirmDialog
        open={Boolean(pendingImport)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingImport(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }}
        title="导入并覆盖数据？"
        description={
          pendingImport
            ? `确定要导入“${pendingImport.name}”吗？这将会覆盖当前所有数据！导入成功后服务器将自动重启。`
            : undefined
        }
        confirmLabel="导入"
        pendingLabel="导入中..."
        cancelLabel="取消"
        destructive
        isPending={importDatabaseMutation.isPending}
        onConfirm={runImport}
      />
    </div>
  );
}
