import { useState } from 'react';
import { Calendar, CheckCircle2, Clock, Clock4, FileText, Heart, LoaderCircle, PlusCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Textarea } from '@/components/ui/textarea';
import { useCreateLeaveMutation, useLeaves } from '@/features/classroom/hooks/useLeaves';
import { useStore } from '@/store/useStore';

/**
 * `created_at` is SQLite's `CURRENT_TIMESTAMP`, i.e. UTC in `YYYY-MM-DD HH:MM:SS`; the bare
 * string parses as local time, so the zone is appended before the day and minute are shown.
 * Anything already in another format is handed to `Date` untouched.
 */
function formatSubmittedAt(createdAt: string) {
  const utc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(createdAt)
    ? `${createdAt.replace(' ', 'T')}Z`
    : createdAt;
  const parsed = new Date(utc);

  if (Number.isNaN(parsed.getTime())) return createdAt;

  return parsed.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 请假假条.
 *
 * The two rows and every new request used to live in `useState`, so the page showed invented
 * history and a submit that never reached the server. It now reads `GET /api/leaves` for the
 * bound child and files through `POST /api/leaves` (see `features/classroom/hooks/useLeaves`),
 * which is also why an empty list is an `EmptyState` rather than a placeholder row.
 *
 * `老师查看中` is `info` rather than the amber it was written in: the row is with the
 * teacher, and `warning` is what the rejected state means here. A status the server has but
 * this page does not name is printed as-is instead of being folded into one of the three.
 */
export default function ParentLeaveRequest() {
  const user = useStore((state) => state.user);
  const studentId = user?.studentId ?? null;
  const { data: requests = [], isLoading, error } = useLeaves({ studentId }, !!studentId);
  const createLeaveMutation = useCreateLeaveMutation(studentId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    startDate: '',
    endDate: '',
    reason: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      toast.error('还没有绑定宝贝信息，暂时无法提交假条');
      return;
    }

    if (!newRequest.startDate || !newRequest.endDate || !newRequest.reason) {
      toast.error('请填写完整的假条信息');
      return;
    }

    if (new Date(newRequest.endDate) < new Date(newRequest.startDate)) {
      toast.error('结束日期不能早于开始日期哦');
      return;
    }

    try {
      await createLeaveMutation.mutateAsync({
        start_date: newRequest.startDate,
        end_date: newRequest.endDate,
        reason: newRequest.reason,
      });
      setIsModalOpen(false);
      setNewRequest({ startDate: '', endDate: '', reason: '' });
      toast.success('假条已经交给老师啦');
    } catch {
      // `@/lib/api` already showed the server's message; the dialog stays open so the form
      // is not thrown away on a rejection.
    }
  };

  /** The status icon keeps the shape the row had; the chip next to it carries the colour. */
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle2 aria-hidden="true" className="size-5 text-success" />;
      case 'rejected': return <XCircle aria-hidden="true" className="size-5 text-warning" />;
      case 'pending': return <Clock4 aria-hidden="true" className="size-5 text-info" />;
      default: return <Clock aria-hidden="true" className="size-5 text-ink-3" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return <Badge variant="success">老师已同意</Badge>;
      case 'rejected': return <Badge variant="warning">需要再沟通</Badge>;
      case 'pending': return <Badge variant="info">老师查看中</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!studentId) {
    return (
      <EmptyState
        icon={Heart}
        className="mx-auto max-w-xl"
        title="等待宝贝加入"
        description="您的账号还没有绑定宝贝信息，绑定后就能为宝贝提交假条了。"
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="请假假条"
        description="为宝贝向老师请个假，记录缺席的日子"
        icon={Calendar}
        actions={
          <Button type="button" onClick={() => setIsModalOpen(true)}>
            <PlusCircle data-icon="inline-start" />
            写新假条
          </Button>
        }
      />

      <SectionCard
        className="gap-0"
        contentClassName="p-0"
        title={
          <span className="flex items-center gap-2">
            <Clock aria-hidden="true" className="size-4 text-warning" />
            假条记录
          </span>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-ink-3">
            <LoaderCircle className="mr-3 size-5 animate-spin" />
            正在获取假条记录...
          </div>
        ) : error ? (
          <div className="p-10 text-center text-red-600">假条记录加载失败，请稍后重试。</div>
        ) : requests.length > 0 ? (
          <div className="divide-y divide-border">
            {requests.map((request) => (
              <div key={request.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  {getStatusIcon(request.status)}
                  {getStatusText(request.status)}
                  <span className="text-sm font-medium tracking-wider text-ink-3">
                    提交于 {formatSubmittedAt(request.created_at)}
                  </span>
                </div>

                <div className="mt-4 rounded-panel border border-border bg-muted/50 p-5">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-3">
                    请假时间
                  </span>
                  <p className="text-[15px] font-bold text-ink-2">
                    {request.start_date} <span className="mx-2 font-normal text-ink-3">至</span> {request.end_date}
                  </p>
                </div>

                <div className="mt-4">
                  <span className="mb-2 flex items-center text-xs font-bold uppercase tracking-widest text-ink-3">
                    <FileText aria-hidden="true" className="mr-1.5 size-3.5" />
                    请假事由
                  </span>
                  <p className="rounded-panel border border-border bg-paper p-4 text-[15px] leading-relaxed text-ink-2">
                    {request.reason}
                  </p>
                </div>

                {request.review_comment ? (
                  <div className="mt-4">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-3">
                      老师回复
                    </span>
                    <p className="rounded-panel border border-border bg-paper p-4 text-[15px] leading-relaxed text-ink-2">
                      {request.review_comment}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Calendar}
            className="border-0 bg-transparent"
            title="还没有请假记录哦"
            description="写完假条交给老师之后会显示在这里"
          />
        )}
      </SectionCard>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>写新假条</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="开始日期" required>
                <Input
                  type="date"
                  value={newRequest.startDate}
                  onChange={(e) => setNewRequest({ ...newRequest, startDate: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="结束日期" required>
                <Input
                  type="date"
                  value={newRequest.endDate}
                  onChange={(e) => setNewRequest({ ...newRequest, endDate: e.target.value })}
                  required
                />
              </FormField>
            </div>

            <FormField label="请假事由" required>
              <Textarea
                rows={4}
                placeholder="跟老师说明一下原因吧..."
                value={newRequest.reason}
                onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                className="resize-none leading-relaxed"
                required
              />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                不请了
              </Button>
              <Button type="submit" disabled={createLeaveMutation.isPending}>
                {createLeaveMutation.isPending ? '提交中...' : '交给老师'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
