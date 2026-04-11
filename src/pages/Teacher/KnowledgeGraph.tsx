import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Plus, Trash2, Link2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { knowledgeApi } from '@/api/knowledge';
import { useKnowledgeEdges, useKnowledgeNodes, useSubjects } from '@/hooks/queries/useKnowledge';

export default function TeacherKnowledgeGraph() {
  const queryClient = useQueryClient();
  const { data: subjects = [], isLoading: isSubjectsLoading } = useSubjects();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const { data: nodes = [], isLoading: isNodesLoading } = useKnowledgeNodes(selectedSubjectId);
  const { data: edges = [] } = useKnowledgeEdges(selectedSubjectId);

  useEffect(() => {
    if (!selectedSubjectId && subjects.length) setSelectedSubjectId(subjects[0].id);
  }, [selectedSubjectId, subjects]);

  const nodeOptions = useMemo(() => nodes.map((n) => ({ id: n.id, label: n.name })), [nodes]);

  const [newNodeState, setNewNodeState] = useState({ name: '', parent_id: null as number | null });
  const [newEdgeState, setNewEdgeState] = useState({ from_node_id: null as number | null, to_node_id: null as number | null, edge_type: 'prerequisite' });

  const handleCreateSubject = async () => {
    const name = prompt('请输入学科名称（如：数学）');
    if (!name) return;
    try {
      await knowledgeApi.createSubject({ name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-subjects'] });
      toast.success('已新增学科');
    } catch (e) {}
  };

  const handleCreateNode = async () => {
    if (!selectedSubjectId) return;
    if (!newNodeState.name.trim()) {
      toast.error('请输入知识点名称');
      return;
    }
    try {
      await knowledgeApi.createNode({
        subject_id: selectedSubjectId,
        name: newNodeState.name.trim(),
        parent_id: newNodeState.parent_id,
      });
      setNewNodeState({ name: '', parent_id: null });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-nodes', selectedSubjectId] });
      toast.success('已新增知识点');
    } catch (e) {}
  };

  const handleDeleteNode = async (id: number) => {
    if (!selectedSubjectId) return;
    if (!confirm('确定删除该知识点吗？')) return;
    try {
      await knowledgeApi.deleteNode(id);
      await queryClient.invalidateQueries({ queryKey: ['knowledge-nodes', selectedSubjectId] });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-edges', selectedSubjectId] });
      toast.success('已删除');
    } catch (e) {}
  };

  const handleCreateEdge = async () => {
    if (!selectedSubjectId) return;
    if (!newEdgeState.from_node_id || !newEdgeState.to_node_id) {
      toast.error('请选择起点与终点');
      return;
    }
    try {
      await knowledgeApi.createEdge({
        subject_id: selectedSubjectId,
        from_node_id: newEdgeState.from_node_id,
        to_node_id: newEdgeState.to_node_id,
        edge_type: newEdgeState.edge_type,
      });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-edges', selectedSubjectId] });
      toast.success('已新增依赖关系');
    } catch (e) {}
  };

  const handleDeleteEdge = async (id: number) => {
    if (!selectedSubjectId) return;
    if (!confirm('确定删除该关系吗？')) return;
    try {
      await knowledgeApi.deleteEdge(id);
      await queryClient.invalidateQueries({ queryKey: ['knowledge-edges', selectedSubjectId] });
      toast.success('已删除');
    } catch (e) {}
  };

  if (isSubjectsLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在加载学科...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-slate-800">知识点图谱</div>
            <div className="text-sm text-slate-500">支持层级与前置依赖（prerequisite）</div>
          </div>
          <button
            onClick={handleCreateSubject}
            className="px-4 py-2 rounded-2xl text-sm font-medium bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50"
          >
            新增学科
          </button>
        </div>

        <div className="mt-4 flex flex-col md:flex-row gap-3">
          <select
            value={selectedSubjectId ?? ''}
            onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!subjects.length && <div className="text-sm text-slate-500">请先新增学科</div>}
        </div>
      </div>

      {!!selectedSubjectId && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-slate-800">知识点节点</div>
              <button
                onClick={handleCreateNode}
                className="px-4 py-2 rounded-2xl text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                添加
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <input
                value={newNodeState.name}
                onChange={(e) => setNewNodeState((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="知识点名称"
                className="flex-1 px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
              />
              <select
                value={newNodeState.parent_id ?? ''}
                onChange={(e) => setNewNodeState((prev) => ({ ...prev, parent_id: e.target.value ? Number(e.target.value) : null }))}
                className="px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
              >
                <option value="">无父节点</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>

            {isNodesLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
                正在加载节点...
              </div>
            ) : nodes.length === 0 ? (
              <div className="py-10 text-center text-slate-500">暂无节点</div>
            ) : (
              <div className="space-y-2">
                {nodes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between bg-white/70 border border-white/60 rounded-3xl p-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{n.name}</div>
                      <div className="text-xs text-slate-500">ID: {n.id} {n.parent_id ? `· 父节点: ${n.parent_id}` : ''}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteNode(n.id)}
                      className="p-2 rounded-2xl border border-slate-200 bg-white/60 text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-slate-800 flex items-center">
                <Link2 className="w-4 h-4 mr-2 text-indigo-500" />
                依赖关系
              </div>
              <button
                onClick={handleCreateEdge}
                className="px-4 py-2 rounded-2xl text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                添加
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <select
                value={newEdgeState.from_node_id ?? ''}
                onChange={(e) => setNewEdgeState((prev) => ({ ...prev, from_node_id: e.target.value ? Number(e.target.value) : null }))}
                className="px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
              >
                <option value="">起点</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <select
                value={newEdgeState.to_node_id ?? ''}
                onChange={(e) => setNewEdgeState((prev) => ({ ...prev, to_node_id: e.target.value ? Number(e.target.value) : null }))}
                className="px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
              >
                <option value="">终点</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <select
                value={newEdgeState.edge_type}
                onChange={(e) => setNewEdgeState((prev) => ({ ...prev, edge_type: e.target.value }))}
                className="px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
              >
                <option value="prerequisite">prerequisite</option>
                <option value="related">related</option>
              </select>
            </div>

            {edges.length === 0 ? (
              <div className="py-10 text-center text-slate-500">暂无依赖关系</div>
            ) : (
              <div className="space-y-2">
                {edges.map((e) => (
                  <div key={e.id} className="flex items-center justify-between bg-white/70 border border-white/60 rounded-3xl p-4">
                    <div className="text-sm text-slate-700">
                      {e.from_node_id} → {e.to_node_id} · {e.edge_type}
                    </div>
                    <button
                      onClick={() => handleDeleteEdge(e.id)}
                      className="p-2 rounded-2xl border border-slate-200 bg-white/60 text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

