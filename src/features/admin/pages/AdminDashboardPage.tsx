import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  GraduationCap,
  HardDrive,
  KeyRound,
  RefreshCw,
  School,
  ShieldAlert,
  Target,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SystemStatsResponse } from '@thinkclass/contracts/domains/admin';

import { ADMIN_PATH } from '@/constants';
import { adminClient } from '@/features/admin/api/adminClient';
import { useAdminStatsQuery, useDatabaseImportMutation } from '@/features/admin/hooks/useAdminSystem';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { KpiStrip } from '@/components/ui/kpi-strip';
import { OnboardingChecklist } from '@/components/ui/onboarding-checklist';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { FileInput } from '@/components/ui/file-input';
import { Progress, toneForUsage } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { copyText } from './copyText';

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
 * `Admin/Dashboard.test.tsx` finds the page by all four. The heading comes from
 * `PageScaffold title`, which suppresses it while a shell owns the `h1` - so the test's
 * standalone render still has one and production still prints it exactly once - and the
 * four actions are command-palette commands as well as context-bar buttons.
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

/** Server health, as the secondary card beside the work queue. */
function ServerStatus({ stats }: { stats: SystemStatsResponse }) {
  const server = stats.server;
  return (
    <SectionCard
      title="运行状态"
      description={`${String(server.platform).toUpperCase()} · 已运行 ${formatUptime(server.uptime)}`}
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-body-sm">
            <span className="flex items-center gap-1.5 text-fg-2">
              <Cpu aria-hidden="true" className="size-3.5" />
              CPU（{server.cpuCount} 核）
            </span>
            <span className="font-semibold text-fg-1 tabular-nums">{server.cpuUsage}%</span>
          </div>
          <ProgressBar value={server.cpuUsage} label={`CPU 使用率 ${server.cpuUsage}%`} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-body-sm">
            <span className="flex items-center gap-1.5 text-fg-2">
              <HardDrive aria-hidden="true" className="size-3.5" />
              内存
            </span>
            <span className="font-semibold text-fg-1 tabular-nums">{server.memUsage}%</span>
          </div>
          <ProgressBar value={server.memUsage} label={`内存使用率 ${server.memUsage}%`} />
          <p className="mt-1.5 text-right text-caption text-fg-3">
            {formatBytes(server.usedMem)} / {formatBytes(server.totalMem)}
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-line-2 pt-3 text-caption text-fg-3">
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-3.5" />
            运行时长
          </span>
          <span className="font-medium text-fg-2">{formatUptime(server.uptime)}</span>
        </div>
      </div>
    </SectionCard>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="正在加载系统统计">
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-64 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    </div>
  );
}

