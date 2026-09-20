import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitBranch, Plus, Edit2, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

import {
  useCreateTaskNodeMutation,
  useDeleteTaskNodeMutation,
  useTeacherTaskNodes,
  useUpdateTaskNodeMutation,
} from '@/features/collaboration/hooks/useTaskTree';
import { useClasses } from '@/hooks/queries/useClasses';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
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
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface TaskNode {
  id: number;
  title: string;
  description: string;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
}

/**
 * 多维任务树管理.
 *
 * The canvas is the feature, so it keeps its dark starry stage, its glowing nodes and
 * the spring entrance on each one. Two things had to leave it: the `stroke="#6366f1"`
 * literal (the connection lines are `currentColor` on `text-primary` now) and the
 * `style={{ left, top }}` that positioned a node - the same coordinates ride on the
 * `motion.div`'s `animate` instead, which is where the rest of its animation already
 * lived. Deleting a node asks through `ConfirmDialog` rather than `window.confirm`.
 */
export default function TeacherTaskTree() {
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const classId = useMemo(() => classes[0]?.id ?? null, [classes]);
  const { data: nodes = [] } = useTeacherTaskNodes(classId);
  const createMutation = useCreateTaskNodeMutation();
  const updateMutation = useUpdateTaskNodeMutation();
  const deleteMutation = useDeleteTaskNodeMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<TaskNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskNode | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    points_reward: 0,
    parent_node_id: '' as string | null,
    x_pos: 50,
    y_pos: 50
  });

  const reloadNodes = async () => {
    if (!classId) return;
    await queryClient.invalidateQueries({ queryKey: ['teacher-task-nodes', classId] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;

    try {
      const payload = {
        class_id: classId,
        title: formData.title,
        description: formData.description,
        points_reward: formData.points_reward,
        parent_node_id: formData.parent_node_id ? Number(formData.parent_node_id) : null,
        x_pos: formData.x_pos,
        y_pos: formData.y_pos,
      };
      const data = editingNode
        ? await updateMutation.mutateAsync({
            nodeId: editingNode.id,
            data: {
              title: payload.title,
              description: payload.description,
              points_reward: payload.points_reward,
              x_pos: payload.x_pos,
              y_pos: payload.y_pos,
            },
          })
        : await createMutation.mutateAsync(payload);
      if (data.success) {
        toast.success(editingNode ? '节点已更新' : '节点已创建');
        setIsModalOpen(false);
        await reloadNodes();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const data = await deleteMutation.mutateAsync(id);
      if (data.success) {
        toast.success('节点已删除');
        await reloadNodes();
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

  if (!classId) {
    return (
      <EmptyState
        icon={GitBranch}
        title="请先创建或选择一个班级"
        className="bg-paper"
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <PageHeader
        title="多维任务树管理"
        description="构建知识图谱与成长路线，学生需按顺序解锁节点。"
        icon={GitBranch}
        actions={
          <Button onClick={openCreateModal}>
            <Plus data-icon="inline-start" />
            新建节点
          </Button>
        }
      />

      {/* Visual Tree Editor/Viewer */}
      <div className="relative min-h-[600px] overflow-hidden rounded-panel border border-accent-foreground bg-secondary-foreground p-6 shadow-raised">
        {/* Starry background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/30 via-secondary-foreground to-foreground opacity-60" />

        {/* Connections Layer */}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-primary">
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
                stroke="currentColor"
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
            initial={{ scale: 0, left: `calc(${node.x_pos}% - 2rem)`, top: `calc(${node.y_pos}% - 2rem)` }}
            animate={{ scale: 1, left: `calc(${node.x_pos}% - 2rem)`, top: `calc(${node.y_pos}% - 2rem)` }}
            transition={{ type: 'spring', bounce: 0.35 }}
            className="group absolute z-10 flex flex-col items-center"
          >
            <div className="relative flex size-16 items-center justify-center rounded-full border-4 border-primary/40 bg-primary font-bold text-primary-foreground shadow-glow-primary transition-transform group-hover:scale-110">
              {node.id}

              {/* Quick Actions */}
              <div className="absolute -top-10 left-1/2 hidden -translate-x-1/2 gap-2 rounded-card bg-secondary-foreground/95 p-2 shadow-raised group-hover:flex">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`编辑 ${node.title}`}
                  title="编辑节点"
                  className="text-info hover:bg-info/10 hover:text-info"
                  onClick={() => openEditModal(node)}
                >
                  <Edit2 />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`删除 ${node.title}`}
                  title="删除节点"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(node)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            {/* Label */}
            <div className="mt-2 w-32 text-center">
              <span className="text-sm font-bold text-primary-foreground/90 drop-shadow-md">
                {node.title}
              </span>
              <div className="text-xs text-primary-foreground/60">{node.points_reward} 积分</div>
            </div>
          </motion.div>
        ))}

        {nodes.length === 0 && (
          <EmptyState
            icon={GitBranch}
            title="暂无节点，点击右上角新建根节点开始构建任务树"
            className="absolute inset-0 border-primary-foreground/25 bg-transparent [&_div]:text-primary-foreground"
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingNode ? '编辑节点' : '新建节点'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="节点标题" required>
              <Input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
                placeholder="如: 第一章：魔法起源"
              />
            </FormField>

            <FormField label="节点描述">
              <Textarea
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="任务详情..."
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="奖励积分">
                <Input
                  type="number"
                  min="0"
                  value={formData.points_reward}
                  onChange={e => setFormData({...formData, points_reward: Number(e.target.value)})}
                />
              </FormField>
              <FormField label="前置节点">
                <Select
                  value={formData.parent_node_id || ''}
                  onChange={e => setFormData({...formData, parent_node_id: e.target.value || null})}
                >
                  <option value="">无 (根节点)</option>
                  {nodes.filter(n => n.id !== editingNode?.id).map(n => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="X 坐标 (0-100%)">
                <Input
                  type="number"
                  min="0" max="100"
                  value={formData.x_pos}
                  onChange={e => setFormData({...formData, x_pos: Number(e.target.value)})}
                />
              </FormField>
              <FormField label="Y 坐标 (0-100%)">
                <Input
                  type="number"
                  min="0" max="100"
                  value={formData.y_pos}
                  onChange={e => setFormData({...formData, y_pos: Number(e.target.value)})}
                />
              </FormField>
            </div>

            <DialogFooter>
              <Button type="submit" className="w-full">
                保存节点
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确定要删除此节点吗？"
        description={deleteTarget ? `节点“${deleteTarget.title}”删除后无法恢复。` : undefined}
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
