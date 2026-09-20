import { useState } from 'react';
import { Calendar, CheckCircle2, Clock, Clock4, FileText, PlusCircle, XCircle } from 'lucide-react';
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

interface LeaveRequest {
  id: number;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

/**
 * 请假假条.
 *
 * Local-only page: the two seeded rows and every new one live in `useState`, and nothing
 * here calls an API. It is `PageHeader` + `SectionCard` + `Badge` now, with the form moved
 * into a `Dialog` behind `FormField` - the four controls were hand-styled with an indigo
 * focus ring, their labels were never associated with them, and the modal was a fixed
 * overlay with a `shadow-2xl` and a blurred decoration behind it.
 *
 * `老师查看中` is `info` rather than the amber it was written in: the row is with the
 * teacher, and `warning` is what the rejected state means here.
 */
export default function ParentLeaveRequest() {
  const [requests, setRequests] = useState<LeaveRequest[]>([
    {
      id: 1,
      startDate: '2023-11-20',
      endDate: '2023-11-21',
      reason: '感冒发烧，需要去医院就诊',
      status: 'approved',
      submittedAt: '2023-11-19 08:30'
    },
    {
      id: 2,
      startDate: '2023-12-05',
      endDate: '2023-12-05',
      reason: '参加亲戚婚礼',
      status: 'pending',
      submittedAt: '2023-11-28 14:20'
    }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    startDate: '',
    endDate: '',
    reason: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.startDate || !newRequest.endDate || !newRequest.reason) {
      toast.error('请填写完整的假条信息');
      return;
    }

    if (new Date(newRequest.endDate) < new Date(newRequest.startDate)) {
      toast.error('结束日期不能早于开始日期哦');
      return;
    }

    const newReq: LeaveRequest = {
      id: Date.now(),
      ...newRequest,
      status: 'pending',
      submittedAt: new Date().toLocaleString().slice(0, 16).replace('T', ' ')
    };

    setRequests([newReq, ...requests]);
    setIsModalOpen(false);
    setNewRequest({ startDate: '', endDate: '', reason: '' });
    toast.success('假条已经交给老师啦');
  };

  /** The status icon keeps the shape the row had; the chip next to it carries the colour. */
  const getStatusIcon = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'approved': return <CheckCircle2 aria-hidden="true" className="size-5 text-success" />;
      case 'rejected': return <XCircle aria-hidden="true" className="size-5 text-warning" />;
      case 'pending': return <Clock4 aria-hidden="true" className="size-5 text-info" />;
    }
  };

  const getStatusText = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'approved': return <Badge variant="success">老师已同意</Badge>;
      case 'rejected': return <Badge variant="warning">需要再沟通</Badge>;
      case 'pending': return <Badge variant="info">老师查看中</Badge>;
    }
  };

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
        {requests.length > 0 ? (
          <div className="divide-y divide-border">
            {requests.map((request) => (
              <div key={request.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  {getStatusIcon(request.status)}
                  {getStatusText(request.status)}
                  <span className="text-sm font-medium tracking-wider text-ink-3">
                    提交于 {request.submittedAt}
                  </span>
                </div>

                <div className="mt-4 rounded-panel border border-border bg-muted/50 p-5">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-3">
                    请假时间
                  </span>
                  <p className="text-[15px] font-bold text-ink-2">
                    {request.startDate} <span className="mx-2 font-normal text-ink-3">至</span> {request.endDate}
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
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Calendar} className="border-0 bg-transparent" title="还没有请假记录哦" />
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
              <Button type="submit">交给老师</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
