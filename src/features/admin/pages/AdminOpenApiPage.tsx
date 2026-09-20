import { useState, useEffect } from 'react';
import { Building2, CheckCircle, Copy, Key, Plus, Server, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { adminClient } from '@/features/admin/api/adminClient';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

interface ApiKey {
  id: number;
  name: string;
  api_key: string;
  created_at: string;
}

interface School {
  id: number;
  name: string;
  description: string;
  contact_info: string;
  created_at: string;
}

/**
 * 开发者与校园.
 *
 * Two tabs over two tables, two hand-rolled modals, two `window.confirm` calls and a
 * segmented control built from template-literal class strings. All of it is the kit
 * now: `DataTable` for both lists (with their loading and empty states), `Dialog` for
 * the two forms, `ConfirmDialog` for both deletions, and the tab control is a pair of
 * `Button`s so its active state resolves through the theme rather than a ternary of
 * indigo classes.
 */
export default function AdminOpenApi() {
  const [activeTab, setActiveTab] = useState<'API_KEYS' | 'SCHOOLS'>('API_KEYS');

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [schoolToDelete, setSchoolToDelete] = useState<School | null>(null);

  const [keyName, setKeyName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolDesc, setSchoolDesc] = useState('');
  const [schoolContact, setSchoolContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'API_KEYS') {
        setApiKeys(
          (await adminClient.getOpenApiKeys()).map((key) => ({
            id: key.id,
            name: key.name,
            api_key: key.apiKey,
            created_at: key.createdAt ?? '',
          })),
        );
      } else {
        setSchools(
          (await adminClient.getSchools()).map((school) => ({
            id: school.id,
            name: school.name,
            description: school.description,
            contact_info: school.contactInfo,
            created_at: school.createdAt ?? '',
          })),
        );
      }
    } catch (error) {
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setSubmitting(true);
    try {
      const data = await adminClient.createOpenApiKey(keyName.trim());
      if (data.success) {
        toast.success('API 密钥生成成功');
        setIsKeyModalOpen(false);
        setKeyName('');
        fetchData();
      } else {
        toast.error('生成失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;
    const id = keyToDelete.id;
    setKeyToDelete(null);
    try {
      const data = await adminClient.deleteOpenApiKey(id);
      if (data.success) {
        toast.success('密钥已删除');
        fetchData();
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;

    setSubmitting(true);
    try {
      const data = await adminClient.createSchool({
        name: schoolName.trim(),
        description: schoolDesc.trim(),
        contactInfo: schoolContact.trim(),
      });

      if (data.success) {
        toast.success('入驻学校添加成功');
        setIsSchoolModalOpen(false);
        setSchoolName('');
        setSchoolDesc('');
        setSchoolContact('');
        fetchData();
      } else {
        toast.error('添加失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSchool = async () => {
    if (!schoolToDelete) return;
    const id = schoolToDelete.id;
    setSchoolToDelete(null);
    try {
      const data = await adminClient.deleteSchool(id);
      if (data.success) {
        toast.success('学校信息已删除');
        fetchData();
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast.success('已复制到剪贴板');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="开发者与校园"
        description="管理系统开放 API 密钥与合作入驻的校园信息"
        icon={Server}
        actions={
          <div className="flex rounded-lg border border-border bg-muted/50 p-1">
            <Button
              type="button"
              variant={activeTab === 'API_KEYS' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={activeTab === 'API_KEYS'}
              onClick={() => setActiveTab('API_KEYS')}
            >
              <Key data-icon="inline-start" />
              API 密钥
            </Button>
            <Button
              type="button"
              variant={activeTab === 'SCHOOLS' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={activeTab === 'SCHOOLS'}
              onClick={() => setActiveTab('SCHOOLS')}
            >
              <Building2 data-icon="inline-start" />
              合作校园
            </Button>
          </div>
        }
      />

      <SectionCard
        title={activeTab === 'API_KEYS' ? '密钥列表' : '校园列表'}
        contentClassName="p-0"
        actions={
          <Button
            type="button"
            onClick={() => (activeTab === 'API_KEYS' ? setIsKeyModalOpen(true) : setIsSchoolModalOpen(true))}
          >
            <Plus data-icon="inline-start" />
            {activeTab === 'API_KEYS' ? '生成新密钥' : '添加校园'}
          </Button>
        }
      >
        {activeTab === 'API_KEYS' ? (
          <DataTable<ApiKey>
            className="rounded-none border-0"
            columns={[
              { key: 'name', header: '应用名称', className: 'font-medium text-ink-1' },
              {
                key: 'api_key',
                header: 'API 密钥 (sk_...)',
                render: (key) => (
                  <div className="flex items-center">
                    <code className="rounded border border-border bg-muted px-3 py-1 font-mono text-sm text-ink-2">
                      {key.api_key.substring(0, 10)}...{key.api_key.substring(key.api_key.length - 4)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`复制密钥 ${key.name}`}
                      title="复制完整密钥"
                      className="ml-3 text-ink-3 hover:text-primary"
                      onClick={() => copyToClipboard(key.api_key)}
                    >
                      {copiedKey === key.api_key ? (
                        <CheckCircle className="text-success" />
                      ) : (
                        <Copy />
                      )}
                    </Button>
                  </div>
                ),
              },
              {
                key: 'created_at',
                header: '生成时间',
                className: 'text-sm text-ink-3',
                render: (key) => new Date(key.created_at).toLocaleString(),
              },
              {
                key: 'actions',
                header: <span className="sr-only">操作</span>,
                align: 'right',
                render: (key) => (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除密钥 ${key.name}`}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setKeyToDelete(key)}
                  >
                    <Trash2 />
                  </Button>
                ),
              },
            ]}
            rows={apiKeys}
            getRowKey={(key) => key.id}
            isLoading={loading}
            empty={<EmptyState icon={Key} title="暂无生成的 API 密钥" className="rounded-none border-0" />}
          />
        ) : (
          <DataTable<School>
            className="rounded-none border-0"
            columns={[
              {
                key: 'name',
                header: '学校名称',
                className: 'font-bold text-ink-1',
                render: (school) => (
                  <div className="flex items-center">
                    <span className="mr-3 flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                      {school.name.substring(0, 1)}
                    </span>
                    {school.name}
                  </div>
                ),
              },
              {
                key: 'description',
                header: '简介',
                className: 'max-w-xs truncate text-sm text-ink-2',
                render: (school) => (
                  <span title={school.description}>{school.description || '-'}</span>
                ),
              },
              {
                key: 'contact_info',
                header: '联系方式',
                className: 'text-sm text-ink-2',
                render: (school) => school.contact_info || '-',
              },
              {
                key: 'created_at',
                header: '入驻时间',
                className: 'text-sm text-ink-3',
                render: (school) => new Date(school.created_at).toLocaleDateString(),
              },
              {
                key: 'actions',
                header: <span className="sr-only">操作</span>,
                align: 'right',
                render: (school) => (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除校园 ${school.name}`}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setSchoolToDelete(school)}
                  >
                    <Trash2 />
                  </Button>
                ),
              },
            ]}
            rows={schools}
            getRowKey={(school) => school.id}
            isLoading={loading}
            empty={
              <EmptyState icon={Building2} title="暂无入驻的合作校园" className="rounded-none border-0" />
            }
          />
        )}
      </SectionCard>

      <Dialog open={isKeyModalOpen} onOpenChange={setIsKeyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>生成新 API 密钥</DialogTitle>
            <DialogDescription>密钥只在生成后可复制，请妥善保管</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateKey} className="space-y-4">
            <FormField label="应用名称" required>
              <Input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="例如：校园数据看板"
                required
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsKeyModalOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner label="正在生成" className="text-primary-foreground" />
                    生成中...
                  </>
                ) : (
                  '生成密钥'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSchoolModalOpen} onOpenChange={setIsSchoolModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加合作校园</DialogTitle>
            <DialogDescription>入驻校园会展示在官网的合作列表中</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSchool} className="space-y-4">
            <FormField label="学校名称" required>
              <Input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="请输入学校名称"
                required
              />
            </FormField>
            <FormField label="简介">
              <Textarea
                value={schoolDesc}
                onChange={(e) => setSchoolDesc(e.target.value)}
                rows={3}
                placeholder="一句话介绍这所学校"
                className="resize-none"
              />
            </FormField>
            <FormField label="联系方式">
              <Input
                type="text"
                value={schoolContact}
                onChange={(e) => setSchoolContact(e.target.value)}
                placeholder="联系人或联系电话"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSchoolModalOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner label="正在添加" className="text-primary-foreground" />
                    添加中...
                  </>
                ) : (
                  '添加校园'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(keyToDelete)}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
        title="确认删除密钥"
        description={
          keyToDelete
            ? `确定要删除“${keyToDelete.name}”的 API 密钥吗？删除后相关接口调用将失效！`
            : undefined
        }
        confirmLabel="删除"
        destructive
        onConfirm={handleDeleteKey}
      />

      <ConfirmDialog
        open={Boolean(schoolToDelete)}
        onOpenChange={(open) => !open && setSchoolToDelete(null)}
        title="确认删除校园信息"
        description={
          schoolToDelete ? `确定要删除“${schoolToDelete.name}”吗？` : '确定要删除该学校信息吗？'
        }
        confirmLabel="删除"
        destructive
        onConfirm={handleDeleteSchool}
      />
    </div>
  );
}
