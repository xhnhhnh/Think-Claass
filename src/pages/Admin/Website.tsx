import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save, Globe } from 'lucide-react';

import { apiGet, apiPut } from "@/lib/api";

export default function AdminWebsite() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Record<string, any>>({
    hero: { title: '', subtitle: '', buttonText: '' },
    features: [],
    about: { title: '', content: '' }
  });

  const fetchWebsiteData = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/website/home');
      if (data.success) {
        setSections({
          hero: data.data.hero || { title: '', subtitle: '', buttonText: '' },
          features: data.data.features || [],
          about: data.data.about || { title: '', content: '' }
        });
      } else {
        toast.error(data.message || '获取网站内容失败');
      }
    } catch (error) {
      toast.error('网络错误，无法获取网站内容');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebsiteData();
  }, []);

  const handleHeroChange = (key: string, value: string) => {
    setSections(prev => ({
      ...prev,
      hero: { ...prev.hero, [key]: value }
    }));
  };

  const handleAboutChange = (key: string, value: string) => {
    setSections(prev => ({
      ...prev,
      about: { ...prev.about, [key]: value }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiPut('/api/website/home', sections);
      if (data.success) {
        toast.success('网站内容已更新');
      } else {
        toast.error(data.message || '更新内容失败');
      }
    } catch (error) {
      toast.error('网络错误，无法保存内容');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">网站设置</h2>
          <p className="text-slate-500 mt-1">管理前台展示页面的主要内容</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden max-w-4xl">
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center">
            <Globe className="w-5 h-5 text-slate-500 mr-2" />
            <h3 className="font-medium text-slate-700">首页内容编辑</h3>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Hero Section */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-slate-800 border-b pb-2">Hero 横幅区域</h4>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  主标题
                </label>
                <input
                  type="text"
                  value={sections.hero?.title || ''}
                  onChange={(e) => handleHeroChange('title', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="例如：欢迎来到班级管理系统"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  副标题
                </label>
                <textarea
                  value={sections.hero?.subtitle || ''}
                  onChange={(e) => handleHeroChange('subtitle', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                  rows={3}
                  placeholder="一两句话介绍系统的特色"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  按钮文字
                </label>
                <input
                  type="text"
                  value={sections.hero?.buttonText || ''}
                  onChange={(e) => handleHeroChange('buttonText', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="例如：立即开始"
                />
              </div>
            </div>

            {/* About Section */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-slate-800 border-b pb-2">关于我们</h4>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  标题
                </label>
                <input
                  type="text"
                  value={sections.about?.title || ''}
                  onChange={(e) => handleAboutChange('title', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="关于我们标题"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  详细介绍
                </label>
                <textarea
                  value={sections.about?.content || ''}
                  onChange={(e) => handleAboutChange('content', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                  rows={6}
                  placeholder="详细的图文或文本介绍"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '保存内容'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
