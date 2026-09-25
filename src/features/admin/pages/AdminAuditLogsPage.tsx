import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar, RefreshCw, Search, Shield } from 'lucide-react';

import { adminClient } from '@/features/admin/api/adminClient';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Toolbar } from '@/components/ui/toolbar';

interface AuditLog {
  id: number;
  teacher_id: number;
  user_id: number;
  action: string;
  details: string;
  ip_address: string;
  created_at: string;
}

/**
 * 系统审计日志.
 *
 * The list was a hand-written `<table>` that carried its own "加载中..." row and its own
 * empty row; `DataTable` owns both states now, and the hand-built filter card above it
 * became the scaffold's `toolbar` slot, which `variant="list"` keeps stuck to the top
 * while the table scrolls. The filters still only fill state - the query is issued by
 * 查询 and by a page change, so typing never hits the API, exactly as before.
 *
 * The heading is the scaffold's `title` (suppressed while the shell renders the route's
 * `h1`); 刷新数据 is both the scaffold's `actions` entry and a command-palette command.
 *
 * The action filter is the toolbar's search slot because it is the page's one
 * search-shaped control; `searchLabel` keeps 操作类型 (Action) as its accessible name
 * now that the visible label is the toolbar's own layout. The two id filters keep a
 * visible label through `FormField`, which *wraps* its control rather than pointing at
 * it, so `getByLabelText('教师 ID')` resolves against the kit's markup the same way it
 * did against the raw one.
 */
export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [teacherId, setTeacherId] = useState('');
  const [userId, setUserId] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await adminClient.getAuditLogs({
        limit,
        offset: (page - 1) * limit,
        teacherId: teacherId ? Number(teacherId) : undefined,
        userId: userId ? Number(userId) : undefined,
        action: actionFilter || undefined,
      });
      if (data.success) {
        setLogs(data.data.map((log) => ({
          id: log.id,
          teacher_id: log.teacherId ?? 0,
          user_id: log.userId ?? 0,
          action: log.action,
          details: log.details,
          ip_address: log.ipAddress,
          created_at: log.createdAt ?? '',
        })));
        setTotal(data.total);
      } else {
        toast.error('获取审计日志失败');
      }
    } catch (error) {
      toast.error('网络错误，无法获取审计日志');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  /**
   * 查询 refetches through this render's `fetchLogs`, which reads the filters this
   * render holds - and, on a page other than the first, `setPage(1)` also triggers the
   * effect above, so the request is issued twice and the effect's offset-0 one wins.
   * That is one request more than the button needs, but *which* requests a control
   * makes is behaviour, and this migration only moves markup onto the kit.
   */
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  /**
   * 重置 keeps the `setTimeout` it had before the refactor, and with it the wart: the
   * timer calls this render's `fetchLogs`, so it still sends the *old* filter values -
   * the cleared ones reach the API only through the effect above, and only when `page`
   * actually changed. Fixing that would change what the button requests; see
   * `handleSearch` for why that is out of scope here.
   */
  const handleReset = () => {
    setTeacherId('');
    setUserId('');
    setActionFilter('');
    setPage(1);
    setTimeout(fetchLogs, 0);
  };

  const totalPages = Math.ceil(total / limit);

  useRegisterPageCommands([
    {
      id: 'admin-audit-logs:refresh',
      label: '刷新数据',
      icon: RefreshCw,
      keywords: ['审计日志', '刷新'],
      run: () => void fetchLogs(),
    },
  ]);

  return (
    <PageScaffold
      variant="list"
      title="系统审计日志"
      description="查看系统的所有关键操作记录，用于安全审计和追踪溯源"
      actions={
        <Button variant="outline" onClick={fetchLogs} disabled={loading}>
          <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : undefined} />
          刷新数据
        </Button>
      }
      toolbar={
        /*
          The form wraps the whole toolbar so Enter still submits from any filter, which
          is what the hand-written `<form>` around the old filter panel did.
        */
        <form onSubmit={handleSearch}>
          <Toolbar
            search={{
              value: actionFilter,
              onChange: setActionFilter,
              placeholder: '例如: LOGIN, UPDATE_USER',
            }}
            searchLabel="操作类型 (Action)"
            filters={
              <>
                <FormField label="教师 ID" className="w-full sm:w-40">
                  <Input
                    type="number"
                    value={teacherId}
                    onChange={(e) => setTeacherId(e.target.value)}
                    placeholder="输入教师 ID"
                  />
                </FormField>
                <FormField label="用户 ID" className="w-full sm:w-40">
                  <Input
                    type="number"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="输入用户 ID"
                  />
                </FormField>
              </>
            }
            actions={
              <>
                <Button type="submit">
                  <Search data-icon="inline-start" />
                  查询
                </Button>
                <Button type="button" variant="outline" onClick={handleReset}>
                  重置
                </Button>
              </>
            }
          />
        </form>
      }
    >
      <DataTable<AuditLog>
        columns={[
          {
            key: 'id',
            header: 'ID',
            className: 'text-fg-3',
            render: (log) => `#${log.id}`,
          },
          {
            key: 'created_at',
            header: '时间',
            className: 'text-fg-2',
            render: (log) => (
              <span className="flex items-center gap-1">
                <Calendar aria-hidden="true" className="size-3 text-fg-3" />
                {new Date(log.created_at).toLocaleString()}
              </span>
            ),
          },
          {
            key: 'action',
            header: '操作类型',
            // The chip used to be an indigo pill; §5 of docs/design-system.md maps that
            // family onto the brand's own primary, at chip strength: a /10 background
            // with primary text.
            render: (log) => <Badge className="bg-role/10 text-role">{log.action}</Badge>,
          },
          {
            key: 'teacher_id',
            header: '操作人',
            className: 'text-fg-2',
            render: (log) => (log.teacher_id ? `Teacher ID: ${log.teacher_id}` : '-'),
          },
          {
            key: 'user_id',
            header: '目标用户',
            className: 'text-fg-2',
            render: (log) => (log.user_id ? `User ID: ${log.user_id}` : '-'),
          },
          {
            key: 'details',
            header: '详情',
            className: 'text-fg-3',
            // A block with a max width is what makes `truncate` bite inside a table
            // cell; the full value stays reachable through the title.
            render: (log) => (
              <span className="block max-w-md truncate" title={log.details}>
                {log.details || '-'}
              </span>
            ),
          },
          {
            key: 'ip_address',
            header: 'IP 地址',
            className: 'font-mono text-xs text-fg-3',
            render: (log) => log.ip_address || '-',
          },
        ]}
        rows={logs}
        getRowKey={(log) => log.id}
        isLoading={loading}
        empty={
          <EmptyState
            icon={Shield}
            title="没有找到符合条件的审计日志"
            className="bg-surface-2"
          />
        }
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-1 bg-surface-2 px-4 py-3">
          <div className="text-sm text-fg-3">
            共 <span className="font-medium text-fg-1">{total}</span> 条记录，
            第 <span className="font-medium text-fg-1">{page}</span> / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </PageScaffold>
  );
}
