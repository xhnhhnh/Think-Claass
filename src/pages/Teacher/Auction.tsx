import { toast } from 'sonner';
import { Clock, Coins, Edit2, Gavel, Tag, Trash2 } from 'lucide-react';

import { type Auction, type AuctionPayload } from '@/features/marketplace/api/shopApi';
import { CrudPage, type CrudField } from '@/components/crud/CrudPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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

function renderAuctionCard(
  auction: Auction,
  actions: {
    openEdit: (auction: Auction) => void;
    requestDelete: (auction: Auction) => void;
  },
) {
  const isEnded = auction.status === 'ended' || (auction.end_time && new Date(auction.end_time) < new Date());

  return (
    <Card className={cn('transition-all hover:shadow-lg', isEnded ? 'opacity-75 grayscale-[0.3]' : 'border-amber-200 shadow-sm')}>
      <div className={cn('flex h-32 items-center justify-center', isEnded ? 'bg-slate-200' : 'bg-gradient-to-br from-amber-400 to-orange-500')}>
        <Gavel className={cn('size-16', isEnded ? 'text-slate-400' : 'text-white opacity-90')} />
      </div>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="truncate">{auction.item_name}</CardTitle>
          <Badge variant={isEnded ? 'secondary' : 'default'}>{isEnded ? '已结束' : '竞拍中'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="line-clamp-2 h-10 text-sm text-muted-foreground">{auction.description}</p>
        <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Tag />
              起拍价
            </span>
            <span className="font-medium">{auction.starting_price} 积分</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock />
              截标
            </span>
            <span className="font-medium">
              {new Date(auction.end_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2 text-sm">
            <span className="flex items-center gap-1 font-medium text-amber-600">
              <Coins />
              当前最高
            </span>
            <span className="text-lg font-black text-amber-600">{auction.current_price} 积分</span>
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

export default function TeacherAuction() {
  const { data: auctions = [], isLoading } = useTeacherAuctions();
  const auctionMutation = useTeacherAuctionMutation();

  return (
    <CrudPage<Auction, AuctionForm>
      title="拍卖行管理"
      description="发布稀有物品，让学生体验竞拍的乐趣"
      addLabel="发布拍品"
      emptyTitle="拍卖行空空如也"
      emptyDescription="快去发布一件拍品吧"
      icon={<Gavel className="size-8 text-amber-500" />}
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
  );
}
