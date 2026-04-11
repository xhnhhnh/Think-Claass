import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save, Settings as SettingsIcon, DollarSign, DownloadCloud, AlertTriangle } from 'lucide-react';

import { apiGet, apiPost, apiPut } from "@/lib/api";

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateConfirmation, setUpdateConfirmation] = useState('');
  const [formData, setFormData] = useState({
    site_title: '',
    site_favicon: '',
    allow_teacher_registration: '0',
    revenue_enabled: '0',
    revenue_mode: 'activation_code',
    enable_teacher_analytics: '1',
    enable_parent_report: '1',
    payment_price: '99.00',
    payment_currency: 'CNY',
    payment_description: 'Think-Class 平台激活',
    payment_environment: 'mock',
    payment_enable_wechat: '1',
    payment_enable_alipay: '1'
  });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/settings');
      if (data.success) {
        setFormData({
          site_title: data.data.site_title || '',
          site_favicon: data.data.site_favicon || '',
          allow_teacher_registration: data.data.allow_teacher_registration || '0',
          revenue_enabled: data.data.revenue_enabled || '0',
          revenue_mode: data.data.revenue_mode || 'activation_code',
          enable_teacher_analytics: data.data.enable_teacher_analytics || '1',
          enable_parent_report: data.data.enable_parent_report || '1',
          payment_price: data.data.payment_price || '99.00',
          payment_currency: data.data.payment_currency || 'CNY',
          payment_description: data.data.payment_description || 'Think-Class 平台激活',
          payment_environment: data.data.payment_environment || 'mock',
          payment_enable_wechat: data.data.payment_enable_wechat || '1',
          payment_enable_alipay: data.data.payment_enable_alipay || '1'
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
      const data = await apiGet('/api/admin/system/update/check');
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
    if (updateConfirmation !== 'UPDATE') {
      toast.error('请输入 UPDATE 以确认危险操作');
      return;
    }
    setUpdating(true);
    try {
      const data = await apiPost('/api/admin/system/update/execute', { confirmation: 'UPDATE' });
      if (data.success) {
        toast.success(data.message || '更新已在后台触发，请稍后刷新页面');
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
      const data = await apiPut('/api/admin/settings', formData);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 2) {
        toast.error('图标文件大小不能超过 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, site_favicon: reader.result as string });
      };
      reader.readAsDataURL(file);
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
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden max-w-3xl">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center">
                <DownloadCloud className="w-5 h-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-slate-700">系统升级</h3>
              </div>
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate || updating}
                className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {checkingUpdate ? '检查中...' : '检查更新'}
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div>
                  <p className="text-sm text-slate-500 mb-1">当前系统版本</p>
                  <p className="text-lg font-bold text-slate-800">
                    {updateInfo ? updateInfo.currentVersion : '获取中...'}
                  </p>
                </div>
                {updateInfo && (
                  <div className="text-right">
                    <p className="text-sm text-slate-500 mb-1">最新发布版本</p>
                    <p className={`text-lg font-bold ${updateInfo.hasUpdate ? 'text-blue-600' : 'text-emerald-600'}`}>
                      {updateInfo.latestVersion}
                    </p>
                  </div>
                )}
              </div>

              {updateInfo?.hasUpdate && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 mt-4">
                  <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900">发现新版本可用</h4>
                      <p className="text-sm text-blue-700 mt-1 mb-4">
                        发布时间: {new Date(updateInfo.publishedAt).toLocaleString()}
                      </p>
                      
                      <div className="bg-white/60 rounded-lg p-3 text-sm text-slate-700 mb-4 whitespace-pre-wrap max-h-40 overflow-y-auto border border-blue-100">
                        {updateInfo.releaseNotes || '暂无更新说明'}
                      </div>
                      
                      {updateInfo.platform === 'win32' ? (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start text-amber-800 text-sm">
                          <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                          <div className="space-y-2">
                            <p>
                              <strong>注意：</strong> 您当前运行在 Windows 环境。出于权限和安全考虑，暂不支持从浏览器直接“一键更新”。
                            </p>
                            <p>
                              <strong>请在服务器的 PowerShell 终端中执行以下命令进行自动化更新：</strong>
                            </p>
                            <code className="block bg-amber-100/50 p-2 rounded border border-amber-200/60 font-mono text-xs select-all text-slate-800">
                              ./update.ps1
                            </code>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={handleExecuteUpdate}
                          disabled={updating}
                          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {updating ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              正在后台更新...
                            </>
                          ) : '一键更新并重启'}
                        </button>
                      )}
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
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={formData.site_favicon}
                  onChange={(e) => setFormData({ ...formData, site_favicon: e.target.value })}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="https://example.com/favicon.ico"
                />
                <label className="cursor-pointer px-4 py-2 bg-slate-100 border border-slate-300 text-slate-700 text-sm rounded-xl hover:bg-slate-200 transition-colors flex-shrink-0">
                  <span>上传图片</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleImageUpload}
                  />
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

            <div className="flex items-center space-x-3 pt-2">
              <div className="flex items-center h-5">
                <input
                  id="enable_teacher_analytics"
                  type="checkbox"
                  checked={formData.enable_teacher_analytics === '1'}
                  onChange={(e) => setFormData({ ...formData, enable_teacher_analytics: e.target.checked ? '1' : '0' })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div className="text-sm">
                <label htmlFor="enable_teacher_analytics" className="font-medium text-slate-700">
                  开启教师分析页
                </label>
                <p className="text-slate-500">关闭后，教师分析页面和 AI 学情摘要将显示为不可用状态</p>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <div className="flex items-center h-5">
                <input
                  id="enable_parent_report"
                  type="checkbox"
                  checked={formData.enable_parent_report === '1'}
                  onChange={(e) => setFormData({ ...formData, enable_parent_report: e.target.checked ? '1' : '0' })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div className="text-sm">
                <label htmlFor="enable_parent_report" className="font-medium text-slate-700">
                  开启家长成长报告
                </label>
                <p className="text-slate-500">关闭后，家长报告页会提示功能暂未开放</p>
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

                {formData.revenue_mode === 'direct_payment' && (
                  <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">支付金额</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.payment_price}
                          onChange={(e) => setFormData({ ...formData, payment_price: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">币种</label>
                        <input
                          type="text"
                          value={formData.payment_currency}
                          onChange={(e) => setFormData({ ...formData, payment_currency: e.target.value.toUpperCase() })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">支付说明</label>
                      <input
                        type="text"
                        value={formData.payment_description}
                        onChange={(e) => setFormData({ ...formData, payment_description: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">支付环境</label>
                      <select
                        value={formData.payment_environment}
                        onChange={(e) => setFormData({ ...formData, payment_environment: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        <option value="mock">mock</option>
                        <option value="sandbox">sandbox</option>
                        <option value="production">production</option>
                      </select>
                      <p className="mt-2 text-xs text-amber-600">
                        当前代码仓库仍使用 mock 支付适配层。这里的环境与渠道开关会驱动订单流与页面提示，但若要真正接入微信/支付宝，还需要后续补充 SDK、证书和密钥配置。
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center space-x-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <input
                          type="checkbox"
                          checked={formData.payment_enable_wechat === '1'}
                          onChange={(e) => setFormData({ ...formData, payment_enable_wechat: e.target.checked ? '1' : '0' })}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-slate-700">启用微信支付</span>
                      </label>
                      <label className="flex items-center space-x-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <input
                          type="checkbox"
                          checked={formData.payment_enable_alipay === '1'}
                          onChange={(e) => setFormData({ ...formData, payment_enable_alipay: e.target.checked ? '1' : '0' })}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-slate-700">启用支付宝</span>
                      </label>
                    </div>
                  </div>
                )}
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

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-red-100 overflow-hidden max-w-3xl">
            <div className="p-6 border-b border-red-100 bg-red-50 flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
              <h3 className="font-medium text-red-700">危险操作区</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                系统更新属于高风险操作。执行前请确认已备份数据库，并在下方输入 <span className="font-bold text-red-600">UPDATE</span> 进行确认。
              </p>
              <input
                type="text"
                value={updateConfirmation}
                onChange={(e) => setUpdateConfirmation(e.target.value)}
                className="w-full px-4 py-2 border border-red-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                placeholder="输入 UPDATE 以确认"
              />
              <p className="text-xs text-slate-500">
                当前运行平台：{updateInfo?.platform || '未知'}。Windows 环境下仍需使用手动更新方式。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
