import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { GitBranch, Plus, Lock, CheckCircle2, Unlock } from 'lucide-react';
import { motion } from 'framer-motion';

import { apiGet, apiPost } from "@/lib/api";

interface TaskNode {
  id: number;
  title: string;
  description: string;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
  status: 'locked' | 'unlocked' | 'completed';
}

export default function StudentTaskTree() {
  const user = useStore(state => state.user);
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<TaskNode | null>(null);
  const [completing, setCompleting] = useState(false);

  const fetchNodes = async () => {
    if (!user) return;
    try {
      const data = await apiGet(`/api/task-tree/student/${user.id}`);
      if (data.success) {
        setNodes(data.nodes);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, [user]);

  const handleComplete = async () => {
    if (!selectedNode || !user) return;
    setCompleting(true);
    try {
      const data = await apiPost(`/api/task-tree/student/${user.id}/complete/${selectedNode.id}`, undefined);
      if (data.success) {
        toast.success(`成功完成节点：${selectedNode.title}，获得 ${selectedNode.points_reward} 积分！`);
        fetchNodes();
        setSelectedNode(null);
      } else {
        toast.error(data.message || '完成失败');
      }
    } catch (err) {
      toast.error('网络错误');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500">加载中...</div>;

  // Calculate SVG lines
  const lines = nodes.map(node => {
    if (!node.parent_node_id) return null;
    const parent = nodes.find(n => n.id === node.parent_node_id);
    if (!parent) return null;

    const isActive = node.status !== 'locked';

    return (
      <line
        key={`line-${node.id}`}
        x1={`${parent.x_pos}%`}
        y1={`${parent.y_pos}%`}
        x2={`${node.x_pos}%`}
        y2={`${node.y_pos}%`}
        stroke={isActive ? '#818cf8' : '#334155'}
        strokeWidth="3"
        strokeDasharray={isActive ? "none" : "5,5"}
        className={isActive ? "animate-pulse" : ""}
      />
    );
  }).filter(Boolean);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <GitBranch className="w-8 h-8 mr-3 text-indigo-500" />
            魔法技能树
          </h1>
          <p className="text-slate-500 mt-1">解锁前置节点，攀登魔法巅峰！</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative min-h-[600px] border border-slate-800 overflow-hidden">
        {/* Starry background */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black" />

        {/* Connections Layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {lines}
        </svg>

        {/* Nodes Layer */}
        {nodes.map(node => (
          <motion.button
            key={node.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.1 }}
            onClick={() => setSelectedNode(node)}
            style={{ left: `calc(${node.x_pos}% - 2rem)`, top: `calc(${node.y_pos}% - 2rem)` }}
            className={`absolute w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-lg transition-colors z-10 ${
              node.status === 'completed' 
                ? 'bg-emerald-500 border-emerald-300 text-white shadow-emerald-500/50' 
                : node.status === 'unlocked'
                  ? 'bg-indigo-500 border-indigo-300 text-white shadow-indigo-500/50 animate-pulse'
                  : 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed'
            }`}
          >
            {node.status === 'completed' && <CheckCircle2 className="w-8 h-8" />}
            {node.status === 'unlocked' && <Unlock className="w-8 h-8" />}
            {node.status === 'locked' && <Lock className="w-6 h-6" />}
            
            {/* Label */}
            <div className="absolute top-full mt-2 w-32 text-center -translate-x-1/2 left-1/2">
              <span className={`text-sm font-bold drop-shadow-md ${node.status !== 'locked' ? 'text-indigo-200' : 'text-slate-500'}`}>
                {node.title}
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Node Detail Modal */}
      {selectedNode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl max-w-md w-full border border-indigo-100"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center">
                <div className={`p-3 rounded-2xl mr-4 ${
                  selectedNode.status === 'completed' ? 'bg-emerald-100 text-emerald-600' :
                  selectedNode.status === 'unlocked' ? 'bg-indigo-100 text-indigo-600' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {selectedNode.status === 'completed' && <CheckCircle2 className="w-8 h-8" />}
                  {selectedNode.status === 'unlocked' && <Unlock className="w-8 h-8" />}
                  {selectedNode.status === 'locked' && <Lock className="w-8 h-8" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{selectedNode.title}</h3>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    selectedNode.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    selectedNode.status === 'unlocked' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {selectedNode.status === 'completed' ? '已掌握' :
                     selectedNode.status === 'unlocked' ? '可学习' : '未解锁'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <p className="text-slate-600 text-sm leading-relaxed">
                {selectedNode.description || '暂无描述'}
              </p>
              {selectedNode.points_reward > 0 && (
                <div className="flex items-center text-amber-600 font-bold bg-amber-50 px-4 py-3 rounded-xl border border-amber-100">
                  <span className="mr-2">🎁 完成奖励:</span>
                  +{selectedNode.points_reward} 积分
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
              {selectedNode.status === 'unlocked' && (
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-indigo-500 hover:bg-indigo-600 shadow-lg shadow-indigo-200 transition-colors disabled:opacity-50"
                >
                  {completing ? '提交中...' : '完成此节点'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}