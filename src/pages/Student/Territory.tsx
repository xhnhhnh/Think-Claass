import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Map as MapIcon, Lock, Unlock, Pickaxe, Trees, Droplets, Coins, ArrowUpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiGet, apiPost } from "@/lib/api";

interface Territory {
  id: number;
  class_id: number;
  name: string;
  type: 'forest' | 'mine' | 'city' | 'magic_spring';
  level: number;
  cost_to_unlock: number;
  current_contribution: number;
  x_pos: number;
  y_pos: number;
  status: 'locked' | 'unlocking' | 'owned';
}

interface Resources {
  wood: number;
  stone: number;
  magic_dust: number;
  gold: number;
}

export default function StudentTerritory() {
  const user = useStore(state => state.user);
  const [territories, setTerrories] = useState<Territory[]>([]);
  const [resources, setResources] = useState<Resources | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Territory | null>(null);
  const [contributeAmount, setContributeAmount] = useState<string>('');
  const [isContributing, setIsContributing] = useState(false);

  // Dragging Map State
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapPosition, setMapPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fetchMap = async () => {
    if (!user?.class_id) return;
    try {
      const data = await apiGet(`/api/slg/map/${user.class_id}`);
      if (data.success) {
        setTerrories(data.territories);
        setResources(data.resources);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMap();
    const interval = setInterval(fetchMap, 10000); // Polling every 10s
    return () => clearInterval(interval);
  }, [user]);

  const handleContribute = async () => {
    if (!selectedNode || !user) return;
    const amount = parseInt(contributeAmount, 10);
    if (isNaN(amount) || amount <= 0) return toast.error('请输入有效积分');
    
    setIsContributing(true);
    try {
      const data = await apiPost(`/api/slg/student/${user.id}/contribute/${selectedNode.id}`, { amount });
      if (data.success) {
        toast.success('捐献成功！');
        fetchMap();
        setContributeAmount('');
        setSelectedNode(null);
      } else {
        toast.error(data.message || '捐献失败');
      }
    } catch (err) {
      toast.error('网络错误');
    } finally {
      setIsContributing(false);
    }
  };

  // Map Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - mapPosition.x, y: e.clientY - mapPosition.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setMapPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  if (loading) return <div className="p-12 text-center text-slate-500">加载地图数据中...</div>;

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'forest': return <Trees className="w-8 h-8" />;
      case 'mine': return <Pickaxe className="w-8 h-8" />;
      case 'city': return <Coins className="w-8 h-8" />;
      case 'magic_spring': return <Droplets className="w-8 h-8" />;
      default: return <MapIcon className="w-8 h-8" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'forest': return 'bg-emerald-500 border-emerald-300 shadow-emerald-500/50';
      case 'mine': return 'bg-slate-600 border-slate-400 shadow-slate-600/50';
      case 'city': return 'bg-amber-500 border-amber-300 shadow-amber-500/50';
      case 'magic_spring': return 'bg-cyan-500 border-cyan-300 shadow-cyan-500/50';
      default: return 'bg-indigo-500 border-indigo-300';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <MapIcon className="w-8 h-8 mr-3 text-emerald-500" />
            王国版图探索
          </h1>
          <p className="text-slate-500 mt-1">全班合作捐献积分解锁迷雾区域，建造设施产出全班增益资源。</p>
        </div>

        {/* Resources Bar */}
        {resources && (
          <div className="flex gap-4 bg-white/80 backdrop-blur-xl p-3 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2"><Trees className="w-5 h-5 text-emerald-500" /> <span className="font-bold text-slate-700">{resources.wood}</span></div>
            <div className="flex items-center gap-2"><Pickaxe className="w-5 h-5 text-slate-500" /> <span className="font-bold text-slate-700">{resources.stone}</span></div>
            <div className="flex items-center gap-2"><Droplets className="w-5 h-5 text-cyan-500" /> <span className="font-bold text-slate-700">{resources.magic_dust}</span></div>
            <div className="flex items-center gap-2"><Coins className="w-5 h-5 text-amber-500" /> <span className="font-bold text-slate-700">{resources.gold}</span></div>
          </div>
        )}
      </div>

      {/* Draggable Map Area */}
      <div 
        className="flex-1 bg-slate-900 rounded-3xl shadow-xl relative border border-slate-800 overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={(e) => handleMouseDown(e as any)}
      >
        {/* Isometric Grid Background */}
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
        
        <motion.div 
          ref={mapRef}
          animate={{ x: mapPosition.x, y: mapPosition.y }}
          transition={{ type: 'tween', ease: 'easeOut', duration: 0.1 }}
          className="absolute w-[3000px] h-[3000px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          {territories.map(node => {
            const isOwned = node.status === 'owned';
            const progress = (node.current_contribution / node.cost_to_unlock) * 100;
            
            return (
              <motion.button
                key={node.id}
                whileHover={{ scale: 1.05 }}
                onClick={(e) => { e.stopPropagation(); setSelectedNode(node); }}
                style={{ left: `calc(50% + ${node.x_pos * 100}px)`, top: `calc(50% + ${node.y_pos * 100}px)` }}
                className={`absolute w-24 h-24 rounded-3xl flex flex-col items-center justify-center border-4 shadow-xl transition-colors z-10 ${
                  isOwned 
                    ? `${getTypeColor(node.type)} text-white` 
                    : 'bg-slate-800 border-slate-600 text-slate-500 shadow-none'
                }`}
              >
                {!isOwned && <Lock className="w-6 h-6 mb-1 opacity-50 absolute top-2 right-2" />}
                {isOwned && <div className="absolute -top-3 -right-3 bg-indigo-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white">Lv.{node.level}</div>}
                
                {isOwned ? getTypeIcon(node.type) : <MapIcon className="w-8 h-8 opacity-40" />}
                
                <span className="text-xs font-bold mt-1 max-w-full px-1 truncate drop-shadow-md">
                  {node.name}
                </span>

                {/* Progress Bar for unlocking */}
                {!isOwned && node.status === 'unlocking' && (
                  <div className="absolute -bottom-4 w-20 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </motion.button>
            )
          })}
        </motion.div>

        {/* Center crosshair */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
          <div className="w-10 h-1 bg-white absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" />
          <div className="w-1 h-10 bg-white absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Node Detail Modal */}
      <AnimatePresence>
        {selectedNode && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl max-w-sm w-full border border-slate-100"
            >
              <div className="text-center mb-6">
                <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center shadow-xl border-4 mb-4 ${selectedNode.status === 'owned' ? getTypeColor(selectedNode.type) : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                  {getTypeIcon(selectedNode.type)}
                </div>
                <h3 className="text-2xl font-black text-slate-800">{selectedNode.name}</h3>
                <span className={`inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full ${
                  selectedNode.status === 'owned' ? 'bg-emerald-100 text-emerald-700' :
                  selectedNode.status === 'unlocking' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {selectedNode.status === 'owned' ? `已解锁 (Lv.${selectedNode.level})` :
                   selectedNode.status === 'unlocking' ? '解锁中...' : '未解锁领地'}
                </span>
              </div>

              <div className="space-y-6 mb-8">
                {selectedNode.status !== 'owned' ? (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>探索进度</span>
                      <span>{selectedNode.current_contribution} / {selectedNode.cost_to_unlock}</span>
                    </div>
                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(selectedNode.current_contribution / selectedNode.cost_to_unlock) * 100}%` }}
                      />
                    </div>
                    
                    <div className="mt-6">
                      <label className="block text-sm font-bold text-slate-700 mb-2">捐献积分加速探索</label>
                      <input
                        type="number"
                        placeholder="输入捐献额度..."
                        value={contributeAmount}
                        onChange={e => setContributeAmount(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 bg-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center">
                    <p className="text-emerald-800 font-medium text-sm">该领地正在为全班持续产出资源。</p>
                    <div className="mt-4 flex justify-center items-center gap-2 text-emerald-600 font-bold">
                      <ArrowUpCircle className="w-5 h-5 animate-bounce" />
                      当前产出速率: Lv.{selectedNode.level}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedNode(null)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  关闭
                </button>
                {selectedNode.status !== 'owned' && (
                  <button
                    onClick={handleContribute}
                    disabled={isContributing || !contributeAmount}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-colors disabled:opacity-50"
                  >
                    {isContributing ? '捐献中...' : '确认捐献'}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}