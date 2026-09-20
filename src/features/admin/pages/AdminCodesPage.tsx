import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Download, Key, Plus } from 'lucide-react';

import { adminClient } from '@/features/admin/api/adminClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { Toolbar } from '@/components/ui/toolbar';

type ActivationCodeRow = Record<string, any>;

function getCodeField<T>(code: ActivationCodeRow, camelKey: string, snakeKey: string, fallback: T): T {
  return (code[camelKey] ?? code[snakeKey] ?? fallback) as T;
}

function formatCodeDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

/**
 * 激活码管理.
 *
 * The table keeps the contract `AdminCodesPage.test.tsx` asserts on: the code, the
 * user it was used by, the activation source and its remark all render as text in
 * their cells. What changed is everything around them - `DataTable` owns the loading
 * and empty states (the page used to render "加载中..." and an empty row *inside*
 * `<tbody>`), the generate control is a `Toolbar`, and the status chip is a `Badge`
 * rather than a template-literal class string.
 */
export default function AdminCodes() {
  const [codes, setCodes] = useState<ActivationCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateCount, setGenerateCount] = useState(10);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      setCodes(await adminClient.getActivationCodes());
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const handleGenerate = async () => {
    if (generateCount < 1 || generateCount > 1000) {
      toast.error('生成数量必须在 1 到 1000 之间');
      return;
    }
    setGenerating(true);
    try {
      const data = await adminClient.generateActivationCodes(generateCount);
      if (data.success) {
        toast.success(data.message);
        fetchCodes();
      } else {
        toast.error(data.message || '生成失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('已复制到剪贴板');
    });
  };

  const downloadCSV = () => {
    if (codes.length === 0) {
      toast.error('没有激活码可导出');
      return;
    }

    const headers = ['激活码', '状态', '使用人', '生成时间', '使用时间'];
    const rows = codes.map((c) => [
      c.code,
      c.status === 'used' ? '已使用' : '未使用',
      getCodeField(c, 'usedByUsername', 'used_by_username', ''),
      formatCodeDate(getCodeField<string | null>(c, 'createdAt', 'created_at', null)),
      formatCodeDate(getCodeField<string | null>(c, 'usedAt', 'used_at', null)),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activation_codes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="激活码管理" description="生成和管理系统访问激活码" icon={Key} />

      <Toolbar
        actions={
          <>
            <Button variant="outline" onClick={downloadCSV}>
              <Download data-icon="inline-start" />
              导出 CSV
            </Button>
            <div className="flex items-center gap-1 rounded-lg border border-input bg-paper p-1 shadow-sm">
              <Input
                type="number"
                min={1}
                max={1000}
                aria-label="生成数量"
                value={generateCount}
                onChange={(e) => setGenerateCount(Number(e.target.value))}
                className="h-8 w-16 border-0 bg-transparent px-2 text-center shadow-none focus-visible:ring-0"
              />
              <Button onClick={handleGenerate} disabled={generating} size="sm">
                {generating ? (
                  <Spinner size="sm" label="正在生成" className="text-primary-foreground" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                {generating ? '生成中...' : '生成'}
              </Button>
            </div>
          </>
        }
      />

      <DataTable<ActivationCodeRow>
        columns={[
          {
            key: 'code',
            header: '激活码',
            render: (code) => (
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-1 font-mono font-medium text-ink-2">
                  {code.code}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`复制激活码 ${code.code}`}
                  title="复制"
                  className="text-ink-3 hover:text-primary"
                  onClick={() => copyToClipboard(code.code, code.id)}
                >
                  {copiedId === code.id ? (
                    <CheckCircle2 className="text-success" />
                  ) : (
                    <Copy />
                  )}
                </Button>
              </div>
            ),
          },
          {
            key: 'status',
            header: '状态',
            render: (code) => (
              <Badge variant={code.status === 'used' ? 'secondary' : 'success'}>
                {code.status === 'used' ? '已使用' : '未使用'}
              </Badge>
            ),
          },
          {
            key: 'usedByUsername',
            header: '使用者',
            className: 'font-medium text-ink-2',
            render: (code) => getCodeField<string | null>(code, 'usedByUsername', 'used_by_username', null) || '-',
          },
          {
            key: 'createdAt',
            header: '生成时间',
            className: 'text-ink-3',
            render: (code) => formatCodeDate(getCodeField<string | null>(code, 'createdAt', 'created_at', null)),
          },
          {
            key: 'usedAt',
            header: '使用时间',
            className: 'text-ink-3',
            render: (code) => formatCodeDate(getCodeField<string | null>(code, 'usedAt', 'used_at', null)),
          },
          {
            key: 'activationSource',
            header: '开通来源',
            className: 'text-ink-3',
            render: (code) => {
              const activationSource = getCodeField<string | null>(code, 'activationSource', 'activation_source', null);
              const activationRemark = getCodeField<string | null>(code, 'activationRemark', 'activation_remark', null);
              if (!activationSource) return '-';
              return (
                <div className="space-y-1">
                  <div>{activationSource}</div>
                  {activationRemark ? <div className="text-xs text-ink-3/80">{activationRemark}</div> : null}
                </div>
              );
            },
          },
        ]}
        rows={codes}
        getRowKey={(code) => code.id}
        isLoading={loading}
        empty={<EmptyState icon={Key} title="暂无激活码记录" className="bg-card" />}
      />
    </div>
  );
}
