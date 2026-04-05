import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Package, Plus, Edit2, Trash2, Tag, Info, Coins, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BlindBox {
  id: number;
  name: string;
  description: string;
  price: number;
  is_active: number;
  created_at: string;
}

export default function TeacherBlindBox() {
  const [boxes, setBoxes] = useState<BlindBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 50,
    is_active: true
  });

  const fetchBoxes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shop/blind_boxes');
      const data = await res.json();
      if (data.success) {
        setBoxes(data.boxes);
      }
    } catch (error) {
      toast.error('获取盲盒列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoxes();
  }, []);

  const handleOpenModal = (box?: BlindBox) => {
    if (box) {
      setEditingId(box.id);
      setFormData({
        name: box.name,
        description: box.description || '',
        price: box.price,
        is_active: box.is_active === 1
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', description: '', price: 50, is_active: true });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.price <= 0) {
      toast.error('请输入有效名称和价格');
      return;
    }

    try {
      const url = editingId ? `/api/shop/blind_boxes/${editingId}` : '/api/shop/blind_boxes';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success(editingId ? '修改成功' : '创建成功');
        setIsModalOpen(false);
        fetchBoxes();
      } else {
        toast.error(data.message || '操作失败');
      }
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个盲盒吗？')) return;
    
    try {
      const res = await fetch(`/api/shop/blind_boxes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('删除成功');
        fetchBoxes();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleToggleActive = async (box: BlindBox) => {
    try {
      const res = await fetch(`/api/shop/blind_boxes/${box.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...box, is_active: box.is_active === 1 ? false : true })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(box.is_active === 1 ? '盲盒已下架' : '盲盒已上架');
        fetchBoxes();
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Package className="w-8 h-8 mr-3 text-purple-500" />
            盲盒管理
          </h2>
          <p className="text-gray-500 mt-2">创建神秘盲盒，让学生用积分兑换随机惊喜奖励</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2" />
          上架新盲盒
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">加载中...</div>
        ) : boxes.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">暂无盲盒，快去上架一个吧</p>
          </div>
        ) : (
          boxes.map(box => (
            <motion.div 
              key={box.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-white rounded-2xl overflow-hidden border transition-all hover:shadow-lg ${box.is_active ? 'border-purple-100 shadow-sm' : 'border-gray-200 opacity-75 grayscale-[0.5]'}`}
            >
              <div className={`h-32 flex items-center justify-center relative ${box.is_active ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gray-300'}`}>
                <Package className="w-16 h-16 text-white opacity-80" />
                <div className="absolute top-3 right-3 flex space-x-2">
                  <button 
                    onClick={() => handleToggleActive(box)}
                    className="p-1.5 bg-white/20 hover:bg-white/40 rounded-lg backdrop-blur-sm text-white transition-colors"
                    title={box.is_active ? '点击下架' : '点击上架'}
                  >
                    {box.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 w-full px-4 py-2 bg-gradient-to-t from-black/50 to-transparent">
                  <span className={`px-2 py-0.5 text-xs rounded font-medium ${box.is_active ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}`}>
                    {box.is_active ? '售卖中' : '已下架'}
                  </span>
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-1 truncate">{box.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2 h-10">{box.description || '神秘的盲盒，开启后可获得随机奖励！'}</p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center text-amber-500 font-bold">
                    <Coins className="w-4 h-4 mr-1" />
                    {box.price}
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => handleOpenModal(box)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(box.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-purple-50">
                <h3 className="text-xl font-bold text-purple-800 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  {editingId ? '编辑盲盒' : '上架新盲盒'}
                </h3>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center"><Tag className="w-4 h-4 mr-1" /> 盲盒名称</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                    placeholder="例如：期末狂欢盲盒"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center"><Info className="w-4 h-4 mr-1" /> 盲盒描述</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all resize-none"
                    placeholder="描述一下这个盲盒可能开出什么..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center"><Coins className="w-4 h-4 mr-1" /> 兑换价格 (积分)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  />
                </div>

                <div className="flex items-center pt-2">
                  <input
                    id="is_active"
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700 font-medium">
                    立即上架 (学生端可见)
                  </label>
                </div>
                
                <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg mt-2">
                  <p className="font-bold mb-1">当前内置概率规则：</p>
                  <p>10% 掉落稀有道具，30% 掉落普通道具，60% 保底退还 10 积分。</p>
                </div>

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-sm font-medium flex items-center"
                  >
                    {editingId ? '保存修改' : '确认上架'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}