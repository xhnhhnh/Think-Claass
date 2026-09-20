import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { knowledgeApi } from '@/features/learning/api/knowledgeApi';
import { useKnowledgeEdges, useKnowledgeNodes, useSubjects } from '@/features/learning/hooks/useKnowledge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Toolbar } from '@/components/ui/toolbar';

/**
 * 知识点图谱.
 *
 * The three `confirm()` calls became `ConfirmDialog`s driven by "which row is pending"
 * state - one for a node, one for an edge, and the `管理学科` prompt became a one-field
 * `Dialog`, since `prompt()` cannot be styled and jsdom does not implement it. The
 * destructive callbacks keep their original bodies: same `knowledgeApi` calls, same
 * invalidation keys, same `已删除` toast.
 */
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

  const [showSubjectDialog, setShowSubjectDialog] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [nodeToDelete, setNodeToDelete] = useState<number | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreateSubject = async (event: FormEvent) => {
    event.preventDefault();
    const name = subjectName.trim();
    if (!name) return;
    try {
      await knowledgeApi.createSubject({ name });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-subjects'] });
      toast.success('已新增学科');
      setSubjectName('');
      setShowSubjectDialog(false);
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

  const handleDeleteNode = async () => {
    if (!selectedSubjectId || nodeToDelete === null) return;
    setIsDeleting(true);
    try {
      await knowledgeApi.deleteNode(nodeToDelete);
      await queryClient.invalidateQueries({ queryKey: ['knowledge-nodes', selectedSubjectId] });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-edges', selectedSubjectId] });
      toast.success('已删除');
    } catch (e) {
    } finally {
      setIsDeleting(false);
      setNodeToDelete(null);
    }
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

  const handleDeleteEdge = async () => {
    if (!selectedSubjectId || edgeToDelete === null) return;
    setIsDeleting(true);
    try {
      await knowledgeApi.deleteEdge(edgeToDelete);
      await queryClient.invalidateQueries({ queryKey: ['knowledge-edges', selectedSubjectId] });
      toast.success('已删除');
    } catch (e) {
    } finally {
      setIsDeleting(false);
      setEdgeToDelete(null);
    }
  };

  if (isSubjectsLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-ink-3">
        <Spinner label="正在加载学科" />
        正在加载学科...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="知识点图谱"
        description="支持层级与前置依赖（prerequisite）"
        icon={Link2}
        actions={
          <Button variant="outline" onClick={() => setShowSubjectDialog(true)}>
            新增学科
          </Button>
        }
      />

      <Card>
        <CardContent>
          <Toolbar
            filters={
              <>
                <Select
                  aria-label="选择学科"
                  wrapperClassName="w-full sm:w-56"
                  value={selectedSubjectId ?? ''}
                  onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : null)}
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {!subjects.length && <div className="text-sm text-ink-3">请先新增学科</div>}
              </>
            }
          />
        </CardContent>
      </Card>

      {!!selectedSubjectId && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SectionCard
            title="知识点节点"
            actions={
              <Button variant="outline" size="sm" onClick={handleCreateNode}>
                <Plus data-icon="inline-start" />
                添加
              </Button>
            }
          >
            <div className="mb-4 flex flex-col gap-3 md:flex-row">
              <Input
                aria-label="知识点名称"
                className="flex-1"
                value={newNodeState.name}
                onChange={(e) => setNewNodeState((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="知识点名称"
              />
              <Select
                aria-label="父节点"
                wrapperClassName="w-full md:w-48"
                value={newNodeState.parent_id ?? ''}
                onChange={(e) => setNewNodeState((prev) => ({ ...prev, parent_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">无父节点</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </div>

            {isNodesLoading ? (
              <div className="flex items-center justify-center gap-3 py-10 text-ink-3">
                <Spinner label="正在加载节点" />
                正在加载节点...
              </div>
            ) : nodes.length === 0 ? (
              <EmptyState title="暂无节点" />
            ) : (
              <div className="space-y-2">
                {nodes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-muted/50 p-4">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink-1">{n.name}</div>
                      <div className="text-xs text-ink-3">ID: {n.id} {n.parent_id ? `· 父节点: ${n.parent_id}` : ''}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除知识点${n.name}`}
                      title="删除"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setNodeToDelete(n.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="依赖关系"
            actions={
              <Button variant="outline" size="sm" onClick={handleCreateEdge}>
                <Plus data-icon="inline-start" />
                添加
              </Button>
            }
          >
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Select
                aria-label="起点节点"
                value={newEdgeState.from_node_id ?? ''}
                onChange={(e) => setNewEdgeState((prev) => ({ ...prev, from_node_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">起点</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="终点节点"
                value={newEdgeState.to_node_id ?? ''}
                onChange={(e) => setNewEdgeState((prev) => ({ ...prev, to_node_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">终点</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="依赖类型"
                value={newEdgeState.edge_type}
                onChange={(e) => setNewEdgeState((prev) => ({ ...prev, edge_type: e.target.value }))}
              >
                <option value="prerequisite">prerequisite</option>
                <option value="related">related</option>
              </Select>
            </div>

            {edges.length === 0 ? (
              <EmptyState title="暂无依赖关系" />
            ) : (
              <div className="space-y-2">
                {edges.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-muted/50 p-4">
                    <div className="text-sm text-ink-2">
                      {e.from_node_id} → {e.to_node_id} · {e.edge_type}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除关系${e.from_node_id}到${e.to_node_id}`}
                      title="删除"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setEdgeToDelete(e.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      <Dialog open={showSubjectDialog} onOpenChange={setShowSubjectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增学科</DialogTitle>
            <DialogDescription>请输入学科名称（如：数学）</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubject} className="flex flex-col gap-4">
            <FormField label="学科名称" required>
              <Input
                required
                value={subjectName}
                onChange={(event) => setSubjectName(event.target.value)}
                placeholder="例如：数学"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSubjectDialog(false)}>
                取消
              </Button>
              <Button type="submit">确认新增</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={nodeToDelete !== null}
        onOpenChange={(open) => !open && setNodeToDelete(null)}
        title="确认删除知识点"
        description="确定删除该知识点吗？"
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={isDeleting}
        onConfirm={handleDeleteNode}
      />

      <ConfirmDialog
        open={edgeToDelete !== null}
        onOpenChange={(open) => !open && setEdgeToDelete(null)}
        title="确认删除关系"
        description="确定删除该关系吗？"
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={isDeleting}
        onConfirm={handleDeleteEdge}
      />
    </div>
  );
}
