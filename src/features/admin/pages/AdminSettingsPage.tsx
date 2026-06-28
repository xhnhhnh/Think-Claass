import { useEffect, useState } from 'react';
import { Download, DollarSign, ExternalLink, Info, RefreshCw, Save, Settings as SettingsIcon, Terminal } from 'lucide-react';
import { toast } from 'sonner';

import {
  useAdminReleaseUpdateStatusQuery,
  useAdminSystemSettingsQuery,
  useCheckLatestReleaseMutation,
  useStartReleaseUpdateMutation,
  useUpdateAdminSystemSettingsMutation,
} from '@/features/admin/hooks/useAdminSystem';
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from '@/shared/admin/contracts';

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

export default function AdminSettingsPage() {
  const { data: settings, isPending: loading } = useAdminSystemSettingsQuery();
  const { data: updateStatus, isPending: updateStatusLoading, refetch: refreshUpdateStatus } = useAdminReleaseUpdateStatusQuery();
  const updateSettingsMutation = useUpdateAdminSystemSettingsMutation();
  const checkLatestReleaseMutation = useCheckLatestReleaseMutation();
  const startReleaseUpdateMutation = useStartReleaseUpdateMutation();
  const [formData, setFormData] = useState(DEFAULT_SYSTEM_SETTINGS);

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
      toast.success(status.hasUpdate ? `发现新版本 ${status.latestVersion}` : `当前已是最新版本 ${status.currentVersion}`);
    } catch (_error) {
      toast.error('无法获取 GitHub Release 最新版本');
    }
  };

  const handleStartReleaseUpdate = async () => {
    if (!window.confirm('更新会下载最新 Release 并重启服务，是否继续？')) return;

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">系统设置</h2>
          <p className="text-slate-500 mt-1">管理网站的全局基础配置</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden max-w-3xl">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center">
                <Info className="w-5 h-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-slate-700">系统更新</h3>
              </div>
              <a href={updateStatus?.releaseUrl ?? 'https://github.com/xhnhhnh/Think-Claass/releases/latest'} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700">
                GitHub Releases
                <ExternalLink className="ml-1 h-4 w-4" />
              </a>
            </div>

              <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">当前版本</p>
                  <p className="text-lg font-bold text-slate-800">{updateStatus?.currentVersion || '读取中...'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">最新 Release</p>
                  <p className="text-lg font-bold text-slate-800">{updateStatus?.latestVersion || '点击检查更新'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">更新状态</p>
                  <p className={`text-lg font-bold ${updateStatus?.state === 'failed' ? 'text-red-600' : updateStatus?.state === 'running' ? 'text-blue-600' : 'text-slate-800'}`}>
                    {updateStateLabel}
                  </p>
                </div>
              </div>

              <div className={`rounded-xl border p-4 text-sm ${updateStatus?.supported === false ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-100 bg-blue-50/70 text-blue-900'}`}>
                {updateStatusLoading
                  ? '正在读取更新状态...'
                  : updateStatus?.supported === false
                    ? `网站内一键更新仅支持 Linux 服务器。当前运行环境：${updateStatus.platform}。`
                    : updateStatus?.message || '可从 GitHub Releases 检查并安装最新 Linux 部署包。'}
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleCheckLatestRelease} disabled={checkLatestReleaseMutation.isPending || updateStatus?.state === 'running'} className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 mr-2 ${checkLatestReleaseMutation.isPending ? 'animate-spin' : ''}`} />
                  {checkLatestReleaseMutation.isPending ? '检查中...' : '检查更新'}
                </button>
                <button type="button" onClick={handleStartReleaseUpdate} disabled={!updateStatus?.supported || !updateStatus?.hasUpdate || updateStatus.state === 'running' || startReleaseUpdateMutation.isPending} className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
                  <Download className="w-4 h-4 mr-2" />
                  {updateStatus?.state === 'running' || startReleaseUpdateMutation.isPending ? '正在更新...' : '安装最新版本'}
                </button>
                <button type="button" onClick={() => void refreshUpdateStatus()} className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                  <Terminal className="w-4 h-4 mr-2" />
                  刷新日志
                </button>
              </div>

              <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 text-xs text-slate-400">
                  <span>Linux 更新日志</span>
                  <span>{updateStatus?.updatedAt ? new Date(updateStatus.updatedAt).toLocaleString() : '暂无记录'}</span>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-slate-200">{updateStatus?.log || '暂无更新日志。'}</pre>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden max-w-3xl">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center">
              <SettingsIcon className="w-5 h-5 text-slate-500 mr-2" />
              <h3 className="font-medium text-slate-700">基础设置</h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">网站标题</label>
                <input type="text" value={formData.site_title} onChange={(event) => setFormData({ ...formData, site_title: event.target.value })} className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" placeholder="请输入网站标题" />
                <p className="mt-1 text-xs text-slate-500">将显示在浏览器标签页和各个页面的页眉中</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">网站 Favicon URL</label>
                <div className="flex items-center space-x-4">
                  <input type="text" value={formData.site_favicon} onChange={(event) => setFormData({ ...formData, site_favicon: event.target.value })} className="flex-1 px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" placeholder="https://example.com/favicon.ico" />
                  <label className="cursor-pointer px-4 py-2 bg-slate-100 border border-slate-300 text-slate-700 text-sm rounded-xl hover:bg-slate-200 transition-colors flex-shrink-0">
                    <span>上传图片</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                  {formData.site_favicon && (
                    <div className="w-10 h-10 rounded overflow-hidden border border-slate-200 flex-shrink-0 bg-white flex items-center justify-center">
                      <img src={formData.site_favicon} alt="Favicon Preview" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <div className="flex items-center h-5">
                  <input id="allow_teacher_registration" type="checkbox" checked={formData.allow_teacher_registration === '1'} onChange={(event) => setFormData({ ...formData, allow_teacher_registration: event.target.checked ? '1' : '0' })} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                </div>
                <div className="text-sm">
                  <label htmlFor="allow_teacher_registration" className="font-medium text-slate-700">允许教师自主注册</label>
                  <p className="text-slate-500">开启后，教师可以在登录页面进行注册账号</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <div className="flex items-center h-5">
                  <input id="enable_teacher_analytics" type="checkbox" checked={formData.enable_teacher_analytics === '1'} onChange={(event) => setFormData({ ...formData, enable_teacher_analytics: event.target.checked ? '1' : '0' })} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                </div>
                <div className="text-sm">
                  <label htmlFor="enable_teacher_analytics" className="font-medium text-slate-700">开启教师分析页</label>
                  <p className="text-slate-500">关闭后，教师端的 AI 分析页将无法访问</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <div className="flex items-center h-5">
                  <input id="enable_parent_report" type="checkbox" checked={formData.enable_parent_report === '1'} onChange={(event) => setFormData({ ...formData, enable_parent_report: event.target.checked ? '1' : '0' })} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                </div>
                <div className="text-sm">
                  <label htmlFor="enable_parent_report" className="font-medium text-slate-700">开启家长成长报告</label>
                  <p className="text-slate-500">关闭后，家长端报告页将不可用</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center mb-4">
                  <DollarSign className="w-5 h-5 text-slate-500 mr-2" />
                  <h4 className="font-medium text-slate-700">付费与激活设置</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">是否启用付费</span>
                    <select value={formData.revenue_enabled} onChange={(event) => setFormData({ ...formData, revenue_enabled: event.target.value })} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white">
                      <option value="0">关闭</option>
                      <option value="1">开启</option>
                    </select>
                  </label>

                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">激活模式</span>
                    <select value={formData.revenue_mode} onChange={(event) => setFormData({ ...formData, revenue_mode: event.target.value })} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white">
                      <option value="activation_code">激活码</option>
                      <option value="direct_payment" disabled>直接支付（稍后开发）</option>
                    </select>
                    <p className="mt-1 text-xs text-amber-600">扫码支付暂未开放，本轮请使用卡密/激活码开通。</p>
                  </label>

                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">价格</span>
                    <input type="text" value={formData.payment_price} onChange={(event) => setFormData({ ...formData, payment_price: event.target.value })} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                  </label>

                  <label className="block text-sm">
                    <span className="text-slate-700 font-medium">币种</span>
                    <input type="text" value={formData.payment_currency} onChange={(event) => setFormData({ ...formData, payment_currency: event.target.value })} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button type="submit" disabled={updateSettingsMutation.isPending} className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
                  <Save className="w-4 h-4 mr-2" />
                  {updateSettingsMutation.isPending ? '保存中...' : '保存设置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
