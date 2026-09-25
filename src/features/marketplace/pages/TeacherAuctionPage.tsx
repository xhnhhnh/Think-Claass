import { toast } from 'sonner';
import { Clock, Coins, Edit2, Gavel, RefreshCw, Tag, Trash2 } from 'lucide-react';

import { type Auction, type AuctionPayload } from '@/features/marketplace/api/shopApi';
import { CrudPage, type CrudField } from '@/components/crud/CrudPage';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { useTeacherAuctionMutation, useTeacherAuctions } from '@/hooks/queries/useTeacherShop';
import { cn } from '@/lib/utils';

type AuctionForm = {
  item_name: string;
  description: string;
  starting_price: number;
  end_time: string;
  status: 'active' | 'ended';
};

const auctionFields: CrudField<AuctionForm>[] = [
  { name: 'item_name', label: '拍品名称', type: 'text', required: true, placeholder: '例如：校长合影体验券' },
  { name: 'description', label: '拍品描述', type: 'textarea', placeholder: '详细描述这个拍品的价值...' },
  { name: 'starting_price', label: '起拍价', type: 'number', required: true, min: 1 },
  { name: 'end_time', label: '截标时间', type: 'datetime-local', required: true },
  {
    name: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '竞拍中', value: 'active' },
      { label: '强制结束', value: 'ended' },
    ],
  },
];

function tomorrowInputValue() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 16);
}

function toDateTimeInputValue(value: string) {
  return value ? new Date(value).toISOString().slice(0, 16) : '';
}

function toAuctionPayload(form: AuctionForm): AuctionPayload {
  return {
    item_name: form.item_name.trim(),
    description: form.description.trim(),
    starting_price: Number(form.starting_price),
    end_time: form.end_time,
    status: form.status,
  };
}

/**
 * Auction card.
 *
 * The page is already a `CrudPage`, so what was left was its own chrome: the amber
 * `border-amber-200`/`from-amber-400 to-orange-500` hero and the two slate greys are
 * `warning` tokens now (amber is one of the product's two supporting accents, and it has
 * a token). The kit's `Badge`, `Button` and `Card` were already carrying the rest.
 */
function renderAuctionCard(
  auction: Auction,
  actions: {
    openEdit: (auction: Auction) => void;
    requestDelete: (auction: Auction) => void;
  },
) {
  const isEnded = auction.status === 'ended' || (auction.end_time && new Date(auction.end_time) < new Date());

  return (
    <Card className={cn('transition-all hover:shadow-raised', isEnded ? 'opacity-75 grayscale-[0.3]' : 'border-warning/20 shadow-card')}>
      <div className={cn('flex h-32 items-center justify-center', isEnded ? 'bg-surface-3' : 'bg-warning')}>
        <Gavel className={cn('size-16', isEnded ? 'text-fg-3' : 'text-fg-inverse opacity-90')} />
      </div>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="truncate">{auction.item_name}</CardTitle>
          <Badge variant={isEnded ? 'secondary' : 'default'}>{isEnded ? '已结束' : '竞拍中'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="line-clamp-2 h-10 text-sm text-fg-3">{auction.description}</p>
        <div className="flex flex-col gap-2 rounded-xl border bg-surface-3/40 p-3">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1 text-fg-3">
              <Tag />
              起拍价
            </span>
            <span className="font-medium">{auction.starting_price} 积分</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1 text-fg-3">
              <Clock />
              截标
            </span>
            <span className="font-medium">
              {new Date(auction.end_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2 text-sm">
            <span className="flex items-center gap-1 font-medium text-warning">
              <Coins />
              当前最高
            </span>
            <span className="text-lg font-black text-warning">{auction.current_price} 积分</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label={`编辑${auction.item_name}`} onClick={() => actions.openEdit(auction)}>
          <Edit2 />
        </Button>
        <Button type="button" variant="destructive" size="icon-sm" aria-label={`删除${auction.item_name}`} onClick={() => actions.requestDelete(auction)}>
          <Trash2 />
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * 拍卖行管理.
 *
 * The page is already a `CrudPage`, so what was left was its own chrome: the amber
 * hero and the two slate greys are `warning` tokens now (amber is one of the product's
 * two supporting accents, and it has a token). The kit's `Badge`, `Button` and `Card`
 * were already carrying the rest.
 *
 * `CrudPage` still renders its own `PageHeader` (it is a shared component outside this
 * batch's write scope): with a shell present that contributes only the create action to
 * the context bar, and with no shell - what a page test renders - it is the page's one
 * heading. The scaffold therefore passes no `title`, so the heading is never printed
 * twice. The command the page can register from here is the list refresh, because the
 * create dialog is owned by `CrudPage`.
 */
export default function TeacherAuction() {
  const { data: auctions = [], isLoading, refetch } = useTeacherAuctions();
  const auctionMutation = useTeacherAuctionMutation();

  useRegisterPageCommands([
    {
      id: 'teacher-auction:refresh',
      label: '刷新拍品',
      icon: RefreshCw,
      keywords: ['拍卖', '拍品', '刷新'],
      run: () => void refetch(),
    },
  ]);

  return (
    <PageScaffold variant="dashboard">
      <CrudPage<Auction, AuctionForm>
        title="拍卖行管理"
        description="发布稀有物品，让学生体验竞拍的乐趣"
        addLabel="发布拍品"
        emptyTitle="拍卖行空空如也"
        emptyDescription="快去发布一件拍品吧"
        icon={Gavel}
        items={auctions}
        isLoading={isLoading}
        fields={auctionFields}
        createInitialForm={() => ({
          item_name: '',
          description: '',
          starting_price: 100,
          end_time: tomorrowInputValue(),
          status: 'active',
        })}
        mapItemToForm={(auction) => ({
          item_name: auction.item_name,
          description: auction.description || '',
          starting_price: auction.starting_price,
          end_time: toDateTimeInputValue(auction.end_time),
          status: auction.status,
        })}
        getItemId={(auction) => auction.id}
        getItemTitle={(auction) => auction.item_name}
        validateForm={(form) => {
          if (!form.item_name.trim() || Number(form.starting_price) <= 0 || !form.end_time) {
            return '请填写完整的拍卖信息';
          }
          return null;
        }}
        onCreate={async (form) => {
          await auctionMutation.mutateAsync({ type: 'create', data: toAuctionPayload(form) });
          toast.success('发布成功');
        }}
        onUpdate={async (auctionId, form) => {
          await auctionMutation.mutateAsync({ type: 'update', auctionId, data: toAuctionPayload(form) });
          toast.success('修改成功');
        }}
        onDelete={async (auctionId) => {
          await auctionMutation.mutateAsync({ type: 'delete', auctionId });
          toast.success('删除成功');
        }}
        renderItem={renderAuctionCard}
      />
    </PageScaffold>
  );
}