function AdminDashboardBody({
  stats,
  navigate,
  copyLoginLink,
}: {
  stats: SystemStatsResponse;
  navigate: ReturnType<typeof useNavigate>;
  copyLoginLink: () => Promise<void>;
}) {
  const d = stats.database;
  const empty = (d.totalUsers ?? 0) <= 1 && d.teachers === 0 && d.classes === 0;

  if (empty) {
    return (
      <div className="space-y-6">
        <OnboardingChecklist
          title="开始使用 Think-Class"
          description="这个实例还是全新的。按下面三步完成第一轮配置，教师和学生就能开始使用。"
          steps={[
            {
              done: d.teachers > 0,
              title: '创建教师账号',
              description: '教师账号由超级管理员创建；教师用该账号登录后，会看到建班级与导入名单的首启向导。',
              action: (
                <Button size="sm" onClick={() => navigate(`${ADMIN_PATH}/teachers`)}>
                  去创建
                </Button>
              ),
            },
            {
              done: d.classes > 0,
              title: '让教师完成第一个班级',
              description: '把登录地址发给老师；首启向导会带着完成建班、导入名单和开启课堂功能。',
              action: (
                <Button size="sm" variant="outline" onClick={() => void copyLoginLink()}>
                  复制登录地址
                </Button>
              ),
            },
            {
              done: d.totalPoints > 0 || d.totalAssignments > 0,
              title: '产生第一份课堂数据',
              description: '给班级配置题库，或让老师布置一份作业；数据出现后，工作台会换成真实指标。',
              action: (
                <Button size="sm" variant="outline" onClick={() => navigate(`${ADMIN_PATH}/question-bank`)}>
                  配置题库
                </Button>
              ),
            },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SectionCard title="接下来常去的地方" description="系统会自动保留最近一次配置的状态。">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { label: '教师管理', description: '创建账号、重置密码、停用账号', path: `${ADMIN_PATH}/teachers`, icon: School },
                { label: '题库管理', description: '挑战模式与世界 Boss 的题目来源', path: `${ADMIN_PATH}/question-bank`, icon: BookOpen },
                { label: '站点设置', description: '站点标题、公告、文章与页面内容', path: `${ADMIN_PATH}/website`, icon: Activity },
                { label: '系统设置', description: '支付渠道、AI 与家长报告开关', path: `${ADMIN_PATH}/settings`, icon: KeyRound },
              ].map((item) => (
                <Button
                  key={item.path}
                  type="button"
                  variant="outline"
                  onClick={() => navigate(item.path)}
                  className="h-auto justify-start gap-3 rounded-card bg-surface-2 p-3 text-left hover:border-role/30 hover:bg-role-soft/40"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-card bg-surface-3 text-fg-2">
                    <item.icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body font-semibold text-fg-1">{item.label}</span>
                    <span className="mt-0.5 block whitespace-normal text-caption text-fg-3">{item.description}</span>
                  </span>
                </Button>
              ))}
            </div>
          </SectionCard>
          <ServerStatus stats={stats} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiStrip
        items={[
          { label: '用户总数', value: d.totalUsers, icon: Users, tone: 'role' },
          { label: '教师', value: d.teachers, icon: School, tone: 'info' },
          { label: '学生', value: d.students, icon: GraduationCap, tone: 'success' },
          { label: '班级', value: d.classes, icon: School, tone: 'warning' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <SectionCard
          title="待处理事项"
          description="先处理影响内容发布和教师加入的事项 · 每 30 秒刷新"
        >
          <div className="divide-y divide-line-2">
            {[
              {
                label: '待发布文章',
                count: d.draftArticles ?? 0,
                path: `${ADMIN_PATH}/articles`,
                hint: '草稿箱里还有内容没有发布',
              },
              {
                label: '待激活教师',
                count: d.inactiveTeachers ?? 0,
                path: `${ADMIN_PATH}/teachers`,
                hint: '账号已创建，但还没有完成首次登录',
              },
            ].map((item) => (
              <Button
                key={item.path}
                type="button"
                variant="ghost"
                onClick={() => navigate(item.path)}
                className="h-auto w-full justify-between gap-4 px-0 py-3 text-left hover:bg-surface-3/40"
              >
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-fg-1">{item.label}</span>
                  <span className="mt-0.5 block whitespace-normal text-caption text-fg-3">{item.hint}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={cn('text-xl font-bold tabular-nums', item.count > 0 ? 'text-warning-ink' : 'text-fg-3')}>
                    {item.count}
                  </span>
                  {item.count === 0 ? <CheckCircle2 aria-hidden="true" className="size-4 text-success" /> : null}
                </span>
              </Button>
            ))}
          </div>
        </SectionCard>
        <ServerStatus stats={stats} />
      </div>

      <SectionCard title="课堂数据" description="跨班级汇总，不含已删除的数据">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '总作业数', value: d.totalAssignments, icon: BookOpen },
            { label: '请假记录', value: d.totalLeaves, icon: Calendar },
            { label: '组队任务', value: d.totalTeamQuests, icon: Target },
            { label: '系统总积分', value: d.totalPoints, icon: Award },
          ].map((item) => (
            <div key={item.label} className="rounded-card border border-line-1 bg-surface-2 px-3 py-3">
              <div className="flex items-center gap-1.5 text-caption text-fg-3">
                <item.icon aria-hidden="true" className="size-3.5" />
                {item.label}
              </div>
              <div className="mt-1 text-lg font-bold text-fg-1 tabular-nums">{item.value}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: stats, isPending, refetch, isRefetching } = useAdminStatsQuery();
  const importDatabaseMutation = useDatabaseImportMutation();
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  const runExport = async () => {
    setExportOpen(false);
    try {
      // Through the api client, not `window.location.href`: a browser navigation cannot send the
      // Bearer token the export route requires, so this button used to answer 401 every time.
      const blob = await adminClient.downloadDatabase();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `think-class-${new Date().toISOString().slice(0, 10)}.sqlite`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('数据库已导出');
    } catch {
      toast.error('导出失败，请重试');
    }
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
    } catch {
      // The api layer already showed the server's sentence (the rollback message when it could).
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyLoginLink = async () => {
    const ok = await copyText(`${window.location.origin}/login`);
    if (ok) toast.success('教师登录地址已复制，发给老师即可');
    else toast.error('复制失败，请把浏览器地址栏里的登录地址发给老师');
  };

  useRegisterPageCommands([
    {
      id: 'admin-dashboard:export',
      label: '导出数据',
      icon: Download,
      keywords: ['数据库', '备份', '导出'],
      run: () => setExportOpen(true),
    },
    {
      id: 'admin-dashboard:import',
      label: '导入数据',
      icon: Upload,
      keywords: ['数据库', '恢复', '导入'],
      run: () => fileInputRef.current?.click(),
      disabled: importDatabaseMutation.isPending,
    },
    {
      id: 'admin-dashboard:refresh',
      label: '刷新数据',
      icon: RefreshCw,
      keywords: ['统计', '刷新'],
      run: () => void refetch(),
      disabled: isPending || isRefetching,
    },
    {
      id: 'admin-dashboard:reset',
      label: '系统重置',
      icon: ShieldAlert,
      keywords: ['重置', '清空', '高危'],
      run: () => navigate(`${ADMIN_PATH}/reset`),
    },
  ]);

  return (
    <PageScaffold
      variant="dashboard"
      title="系统仪表盘"
      description="实时监控系统运行状态与数据统计"
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
    >
      {!stats && isPending ? (
        <DashboardSkeleton />
      ) : stats ? (
        <AdminDashboardBody stats={stats} navigate={navigate} copyLoginLink={copyLoginLink} />
      ) : (
        <SectionCard
          title="系统数据没有加载出来"
          description="这不代表系统没有数据，可能只是这次请求没有成功。"
        >
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
        </SectionCard>
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
    </PageScaffold>
  );
}
