import { toast } from 'sonner';
import { Coins, Edit2, Eye, EyeOff, Package, RefreshCw, Trash2 } from 'lucide-react';

import { type BlindBox, type BlindBoxPayload } from '@/features/marketplace/api/shopApi';
import { CrudPage, type CrudField } from '@/components/crud/CrudPage';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { useTeacherBlindBoxMutation, useTeacherBlindBoxes } from '@/hooks/queries/useTeacherShop';
import { cn } from '@/lib/utils';

type BlindBoxForm = {
  name: string;
  description: string;
  price: number;
  is_active: boolean;
};

const blindBoxFields: CrudField<BlindBoxForm>[] = [
  { name: 'name', label: '盲盒名称', type: 'text', required: true, placeholder: '例如：期末狂欢盲盒' },
  { name: 'description', label: '盲盒描述', type: 'textarea', placeholder: '描述一下这个盲盒可能开出什么...' },
  { name: 'price', label: '兑换价格 (积分)', type: 'number', required: true, min: 1 },
  { name: 'is_active', label: '立即上架 (学生端可见)', type: 'checkbox' },
];

function toBlindBoxPayload(form: BlindBoxForm): BlindBoxPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: Number(form.price),
    is_active: form.is_active,
  };
}

/**
 * 盲盒管理.
 *
 * `CrudPage` owns the header, the form dialog and the delete confirmation; what this
 * file still writes itself is the tile, whose `purple`/`indigo`/`blue` families are the
 * `role` and `info` tokens now. The probability copy is untouched.
 *
 * `CrudPage` still renders its own `PageHeader` (a shared component outside this
 * batch's write scope): with a shell present it contributes only the create action to
 * the context bar, and with no shell - what a page test renders - it is the page's one
 * heading, so the scaffold passes no `title` and nothing is printed twice. The command
 * reachable from here is the list refresh, because the create dialog lives in
 * `CrudPage`.
 */
function renderBlindBoxCard(
  box: BlindBox,
  actions: {
    openEdit: (box: BlindBox) => void;
    requestDelete: (box: BlindBox) => void;
  },
  toggleBox: (box: BlindBox) => void,
) {
  const isActive = box.is_active === 1;

  return (
    <Card className={cn('transition-all hover:shadow-raised', isActive ? 'border-role/20 shadow-card' : 'opacity-75 grayscale-[0.5]')}>
      <div className={cn('relative flex h-32 items-center justify-center', isActive ? 'bg-role' : 'bg-surface-3')}>
        <Package className={cn('size-16', isActive ? 'text-role-contrast opacity-80' : 'text-fg-3')} />
        <div className="absolute right-3 top-3">
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            aria-label={isActive ? `下架${box.name}` : `上架${box.name}`}
            onClick={() => toggleBox(box)}
          >
            {isActive ? <Eye /> : <EyeOff />}
          </Button>
        </div>
      </div>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="truncate">{box.name}</CardTitle>
          <Badge variant={isActive ? 'default' : 'secondary'}>{isActive ? '售卖中' : '已下架'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="line-clamp-2 h-10 text-sm text-fg-3">{box.description || '神秘的盲盒，开启后可获得随机奖励！'}</p>
        <div className="flex items-center justify-between rounded-xl border bg-surface-3/40 p-3">
          <span className="flex items-center gap-1 text-sm text-fg-3">
            <Coins />
            价格
          </span>
          <span className="font-bold text-warning">{box.price} 积分</span>
        </div>
        <div className="rounded-lg bg-info/10 p-3 text-xs text-info">
          <p className="mb-1 font-bold">当前内置概率规则：</p>
          <p>10% 稀有道具，30% 普通道具，60% 保底退还 10 积分。</p>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label={`编辑${box.name}`} onClick={() => actions.openEdit(box)}>
          <Edit2 />
        </Button>
        <Button type="button" variant="destructive" size="icon-sm" aria-label={`删除${box.name}`} onClick={() => actions.requestDelete(box)}>
          <Trash2 />
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function TeacherBlindBox() {
  const { data: boxes = [], isLoading, refetch } = useTeacherBlindBoxes();
  const blindBoxMutation = useTeacherBlindBoxMutation();

  const handleToggle = async (box: BlindBox) => {
    await blindBoxMutation.mutateAsync({ type: 'toggle', box });
    toast.success(box.is_active === 1 ? '盲盒已下架' : '盲盒已上架');
  };

  useRegisterPageCommands([
    {
      id: 'teacher-blind-box:refresh',
      label: '刷新盲盒',
      icon: RefreshCw,
      keywords: ['盲盒', '刷新', '上架'],
      run: () => void refetch(),
    },
  ]);

  return (
    <PageScaffold variant="dashboard">
      <CrudPage<BlindBox, BlindBoxForm>
        title="盲盒管理"
        description="创建神秘盲盒，让学生用积分兑换随机惊喜奖励"
        addLabel="上架新盲盒"
        emptyTitle="暂无盲盒"
        emptyDescription="快去上架一个吧"
        icon={Package}
        items={boxes}
        isLoading={isLoading}
        fields={blindBoxFields}
        createInitialForm={() => ({ name: '', description: '', price: 50, is_active: true })}
        mapItemToForm={(box) => ({
          name: box.name,
          description: box.description || '',
          price: box.price,
          is_active: box.is_active === 1,
        })}
        getItemId={(box) => box.id}
        getItemTitle={(box) => box.name}
        validateForm={(form) => {
          if (!form.name.trim() || Number(form.price) <= 0) {
            return '请输入有效名称和价格';
          }
          return null;
        }}
        onCreate={async (form) => {
          await blindBoxMutation.mutateAsync({ type: 'create', data: toBlindBoxPayload(form) });
          toast.success('创建成功');
        }}
        onUpdate={async (boxId, form) => {
          await blindBoxMutation.mutateAsync({ type: 'update', boxId, data: toBlindBoxPayload(form) });
          toast.success('修改成功');
        }}
        onDelete={async (boxId) => {
          await blindBoxMutation.mutateAsync({ type: 'delete', boxId });
          toast.success('删除成功');
        }}
        renderItem={(box, actions) => renderBlindBoxCard(box, actions, handleToggle)}
      />
    </PageScaffold>
  );
}
