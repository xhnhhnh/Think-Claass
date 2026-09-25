import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle2, Clock, Gift, Ticket } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';

import { redemptionApi } from '@/features/engagement/api/redemptionApi';

interface RedemptionTicket {
  id: number;
  item_name: string;
  code: string;
  status: 'pending' | 'used';
  created_at: string;
  used_at: string | null;
}

/**
 * 我的兑换.
 *
 * A `list` page of ticket cards. The teal/emerald banner is gone with the duplicated
 * page title; the ticket keeps its notches, its cut-out code panel and the 「已使用」
 * stamp, all on the role/info/danger tokens. `待核销` / `已核销` are the same two
 * words in the kit's `Badge`, the code stays a monospaced read-out, and the fetch,
 * its `user` dependency and every string are unchanged.
 */
export default function StudentMyRedemptions() {
  const user = useStore((state) => state.user);
  const [tickets, setTickets] = useState<RedemptionTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const fetchTickets = async () => {
      if (!user?.studentId) return;
      try {
        const data = await redemptionApi.getMyTickets(user.studentId);
        if (data.success) {
          setTickets(data.tickets);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [user]);

  if (loading) {
    return (
      <PageScaffold variant="list" className="flex items-center justify-center py-20">
        <Spinner size="lg" label="正在加载兑换券" className="text-role" />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="list"
      title="我的兑换"
      description="查看你的实物奖品兑换券，向老师出示核销码即可领取奖品！"
    >
      {tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="暂无兑换记录"
          description="快去积分商城或抽奖获取奖品吧！"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {tickets.map((ticket, index) => {
            const used = ticket.status === 'used';

            return (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 16 }) }}
                animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
                transition={{ delay: index * 0.08 }}
                whileHover={used || shouldReduceMotion ? undefined : { y: -4 }}
                className={
                  'relative flex flex-col rounded-panel border-4 border-b-8 bg-surface-2 p-6 shadow-card transition-all ' +
                  (used
                    ? 'border-line-1 opacity-80 grayscale-[0.3]'
                    : 'border-role/30 hover:border-role/60')
                }
              >
                {/* The two notches that make the card read as a ticket. */}
                <div className="absolute -left-4 top-1/2 size-8 -translate-y-1/2 rounded-full border-y-4 border-r-4 border-line-1 bg-surface-1" />
                <div className="absolute -right-4 top-1/2 size-8 -translate-y-1/2 rounded-full border-y-4 border-l-4 border-line-1 bg-surface-1" />

                <div className="mb-6 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        'flex size-12 shrink-0 items-center justify-center rounded-full ' +
                        (used ? 'bg-surface-3' : 'bg-role-soft')
                      }
                    >
                      <Gift
                        aria-hidden="true"
                        className={'size-6 ' + (used ? 'text-fg-3' : 'text-role-ink')}
                      />
                    </div>
                    <h3 className="text-xl font-black text-fg-1">{ticket.item_name}</h3>
                  </div>
                  {used ? (
                    <Badge variant="secondary" className="h-auto gap-1.5 px-3 py-1.5 text-sm">
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                      已核销
                    </Badge>
                  ) : (
                    <Badge variant="info" className="h-auto animate-pulse gap-1.5 px-3 py-1.5 text-sm">
                      <Clock aria-hidden="true" className="size-4" />
                      待核销
                    </Badge>
                  )}
                </div>

                <div
                  className={
                    'relative mt-auto overflow-hidden rounded-card border-4 border-dashed p-6 text-center ' +
                    (used ? 'border-line-1 bg-surface-3' : 'border-role/40 bg-info-soft')
                  }
                >
                  {used && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                      <div className="rotate-[-12deg] select-none rounded-card border-4 border-danger/50 px-6 py-2 text-4xl font-black text-danger/50">
                        已使用
                      </div>
                    </div>
                  )}
                  <p className="mb-2 text-base font-bold text-fg-3">向老师出示此核销码</p>
                  <p
                    className={
                      'font-mono text-4xl font-black tracking-[0.25em] ' +
                      (used ? 'text-fg-3 line-through decoration-danger/50' : 'text-info')
                    }
                  >
                    {ticket.code}
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-1 text-center text-sm font-bold text-fg-3">
                  <span>兑换时间: {new Date(ticket.created_at).toLocaleString()}</span>
                  {ticket.used_at && (
                    <span>核销时间: {new Date(ticket.used_at).toLocaleString()}</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageScaffold>
  );
}
