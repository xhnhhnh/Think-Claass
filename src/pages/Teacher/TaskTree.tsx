import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { GitBranch, Plus, XCircle, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiGet, apiDelete } from "@/lib/api";

interface TaskNode {
  id: number;
  title: string;
  description: string;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
}

export default function TeacherTaskTree() {
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState<number | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<TaskNode | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    points_reward: 0,
    parent_node_id: '' as string | null,
    x_pos: 50,
    y_pos: 50
  });

  useEffect(() => {
    apiGet('/api/classes')
      .then(data => {
        if (data.success && data.classes.length > 0) {
          setClassId(data.classes[0].id);
        }
      });
  }, []);

  const fetchNodes = async () => {
    if (!classId) return;
    try {
      const data = await apiGet(`/api/task-tree/teacher/${classId}`);
      if (data.success) {
        setNodes(data.nodes);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (classId) fetchNodes();
  }, [classId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;

    try {
      const url = editingNode ? `/api/task-tree/teacher/${editingNode.id}` : '/api/task-tree/teacher';
      const method = editingNode ? 'PUT' : 'POST';

      const data = await apiGet(url);
      if (data.success) {
        toast.success(editingNode ? '节点已更新' : '节点已创建');
        setIsModalOpen(false);
        fetchNodes();
      } else {
        toast.error(data.message || '操作失败');
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除此节点吗？')) return;
    try {
      const data = await apiDelete(`/api/task-tree/teacher/${id}`);
      if (data.success) {
        toast.success('节点已删除');
        fetchNodes();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const openCreateModal = () => {
    setEditingNode(null);
    setFormData({
      title: '',
      description: '',
      points_reward: 10,
      parent_node_id: null,
      x_pos: 50,
      y_pos: 50
    });
    setIsModalOpen(true);
  };

  const openEditModal = (node: TaskNode) => {
    setEditingNode(node);
    setFormData({
      title: node.title,
      description: node.description || '',
      points_reward: node.points_reward,
      parent_node_id: node.parent_node_id?.toString() || null,
      x_pos: node.x_pos,
      y_pos: node.y_pos
    });
    setIsModalOpen(true);
  };

  if (!classId) return <div className="p-8 text-center text-slate-500">请先创建或选择一个班级</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <GitBranch className="w-8 h-8 mr-3 text-indigo-500" />
            多维任务树管理
          </h1>
          <p className="text-slate-500 mt-1 text-sm">构建知识图谱与成长路线，学生需按顺序解锁节点。</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:-translate-y-0.5 transition-all flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          新建节点
        </button>
      </div>

      {/* Visual Tree Editor/Viewer */}
      <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative min-h-[600px] border border-slate-800 overflow-hidden">
        {/* Starry background */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black" />

        {/* Connections Layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {nodes.map(node => {
            if (!node.parent_node_id) return null;
            const parent = nodes.find(n => n.id === node.parent_node_id);
            if (!parent) return null;

            return (
              <line
                key={`line-${node.id}`}
                x1={`${parent.x_pos}%`}
                y1={`${parent.y_pos}%`}
                x2={`${node.x_pos}%`}
                y2={`${node.y_pos}%`}
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.5"
              />
            );
          })}
        </svg>

        {/* Nodes Layer */}
        {nodes.map(node => (
          <motion.div
            key={node.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{ left: `calc(${node.x_pos}% - 2rem)`, top: `calc(${node.y_pos}% - 2rem)` }}
            className="absolute z-10 flex flex-col items-center group"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-500 border-4 border-indigo-300 shadow-lg shadow-indigo-500/50 flex items-center justify-center text-white font-bold relative group-hover:scale-110 transition-transform">
              {node.id}
              
              {/* Quick Actions */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex gap-2 bg-slate-800 p-2 rounded-xl shadow-xl">
                <button onClick={() => openEditModal(node)} className="text-blue-400 hover:text-blue-300"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(node.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            
            {/* Label */}
            <div className="mt-2 text-center w-32">
              <span className="text-sm font-bold text-indigo-200 drop-shadow-md">
                {node.title}
              </span>
              <div className="text-xs text-indigo-400/70">{node.points_reward} 积分</div>
            </div>
          </motion.div>
        ))}

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium">
            暂无节点，点击右上角新建根节点开始构建任务树
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl max-w-md w-full border border-indigo-100"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">{editingNode ? '编辑节点' : '新建节点'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">节点标题</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                    placeholder="如: 第一章：魔法起源"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">节点描述</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                    placeholder="任务详情..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">奖励积分</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.points_reward}
                      onChange={e => setFormData({...formData, points_reward: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">前置节点</label>
                    <select
                      value={formData.parent_node_id || ''}
                      onChange={e => setFormData({...formData, parent_node_id: e.target.value || null})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">无 (根节点)</option>
                      {nodes.filter(n => n.id !== editingNode?.id).map(n => (
                        <option key={n.id} value={n.id}>{n.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">X 坐标 (0-100%)</label>
                    <input
                      type="number"
                      min="0" max="100"
                      value={formData.x_pos}
                      onChange={e => setFormData({...formData, x_pos: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Y 坐标 (0-100%)</label>
                    <input
                      type="number"
                      min="0" max="100"
                      value={formData.y_pos}
                      onChange={e => setFormData({...formData, y_pos: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-600 transition-colors mt-6"
                >
                  保存节点
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}