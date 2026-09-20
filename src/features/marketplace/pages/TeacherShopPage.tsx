import { useState } from 'react';
import { CheckCircle, Edit2, Plus, Store, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useTeacherShopItems, useTeacherShopMutation } from '@/hooks/queries/useTeacherShop';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Toolbar } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';

interface ShopItem {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: number;
}

/**
 * 商品管理.
 *
 * The search/filter/add row is a `Toolbar`, the product tiles are `Card`s, the stock
 * stepper and the row actions are `Button`s, and the add/edit overlay is a `Dialog`
 * whose four fields keep their visible labels through `FormField`. The two raw class
 * strings that chose a colour by ternary are `cn()` calls now, and the fallback error
 * message is a toast rather than `alert()` - the last blocking browser dialog on this
 * page.
 */
export default function TeacherShop() {
  const { data: items = [], isLoading: loading, refetch } = useTeacherShopItems();
  const shopMutation = useTeacherShopMutation();
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentItem, setCurrentItem] = useState<Partial<ShopItem>>({
    name: '',
    description: '',
    price: 10,
    stock: 999,
    is_active: 1
  });
  const [error, setError] = useState('');

  const toggleStatus = async (id: number, currentStatus: number) => {
    try {
      await shopMutation.mutateAsync({ type: 'status', itemId: id, isActive: currentStatus === 1 ? 0 : 1 });
      await refetch();
    } catch (err) {
      console.error(err);
    }
  };

  const updateStock = async (item: ShopItem, newStock: number) => {
    if (newStock < -1) return;
    
    try {
      await shopMutation.mutateAsync({ type: 'update', itemId: item.id, data: { ...item, stock: newStock } });
      await refetch();
    } catch (err) {
      console.error(err);
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isEditing && currentItem.id) {
        await shopMutation.mutateAsync({ type: 'update', itemId: currentItem.id, data: currentItem });
      } else {
        await shopMutation.mutateAsync({ type: 'create', data: currentItem });
      }
      setShowModal(false);
      await refetch();
    } catch (err) {
      setError('网络错误');
    }
  };

  const openAddModal = () => {
    setIsEditing(false);
    setCurrentItem({
      name: '',
      description: '',
      price: 10,
      stock: 999,
      is_active: 1
    });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (item: ShopItem) => {
    setIsEditing(true);
    setCurrentItem(item);
    setError('');
    setShowModal(true);
  };

  const filteredItems = items.filter(item => {
    const matchSearch = item.name.includes(search) || (item.description && item.description.includes(search));
    const matchStock = stockFilter === 'all' 
      ? true 
      : stockFilter === 'in_stock' 
        ? item.stock > 0 || item.stock === -1 
        : item.stock === 0;
    return matchSearch && matchStock;
  });

  return (
    <div className="space-y-6">
      {/* Top Actions */}
      <Toolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: '搜索商品名称...',
        }}
        searchLabel="搜索商品名称"
        filters={
          <Select
            aria-label="库存状态"
            wrapperClassName="w-40"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <option value="all">全部库存状态</option>
            <option value="in_stock">有货 / 无限</option>
            <option value="out_of_stock">已售罄</option>
          </Select>
        }
        actions={
          <Button onClick={openAddModal}>
            <Plus data-icon="inline-start" />
            添加商品
          </Button>
        }
      />

      {/* Items Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-ink-3">
          <Spinner label="正在加载商品" />
          加载中...
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState icon={Store} title="未找到商品信息" />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className={cn('h-full transition-all', item.is_active === 1 ? 'hover:shadow-raised' : 'opacity-75')}
            >
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center">
                    <div
                      className={cn(
                        'mr-3 rounded-card p-2',
                        item.is_active === 1 ? 'bg-warning/10 text-warning' : 'bg-muted text-ink-3',
                      )}
                    >
                      <Store className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-ink-1">{item.name}</h3>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className="font-bold text-warning">{item.price} 币</span>
                        <span className="text-xs text-ink-3">|</span>
                        <div className="flex items-center">
                          <span
                            className={cn(
                              'text-xs',
                              item.stock === 0
                                ? 'font-bold text-destructive'
                                : item.stock > 0 && item.stock <= 5
                                  ? 'font-bold text-warning'
                                  : 'text-ink-3',
                            )}
                          >
                            库存: {item.stock === -1 ? '无限' : item.stock}
                          </span>
                          {item.stock !== -1 && (
                            <div className="ml-2 flex items-center rounded border border-border bg-paper shadow-card">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={item.stock <= 0}
                                onClick={() => updateStock(item, item.stock - 1)}
                              >
                                -
                              </Button>
                              <div className="h-3 w-px bg-border"></div>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => updateStock(item, item.stock + 1)}
                              >
                                +
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {item.is_active === 1 ? (
                    <Badge variant="default">已上架</Badge>
                  ) : (
                    <Badge variant="secondary">已下架</Badge>
                  )}
                </div>

                <p className="mb-6 h-10 text-sm text-ink-2 line-clamp-2">
                  {item.description || '暂无描述'}
                </p>

                <div className="flex space-x-2 border-t border-border pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => openEditModal(item)}
                  >
                    <Edit2 data-icon="inline-start" />
                    编辑
                  </Button>
                  <Button
                    variant={item.is_active === 1 ? 'destructive' : 'secondary'}
                    className="flex-1"
                    onClick={() => toggleStatus(item.id, item.is_active)}
                  >
                    {item.is_active === 1 ? (
                      <>
                        <XCircle data-icon="inline-start" />
                        下架
                      </>
                    ) : (
                      <>
                        <CheckCircle data-icon="inline-start" />
                        上架
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? '编辑商品' : '添加新商品'}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {error && (
              <Badge variant="destructive">{error}</Badge>
            )}
            
            <FormField label="商品名称" required>
              <Input
                type="text"
                required
                value={currentItem.name}
                onChange={(e) => setCurrentItem({ ...currentItem, name: e.target.value })}
                placeholder="例如: 免值日卡"
              />
            </FormField>
            
            <FormField label="商品描述">
              <Textarea
                value={currentItem.description}
                onChange={(e) => setCurrentItem({ ...currentItem, description: e.target.value })}
                rows={3}
                placeholder="描述该商品的用途..."
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="所需积分" required>
                <Input
                  type="number"
                  required
                  min="0"
                  value={currentItem.price}
                  onChange={(e) => setCurrentItem({ ...currentItem, price: parseInt(e.target.value) || 0 })}
                />
              </FormField>
              <FormField label="库存数量" required hint="填写 -1 表示库存无限">
                <Input
                  type="number"
                  required
                  min="-1"
                  value={currentItem.stock === 0 ? 0 : currentItem.stock || -1}
                  onChange={(e) => setCurrentItem({ ...currentItem, stock: parseInt(e.target.value) })}
                  placeholder="填-1表示无限库存"
                />
              </FormField>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                取消
              </Button>
              <Button type="submit">
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
