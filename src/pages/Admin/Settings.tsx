import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save, Settings as SettingsIcon, DollarSign, DownloadCloud, AlertTriangle } from 'lucide-react';

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [formData, setFormData] = useState({
    site_title: '',
    site_favicon: '',
    allow_teacher_registration: '0',
    revenue_enabled: '0',
    revenue_mode: 'activation_code'
  });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setFormData({
          site_title: data.data.site_title || '',
          site_favicon: data.data.site_favicon || '',
          allow_teacher_registration: data.data.allow_teacher_registration || '0',
          revenue_enabled: data.data.revenue_enabled || '0',
          revenue_mode: data.data.revenue_mode || 'activation_code'
        });
      } else {
        toast.error(data.message || '获取设置失败');
      }
    } catch (error) {
      toast.error('网络错误，无法获取设置');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('/api/admin/system/update/check');
      const data = await res.json();
      if (data.success) {
        setUpdateInfo(data.data);
        if (data.data.hasUpdate) {
          toast.success(`发现新版本: ${data.data.latestVersion}`);
        } else {
          toast.info('当前已是最新版本');
        }
      } else {
        toast.error(data.message || '检查更新失败');
      }
    } catch (error) {
      toast.error('网络错误，无法检查更新');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleExecuteUpdate = async () => {
    if (!confirm('更新过程中系统将会自动重启，是否确认更新？')) return;
    setUpdating(true);
    try {
      const res = await fetch('/api/admin/system/update/execute', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || '更新已在后台触发，请稍后刷新页面');
        // Let the user manually refresh after a while, or auto refresh after 10s
        setTimeout(() => {
          window.location.reload();
        }, 10000);
      } else {
        toast.error(data.message || '触发更新失败');
        setUpdating(false);
      }
    } catch (error) {
      toast.error('网络错误，无法执行更新');
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    handleCheckUpdate();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('系统设置已更新');
      } else {
        toast.error(data.message || '更新设置失败');
      }
    } catch (error) {
      toast.error('网络错误，无法保存设置');
    } finally {
      setSaving(false);
    }
  };

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
          <div className="relative overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50 max-w-3xl group">
            {/* Decorative background gradients */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 blur-3xl transition-transform duration-500 group-hover:scale-110 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 rounded-full bg-gradient-to-tr from-emerald-400/20 to-teal-500/20 blur-3xl transition-transform duration-500 group-hover:scale-110 pointer-events-none"></div>

            <div className="relative p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/30 text-white">
                    <DownloadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                      系统升级
                    </h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">保持系统最新，获取最新功能与安全更新</p>
                  </div>
                </div>
                <button
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate || updating}
                  className="relative px-6 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm disabled:opacity-50 hover:shadow-md flex items-center overflow-hidden"
                >
                  <span className="relative z-10 flex items-center">
                    {checkingUpdate ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                        检查中...
                      </>
                    ) : '检查更新'}
                  </span>
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-100/80 transition-all hover:bg-slate-50 hover:shadow-sm">
                  <div className="text-sm text-slate-500 font-medium mb-2 flex items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-2"></div>
                    当前系统版本
                  </div>
                  <p className="text-3xl font-black text-slate-800 tracking-tight">
                    {updateInfo ? updateInfo.currentVersion : '获取中...'}
                  </p>
                </div>
                {updateInfo && (
                  <div className="bg-slate-50/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-100/80 transition-all hover:bg-slate-50 hover:shadow-sm">
                    <div className="text-sm text-slate-500 font-medium mb-2 flex items-center">
                      <div className={`w-1.5 h-1.5 rounded-full ${updateInfo.hasUpdate ? 'bg-blue-500' : 'bg-emerald-500'} mr-2`}></div>
                      最新发布版本
                    </div>
                    <p className={`text-3xl font-black tracking-tight bg-clip-text text-transparent ${updateInfo.hasUpdate ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
                      {updateInfo.latestVersion}
                    </p>
                  </div>
                )}
              </div>

              {updateInfo?.hasUpdate && (
                <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 shadow-xl shadow-blue-500/20 text-white">
                  {/* Abstract background shapes */}
                  <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                    <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="100" cy="100" r="100" fill="white"/>
                    </svg>
                  </div>
                  
                  <div className="relative z-10 flex items-start">
                    <div className="bg-white/20 backdrop-blur-md p-3 rounded-xl mr-4 flex-shrink-0">
                      <AlertTriangle className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-white tracking-wide">发现新版本可用</h4>
                      <p className="text-blue-100 text-sm mt-1 mb-4 font-medium flex items-center">
                        发布时间: {new Date(updateInfo.publishedAt).toLocaleString()}
                      </p>
                      
                      <div className="bg-black/10 backdrop-blur-md rounded-xl p-4 text-sm text-blue-50 mb-5 whitespace-pre-wrap max-h-48 overflow-y-auto border border-white/10 shadow-inner">
                        {updateInfo.releaseNotes || '暂无更新说明'}
                      </div>
                      
                      <button
                        onClick={handleExecuteUpdate}
                        disabled={updating}
                        className="px-6 py-3 bg-white text-blue-600 text-sm font-bold rounded-xl hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center"
                      >
                        {updating ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                            正在后台更新...
                          </>
                        ) : '一键更新并重启'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden max-w-3xl">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center">
              <SettingsIcon className="w-5 h-5 text-slate-500 mr-2" />
              <h3 className="font-medium text-slate-700">基础设置</h3>
            </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                网站标题
              </label>
              <input
                type="text"
                value={formData.site_title}
                onChange={(e) => setFormData({ ...formData, site_title: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="请输入网站标题"
              />
              <p className="mt-1 text-xs text-slate-500">将显示在浏览器标签页和各个页面的页眉中</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                网站 Favicon URL
              </label>
              <input
                type="text"
                value={formData.site_favicon}
                onChange={(e) => setFormData({ ...formData, site_favicon: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="https://example.com/favicon.ico"
              />
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <div className="flex items-center h-5">
                <input
                  id="allow_teacher_registration"
                  type="checkbox"
                  checked={formData.allow_teacher_registration === '1'}
                  onChange={(e) => setFormData({ ...formData, allow_teacher_registration: e.target.checked ? '1' : '0' })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div className="text-sm">
                <label htmlFor="allow_teacher_registration" className="font-medium text-slate-700">
                  允许教师自主注册
                </label>
                <p className="text-slate-500">开启后，教师可以在登录页面进行注册账号</p>
              </div>
            </div>

            <div className="border-t border-slate-200 my-8"></div>

            <div className="flex items-center mb-6">
              <DollarSign className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="font-medium text-slate-700">营收设置</h3>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <div className="flex items-center h-5">
                <input
                  id="revenue_enabled"
                  type="checkbox"
                  checked={formData.revenue_enabled === '1'}
                  onChange={(e) => setFormData({ ...formData, revenue_enabled: e.target.checked ? '1' : '0' })}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </div>
              <div className="text-sm">
                <label htmlFor="revenue_enabled" className="font-medium text-slate-700">
                  开启全局营收模式
                </label>
                <p className="text-slate-500">开启后系统将启用收费墙（Payment Wall），关闭则对所有用户免费开放</p>
              </div>
            </div>

            {formData.revenue_enabled === '1' && (
              <div className="pt-4 pl-7 space-y-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  选择计费模式
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setFormData({ ...formData, revenue_mode: 'activation_code' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                      formData.revenue_mode === 'activation_code'
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">激活码模式</span>
                      <input
                        type="radio"
                        checked={formData.revenue_mode === 'activation_code'}
                        readOnly
                        className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                    </div>
                    <p className="text-xs text-slate-500">用户需输入管理员分发的专属激活码来解锁平台功能</p>
                  </div>

                  <div
                    onClick={() => setFormData({ ...formData, revenue_mode: 'direct_payment' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                      formData.revenue_mode === 'direct_payment'
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">直接付费模式</span>
                      <input
                        type="radio"
                        checked={formData.revenue_mode === 'direct_payment'}
                        readOnly
                        className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                    </div>
                    <p className="text-xs text-slate-500">用户通过内置支付网关（如微信/支付宝）直接扫码购买</p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-8 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </form>
        </div>
        </div>
      )}
    </div>
  );
}
