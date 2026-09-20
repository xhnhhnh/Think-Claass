import { useEffect, useState } from 'react';
import {
  Download,
  DollarSign,
  ExternalLink,
  Info,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  useAdminReleaseUpdateStatusQuery,
  useAdminSystemSettingsQuery,
  useCheckLatestReleaseMutation,
  useStartReleaseUpdateMutation,
  useUpdateAdminSystemSettingsMutation,
} from '@/features/admin/hooks/useAdminSystem';
import { DEFAULT_SYSTEM_SETTINGS } from '../../../lib/systemSettings.js';
import type { SystemSettings } from '@thinkclass/contracts/domains/admin';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileInput } from '@/components/ui/file-input';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

function normalizeSettings(settings?: Partial<SystemSettings>): SystemSettings {
  const next = {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...settings,
  };

  if (next.revenue_mode === 'direct_payment') {
    next.revenue_mode = 'activation_code';
  }

  return next;
}

/**
 * 系统设置.
 *
 * Two things beyond the kit: the update log panel keeps its terminal look (dark
 * background, monospace) because a log is not a form - but it is the reason the
 * `theme-admin .campus-content` override block was actively harmful: that block
 * repainted `text-slate-400` inside the admin theme to a mid grey, on a `bg-slate-950`
 * panel, so the log header was nearly invisible. Deleting the block fixed it.
 *
 * And the release update's `window.confirm` is a `ConfirmDialog` now, like every other
 * confirmation in the console.
 *
 * `开启家长成长报告` (the label `Admin/Settings.test.tsx` reaches its checkbox by),
 * `保存设置`, `检查更新`, `Linux 更新日志` and `暂无更新日志。` are unchanged. The
 * label is associated with `htmlFor` and the description sits outside it, so the
 * accessible name stays exactly the label.
 */
