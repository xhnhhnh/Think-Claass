import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Gavel, Plus, Edit2, Trash2, Clock, Coins, Tag, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiGet, apiDelete } from "@/lib/api";

interface Auction {
  id: number;
  item_name: string;
  description: string;
  starting_price: number;
  current_price: number;
  highest_bidder_id: number | null;
  status: 'active' | 'ended';
  end_time: string;
}

export default function TeacherAuction() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    item_name: '',
    description: '',
    starting_price: 100,
    end_time: '',
    status: 'active'
  });

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/shop/auctions');
      if (data.success) {
        setAuctions(data.auctions);
      }
    } catch (error) {
      toast.error('获取拍卖列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuctions();
  }, []);

  const handleOpenModal = (auction?: Auction) => {
    if (auction) {
      setEditingId(auction.id);
      setFormData({
        item_name: auction.item_name,
        description: auction.description || '',
        starting_price: auction.starting_price,
        end_time: auction.end_time ? new Date(auction.end_time).toISOString().slice(0, 16) : '',
        status: auction.status
      });
    } else {
      setEditingId(null);
      // Default end time to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFormData({ 
        item_name: '', 
        description: '', 
        starting_price: 100, 
        end_time: tomorrow.toISOString().slice(0, 16),
        status: 'active'
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.item_name.trim() || formData.starting_price <= 0 || !formData.end_time) {
      toast.error('请填写完整的拍卖信息');
      return;
    }

    try {
      const url = editingId ? `/api/shop/auctions/${editingId}` : '/api/shop/auctions';
      const method = editingId ? 'PUT' : 'POST';

      const data = await apiGet(url);

      if (data.success) {
        toast.success(editingId ? '修改成功' : '发布成功');
        setIsModalOpen(false);
        fetchAuctions();
      } else {
        toast.error(data.message || '操作失败');
      }
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个拍卖项目吗？')) return;
    
    try {
      const data = await apiDelete(`/api/shop/auctions/${id}`);
      if (data.success) {
        toast.success('删除成功');
        fetchAuctions();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch (error) {
      toast.error('网络错误');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center">
            <Gavel className="w-8 h-8 mr-3 text-amber-500" />
            拍卖行管理
          </h2>
          <p className="text-slate-500 mt-2">发布稀有物品（如免写作业卡、校长合影），让学生体验竞拍的乐趣</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2" />
          发布拍品
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400">加载中...</div>
        ) : auctions.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">拍卖行空空如也，快去发布一件拍品吧</p>
          </div>
        ) : (
          auctions.map(auction => {
            const isEnded = auction.status === 'ended' || (auction.end_time && new Date(auction.end_time) < new Date());
            return (
              <motion.div 
                key={auction.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-2xl overflow-hidden border transition-all hover:shadow-lg ${
                  isEnded ? 'border-slate-200 opacity-75 grayscale-[0.3]' : 'border-amber-200 shadow-sm'
                }`}
              >
                <div className={`h-32 flex items-center justify-center relative ${
                  isEnded ? 'bg-slate-200' : 'bg-gradient-to-br from-amber-400 to-orange-500'
                }`}>
                  <Gavel className={`w-16 h-16 ${isEnded ? 'text-slate-400' : 'text-white opacity-90'}`} />
                  <div className="absolute top-3 right-3">
                    <span className={`px-2 py-1 text-xs rounded-md font-bold ${
                      isEnded ? 'bg-slate-500 text-white' : 'bg-green-500 text-white shadow-sm animate-pulse'
                    }`}>
                      {isEnded ? '已结束' : '竞拍中'}
                    </span>
                  </div>
                </div>
                
                <div className="p-5">
                  <h3 className="text-lg font-bold text-slate-800 mb-1 truncate">{auction.item_name}</h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2 h-10">{auction.description}</p>
                  
                  <div className="space-y-2 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">起拍价:</span>
                      <span className="font-bold text-slate-700">{auction.starting_price} 积分</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 flex items-center"><Clock className="w-4 h-4 mr-1"/> 截标:</span>
                      <span className="font-bold text-slate-700">
                        {new Date(auction.end_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                      <span className="text-amber-600 font-bold flex items-center"><Coins className="w-4 h-4 mr-1"/> 当前最高:</span>
                      <span className="font-black text-amber-600 text-lg">{auction.current_price} 积分</span>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 pt-2">
                    <button onClick={() => handleOpenModal(auction)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(auction.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50">
                <h3 className="text-xl font-bold text-amber-800 flex items-center">
                  <Gavel className="w-5 h-5 mr-2" />
                  {editingId ? '编辑拍品' : '发布拍品'}
                </h3>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Tag className="w-4 h-4 mr-1" /> 拍品名称</label>
                  <input
                    type="text"
                    required
                    value={formData.item_name}
                    onChange={e => setFormData({...formData, item_name: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                    placeholder="例如：校长合影体验券"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><AlertCircle className="w-4 h-4 mr-1" /> 拍品描述</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none"
                    placeholder="详细描述这个拍品的价值..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Coins className="w-4 h-4 mr-1" /> 起拍价</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.starting_price}
                      onChange={e => setFormData({...formData, starting_price: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Clock className="w-4 h-4 mr-1" /> 截标时间</label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.end_time}
                      onChange={e => setFormData({...formData, end_time: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {editingId && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value as 'active' | 'ended'})}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all bg-white"
                    >
                      <option value="active">竞拍中</option>
                      <option value="ended">强制结束</option>
                    </select>
                  </div>
                )}

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors shadow-sm font-medium flex items-center"
                  >
                    {editingId ? '保存修改' : '确认发布'}
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