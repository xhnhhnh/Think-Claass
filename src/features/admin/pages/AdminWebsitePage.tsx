import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Globe, Save } from 'lucide-react';

import { portalApi } from '@/features/portal/api/portalApi';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

/**
 * 网站设置.
 *
 * Six hand-styled fields with a blue focus ring, a `max-w-4xl` card with its own
 * arbitrary shadow, and a save button wearing a blue-to-indigo gradient - all replaced
 * by the kit, so the console's one accent colour is the console's accent colour.
 */
export default function AdminWebsite() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Record<string, any>>({
    hero: { title: '', subtitle: '', buttonText: '' },
    features: [],
    about: { title: '', content: '' },
  });

  const fetchWebsiteData = async () => {
    setLoading(true);
    try {
      const data = await portalApi.getHomeContent();
      if (data.success) {
        setSections({
          hero: data.data.hero || { title: '', subtitle: '', buttonText: '' },
          features: data.data.features || [],
          about: data.data.about || { title: '', content: '' },
        });
      } else {
        toast.error('获取网站内容失败');
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
    setSections((prev) => ({
      ...prev,
      hero: { ...prev.hero, [key]: value },
    }));
  };

  const handleAboutChange = (key: string, value: string) => {
    setSections((prev) => ({
      ...prev,
      about: { ...prev.about, [key]: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await portalApi.updateHomeContent(sections);
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
      <PageHeader title="网站设置" description="管理前台展示页面的主要内容" icon={Globe} />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" label="正在加载网站内容" className="text-primary" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
          <SectionCard title="首页内容编辑" description="这些内容展示在官网首页与关于我们页面">
            <div className="space-y-4">
              <h4 className="border-b border-border pb-2 text-base font-medium text-ink-1">
                Hero 横幅区域
              </h4>
              <FormField label="主标题">
                <Input
                  type="text"
                  value={sections.hero?.title || ''}
                  onChange={(e) => handleHeroChange('title', e.target.value)}
                  placeholder="例如：欢迎来到班级管理系统"
                />
              </FormField>
              <FormField label="副标题">
                <Textarea
                  value={sections.hero?.subtitle || ''}
                  onChange={(e) => handleHeroChange('subtitle', e.target.value)}
                  rows={3}
                  placeholder="一两句话介绍系统的特色"
                  className="resize-none"
                />
              </FormField>
              <FormField label="按钮文字">
                <Input
                  type="text"
                  value={sections.hero?.buttonText || ''}
                  onChange={(e) => handleHeroChange('buttonText', e.target.value)}
                  placeholder="例如：立即开始"
                />
              </FormField>
            </div>

            <div className="mt-8 space-y-4">
              <h4 className="border-b border-border pb-2 text-base font-medium text-ink-1">关于我们</h4>
              <FormField label="标题">
                <Input
                  type="text"
                  value={sections.about?.title || ''}
                  onChange={(e) => handleAboutChange('title', e.target.value)}
                  placeholder="关于我们标题"
                />
              </FormField>
              <FormField label="详细介绍">
                <Textarea
                  value={sections.about?.content || ''}
                  onChange={(e) => handleAboutChange('content', e.target.value)}
                  rows={6}
                  placeholder="详细的图文或文本介绍"
                  className="resize-none"
                />
              </FormField>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner label="正在保存" className="text-primary-foreground" />
                  保存中...
                </>
              ) : (
                <>
                  <Save data-icon="inline-start" />
                  保存内容
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