export default function AdminSettingsPage() {
  const { data: settings, isPending: loading } = useAdminSystemSettingsQuery();
  const {
    data: updateStatus,
    isPending: updateStatusLoading,
    refetch: refreshUpdateStatus,
  } = useAdminReleaseUpdateStatusQuery();
  const updateSettingsMutation = useUpdateAdminSystemSettingsMutation();
  const checkLatestReleaseMutation = useCheckLatestReleaseMutation();
  const startReleaseUpdateMutation = useStartReleaseUpdateMutation();
  const [formData, setFormData] = useState(DEFAULT_SYSTEM_SETTINGS);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(normalizeSettings(settings));
    }
  }, [settings]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateSettingsMutation.mutateAsync(formData);
      toast.success('系统设置已更新');
    } catch (_error) {
      toast.error('网络错误，无法保存设置');
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024 * 2) {
      toast.error('图标文件大小不能超过 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((current) => ({ ...current, site_favicon: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleCheckLatestRelease = async () => {
    try {
      const status = await checkLatestReleaseMutation.mutateAsync();
      toast.success(
        status.hasUpdate
          ? `发现新版本 ${status.latestVersion}`
          : `当前已是最新版本 ${status.currentVersion}`,
      );
    } catch (_error) {
      toast.error('无法获取 GitHub Release 最新版本');
    }
  };

  const handleStartReleaseUpdate = async () => {
    setUpdateConfirmOpen(false);
    try {
      const status = await startReleaseUpdateMutation.mutateAsync();
      toast.success(status.message);
    } catch (_error) {
      toast.error('无法启动更新，请查看日志或稍后重试');
    }
  };

  const updateStateLabel = {
    idle: '尚未更新',
    running: '更新中',
    succeeded: '已完成',
    failed: '失败',
  }[updateStatus?.state ?? 'idle'];

  /** A settings row: control, label, description - with the label owning the control. */
  const toggles: Array<{
    id: string;
    label: string;
    hint: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }> = [
    {
      id: 'allow_teacher_registration',
      label: '允许教师自主注册',
      hint: '开启后，教师可以在登录页面进行注册账号',
      checked: formData.allow_teacher_registration === '1',
      onChange: (checked) =>
        setFormData({ ...formData, allow_teacher_registration: checked ? '1' : '0' }),
    },
    {
      id: 'enable_teacher_analytics',
      label: '开启教师分析页',
      hint: '关闭后，教师端的 AI 分析页将无法访问',
      checked: formData.enable_teacher_analytics === '1',
      onChange: (checked) =>
        setFormData({ ...formData, enable_teacher_analytics: checked ? '1' : '0' }),
    },
    {
      id: 'enable_parent_report',
      label: '开启家长成长报告',
      hint: '关闭后，家长端报告页将不可用',
      checked: formData.enable_parent_report === '1',
      onChange: (checked) =>
        setFormData({ ...formData, enable_parent_report: checked ? '1' : '0' }),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="系统设置" description="管理网站的全局基础配置" icon={SettingsIcon} />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" label="正在加载系统设置" className="text-primary" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <SectionCard
            title="系统更新"
            actions={
              <a
                href={updateStatus?.releaseUrl ?? 'https://github.com/xhnhhnh/Think-Claass/releases/latest'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80"
              >
                GitHub Releases
                <ExternalLink className="ml-1 size-4" />
              </a>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-card border border-border bg-muted/40 p-4">
                  <p className="mb-1 text-xs text-ink-3">当前版本</p>
                  <p className="text-lg font-bold text-ink-1">
                    {updateStatus?.currentVersion || '读取中...'}
                  </p>
                </div>
                <div className="rounded-card border border-border bg-muted/40 p-4">
                  <p className="mb-1 text-xs text-ink-3">最新 Release</p>
                  <p className="text-lg font-bold text-ink-1">
                    {updateStatus?.latestVersion || '点击检查更新'}
                  </p>
                </div>
                <div className="rounded-card border border-border bg-muted/40 p-4">
                  <p className="mb-1 text-xs text-ink-3">更新状态</p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      updateStatus?.state === 'failed'
                        ? 'text-destructive'
                        : updateStatus?.state === 'running'
                          ? 'text-info'
                          : 'text-ink-1',
                    )}
                  >
                    {updateStateLabel}
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  'rounded-card border p-4 text-sm',
                  updateStatus?.supported === false
                    ? 'border-warning/30 bg-warning/10 text-warning'
                    : 'border-info/30 bg-info/10 text-info',
                )}
              >
                {updateStatusLoading
                  ? '正在读取更新状态...'
                  : updateStatus?.supported === false
                    ? `网站内一键更新仅支持 Linux 服务器。当前运行环境：${updateStatus.platform}。`
                    : updateStatus?.message || '可从 GitHub Releases 检查并安装最新 Linux 部署包。'}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCheckLatestRelease}
                  disabled={checkLatestReleaseMutation.isPending || updateStatus?.state === 'running'}
                >
                  <RefreshCw
                    data-icon="inline-start"
                    className={cn(checkLatestReleaseMutation.isPending && 'animate-spin')}
                  />
                  {checkLatestReleaseMutation.isPending ? '检查中...' : '检查更新'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setUpdateConfirmOpen(true)}
                  disabled={
                    !updateStatus?.supported ||
                    !updateStatus?.hasUpdate ||
                    updateStatus.state === 'running' ||
                    startReleaseUpdateMutation.isPending
                  }
                >
                  <Download data-icon="inline-start" />
                  {updateStatus?.state === 'running' || startReleaseUpdateMutation.isPending
                    ? '正在更新...'
                    : '安装最新版本'}
                </Button>
                <Button type="button" variant="outline" onClick={() => void refreshUpdateStatus()}>
                  <Terminal data-icon="inline-start" />
                  刷新日志
                </Button>
              </div>

              {/* A log viewer keeps its terminal look: it is not a form to be themed. */}
              <div className="overflow-hidden rounded-card border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-300">
                  <span>Linux 更新日志</span>
                  <span>
                    {updateStatus?.updatedAt
                      ? new Date(updateStatus.updatedAt).toLocaleString()
                      : '暂无记录'}
                  </span>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-slate-200">
                  {updateStatus?.log || '暂无更新日志。'}
                </pre>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="基础设置" description="网站标题、图标与功能开关">
            <form onSubmit={handleSubmit} className="space-y-6">
              <FormField label="网站标题" hint="将显示在浏览器标签页和各个页面的页眉中">
                <Input
                  type="text"
                  value={formData.site_title}
                  onChange={(event) => setFormData({ ...formData, site_title: event.target.value })}
                  placeholder="请输入网站标题"
                />
              </FormField>

              <FormField label="网站 Favicon URL">
                <div className="flex items-center gap-4">
                  <Input
                    type="text"
                    value={formData.site_favicon}
                    onChange={(event) =>
                      setFormData({ ...formData, site_favicon: event.target.value })
                    }
                    placeholder="https://example.com/favicon.ico"
                    className="flex-1"
                  />
                  <label className="flex shrink-0 cursor-pointer items-center rounded-lg border border-input bg-muted/50 px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-muted">
                    <span>上传图片</span>
                    <FileInput accept="image/*" onChange={handleImageUpload} label="上传网站图标" />
                  </label>
                  {formData.site_favicon ? (
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-paper">
                      <img
                        src={formData.site_favicon}
                        alt="Favicon Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : null}
                </div>
              </FormField>

              <div className="space-y-4 pt-2">
                {toggles.map((toggle) => (
                  <div key={toggle.id} className="flex items-start gap-3">
                    <Checkbox
                      id={toggle.id}
                      checked={toggle.checked}
                      onCheckedChange={(checked) => toggle.onChange(checked)}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <label htmlFor={toggle.id} className="font-medium text-ink-2">
                        {toggle.label}
                      </label>
                      <p className="text-ink-3">{toggle.hint}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4">
                <div className="mb-4 flex items-center">
                  <DollarSign className="mr-2 size-5 text-ink-3" />
                  <h4 className="font-medium text-ink-2">付费与激活设置</h4>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField label="是否启用付费">
                    <Select
                      value={formData.revenue_enabled}
                      onChange={(event) =>
                        setFormData({ ...formData, revenue_enabled: event.target.value })
                      }
                    >
                      <option value="0">关闭</option>
                      <option value="1">开启</option>
                    </Select>
                  </FormField>

                  <FormField
                    label="激活模式"
                    hint="扫码支付暂未开放，本轮请使用卡密/激活码开通。"
                  >
                    <Select
                      value={formData.revenue_mode}
                      onChange={(event) =>
                        setFormData({ ...formData, revenue_mode: event.target.value as SystemSettings['revenue_mode'] })
                      }
                    >
                      <option value="activation_code">激活码</option>
                      <option value="direct_payment" disabled>
                        直接支付（稍后开发）
                      </option>
                    </Select>
                  </FormField>

                  <FormField label="价格">
                    <Input
                      type="text"
                      value={formData.payment_price}
                      onChange={(event) =>
                        setFormData({ ...formData, payment_price: event.target.value })
                      }
                    />
                  </FormField>

                  <FormField label="币种">
                    <Input
                      type="text"
                      value={formData.payment_currency}
                      onChange={(event) =>
                        setFormData({ ...formData, payment_currency: event.target.value })
                      }
                    />
                  </FormField>
                </div>
              </div>

              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending ? (
                    <>
                      <Spinner label="正在保存设置" className="text-primary-foreground" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save data-icon="inline-start" />
                      保存设置
                    </>
                  )}
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>
      )}

      <ConfirmDialog
        open={updateConfirmOpen}
        onOpenChange={setUpdateConfirmOpen}
        title="安装最新版本？"
        description="更新会下载最新 Release 并重启服务，是否继续？"
        confirmLabel="开始更新"
        pendingLabel="正在启动..."
        cancelLabel="取消"
        isPending={startReleaseUpdateMutation.isPending}
        onConfirm={handleStartReleaseUpdate}
      />
    </div>
  );
}
