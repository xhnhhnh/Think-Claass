import { useState, useEffect } from 'react';
import { Package, Store, Plus, CheckCircle, XCircle, Search, Edit2 } from 'lucide-react';

interface ShopItem {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: number;
}

export default function TeacherShop() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/shop/all');
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const toggleStatus = async (id: number, currentStatus: number) => {
    try {
      const res = await fetch(`/api/shop/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: currentStatus === 1 ? 0 : 1 }),
      });
      const data = await res.json();
      if (data.success) {
        fetchItems();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const updateStock = async (item: ShopItem, newStock: number) => {
    if (newStock < -1) return;
    
    try {
      const res = await fetch(`/api/shop/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          stock: newStock
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        fetchItems();
      } else {
        alert(data.message || '库存更新失败');
      }
    } catch (err) {
      console.error(err);
      alert('网络错误，请稍后重试');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      let url = '/api/shop';
      let method = 'POST';

      if (isEditing && currentItem.id) {
        url = `/api/shop/${currentItem.id}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentItem),
      });
      const data = await res.json();
      
      if (data.success) {
        setShowModal(false);
        fetchItems();
      } else {
        setError(data.message || '操作失败');
      }
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
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center space-x-4">
          <div className="relative w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-slate-50/50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
              placeholder="搜索商品名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="all">全部库存状态</option>
            <option value="in_stock">有货 / 无限</option>
            <option value="out_of_stock">已售罄</option>
          </select>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center px-4 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl hover:from-indigo-600 hover:to-cyan-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium"
        >
          <Plus className="h-5 w-5 mr-2" />
          添加商品
        </button>
      </div>

      {/* Items Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <div key={item.id} className={`bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border overflow-hidden transition-all ${item.is_active === 1 ? 'border-white/60 hover:shadow-md' : 'border-gray-200 opacity-75'}`}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-2xl ${item.is_active === 1 ? 'bg-orange-50 text-orange-500' : 'bg-slate-100/50 text-gray-400'} mr-3`}>
                      <Store className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{item.name}</h3>
                      <div className="flex items-center mt-1 space-x-2">
                        <span className="font-bold text-orange-500">{item.price} 币</span>
                        <span className="text-xs text-gray-400">|</span>
                        <div className="flex items-center">
                          <span className={`text-xs ${item.stock === 0 ? 'text-red-500 font-bold' : item.stock > 0 && item.stock <= 5 ? 'text-yellow-600 font-bold' : 'text-slate-500'}`}>
                            库存: {item.stock === -1 ? '无限' : item.stock}
                          </span>
                          {item.stock !== -1 && (
                            <div className="flex items-center ml-2 border border-gray-200 rounded bg-white/80 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                              <button 
                                onClick={() => updateStock(item, item.stock - 1)}
                                disabled={item.stock <= 0}
                                className="px-1.5 py-0.5 text-slate-500 hover:bg-slate-100/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                -
                              </button>
                              <div className="w-px h-3 bg-gray-200"></div>
                              <button 
                                onClick={() => updateStock(item, item.stock + 1)}
                                className="px-1.5 py-0.5 text-slate-500 hover:bg-slate-100/50 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {item.is_active === 1 ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100/50 text-indigo-800">
                      已上架
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100/50 text-slate-800">
                      已下架
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-600 mb-6 h-10 line-clamp-2">
                  {item.description || '暂无描述'}
                </p>

                <div className="flex space-x-2 border-t border-white/60 pt-4">
                  <button
                    onClick={() => openEditModal(item)}
                    className="flex-1 flex justify-center items-center px-3 py-2 border border-gray-200 text-sm font-medium rounded-xl text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50 transition-colors"
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    编辑
                  </button>
                  <button
                    onClick={() => toggleStatus(item.id, item.is_active)}
                    className={`flex-1 flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-xl transition-colors ${
                      item.is_active === 1 
                        ? 'text-red-700 bg-red-50 hover:bg-red-100' 
                        : 'text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50'
                    }`}
                  >
                    {item.is_active === 1 ? (
                      <>
                        <XCircle className="h-4 w-4 mr-1" />
                        下架
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        上架
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500 bg-white/80 backdrop-blur-xl rounded-2xl border border-dashed border-gray-300">
              未找到商品信息
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                {isEditing ? '编辑商品' : '添加新商品'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">商品名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={currentItem.name}
                    onChange={(e) => setCurrentItem({ ...currentItem, name: e.target.value })}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="例如: 免值日卡"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">商品描述</label>
                  <textarea
                    value={currentItem.description}
                    onChange={(e) => setCurrentItem({ ...currentItem, description: e.target.value })}
                    rows={3}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="描述该商品的用途..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">所需积分 <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={currentItem.price}
                      onChange={(e) => setCurrentItem({ ...currentItem, price: parseInt(e.target.value) || 0 })}
                      className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">库存数量 <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="-1"
                        value={currentItem.stock === 0 ? 0 : currentItem.stock || -1}
                        onChange={(e) => setCurrentItem({ ...currentItem, stock: parseInt(e.target.value) })}
                        className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="填-1表示无限库存"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">填写 -1 表示库存无限</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}