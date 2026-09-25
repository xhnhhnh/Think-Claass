import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { GitBranch, Lock, CheckCircle2, Unlock } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

import { useCompleteTaskNodeMutation, useStudentTaskNodes } from '@/features/collaboration/hooks/useTaskTree';
import type { StudentTaskNode } from '@/features/collaboration/api/taskTreeApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * 魔法技能树.
 *
 * The starfield canvas is the feature, so it keeps its dark stage, its glowing nodes and
 * the spring entrance on each one - it now matches the teacher's editor, which P6 moved
 * onto `bg-fg-1` + `from-role/30`. Two things had to leave the canvas: the two hard-coded
 * stroke colours, which are `currentColor` on a `text-*` class now (so the linked and the
 * locked states survive as tokens), and the inline position that placed a node - the same
 * coordinates ride on the `motion` element's `animate`, which is where its scale entrance
 * already lived.
 *
 * "可学习" is the `info` token rather than `role`, deliberately: completed and unlockable
 * would otherwise both be the brand green on a dark canvas, and telling them apart is the
 * whole point of the node. Sky is the product's second supporting accent.
 */
export default function StudentTaskTree() {
  const user = useStore(state => state.user);
  const studentId = user?.studentId ?? user?.id ?? null;
  const { data: nodes = [], isLoading: loading } = useStudentTaskNodes(studentId);
  const completeMutation = useCompleteTaskNodeMutation(studentId);
  const [selectedNode, setSelectedNode] = useState<StudentTaskNode | null>(null);
  const completing = completeMutation.isPending;
  const shouldReduceMotion = useReducedMotion();

  const handleComplete = async () => {
    if (!selectedNode || !user) return;
    try {
      await completeMutation.mutateAsync(selectedNode.id);
      toast.success(`成功完成节点：${selectedNode.title}，获得 ${selectedNode.points_reward} 积分！`);
      setSelectedNode(null);
    } catch (err) {
      toast.error('网络错误');
    }
  };

  if (loading) {
    return (
      <PageScaffold variant="immersive" className="flex min-h-dvh items-center justify-center p-12">
        <div className="flex items-center justify-center gap-2 text-fg-3">
          <Spinner size="lg" label="正在加载技能树" />
          加载中...
        </div>
      </PageScaffold>
    );
  }

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
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={isActive ? "none" : "5,5"}
        className={isActive ? "animate-pulse text-role" : "text-fg-inverse/20"}
      />
    );
  }).filter(Boolean);

  return (
    <PageScaffold variant="immersive" className="min-h-dvh px-4 pb-12 pt-16 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* The immersive shell renders no context bar, so the page keeps its own heading. */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-role-soft text-role-ink">
            <GitBranch aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-tight text-fg-1">魔法技能树</h2>
            <p className="mt-1 text-sm text-fg-3">解锁前置节点，攀登魔法巅峰！</p>
          </div>
        </div>

        <div className="relative min-h-[600px] overflow-hidden rounded-panel border border-role-ink bg-fg-1 p-6 shadow-raised">
          {/* Starry background */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-role/30 via-fg-1 to-fg-1 opacity-60" />

          {/* Connections Layer */}
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
            {lines}
          </svg>

          {/* Nodes Layer */}
          {nodes.map(node => (
            <motion.div
              key={node.id}
              initial={{
                opacity: 0,
                left: `calc(${node.x_pos}% - 2rem)`,
                top: `calc(${node.y_pos}% - 2rem)`,
                ...(shouldReduceMotion ? {} : { scale: 0 }),
              }}
              animate={{
                opacity: 1,
                left: `calc(${node.x_pos}% - 2rem)`,
                top: `calc(${node.y_pos}% - 2rem)`,
                ...(shouldReduceMotion ? {} : { scale: 1 }),
              }}
              transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0.35 }}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.1 }}
              className="absolute z-10"
            >
              <Button
                type="button"
                variant="outline"
                aria-label={node.title}
                onClick={() => setSelectedNode(node)}
                className={cn(
                  'size-16 rounded-full border-4 p-0',
                  node.status === 'completed'
                    ? 'border-success/40 bg-success text-fg-inverse shadow-glow-role'
                    : node.status === 'unlocked'
                      ? 'animate-pulse border-info/40 bg-info text-fg-inverse shadow-glow-role'
                      : 'border-fg-inverse/20 bg-fg-inverse/10 text-fg-inverse/40',
                )}
              >
                {node.status === 'completed' && <CheckCircle2 className="size-8" />}
                {node.status === 'unlocked' && <Unlock className="size-8" />}
                {node.status === 'locked' && <Lock className="size-6" />}
              </Button>

              {/* Label */}
              <div className="absolute left-1/2 top-full mt-2 w-32 -translate-x-1/2 text-center">
                <span className={cn('text-sm font-bold drop-shadow-md', node.status !== 'locked' ? 'text-fg-inverse/90' : 'text-fg-inverse/40')}>
                  {node.title}
                </span>
              </div>
            </motion.div>
          ))}

          {nodes.length === 0 && (
            <EmptyState
              icon={GitBranch}
              title="暂无技能节点"
              description="老师还没有布置技能树"
              className="absolute inset-0 border-fg-inverse/25 bg-transparent [&_div]:text-fg-inverse"
            />
          )}
        </div>

        {/* Node Detail Modal */}
        <Dialog open={Boolean(selectedNode)} onOpenChange={(open) => !open && setSelectedNode(null)}>
          <DialogContent className="sm:max-w-md">
            {selectedNode ? (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-4">
                    <span className={cn(
                      'flex size-12 shrink-0 items-center justify-center rounded-card',
                      selectedNode.status === 'completed' ? 'bg-success/10 text-success' :
                      selectedNode.status === 'unlocked' ? 'bg-info/10 text-info' :
                      'bg-surface-3 text-fg-3',
                    )}>
                      {selectedNode.status === 'completed' && <CheckCircle2 className="size-6" />}
                      {selectedNode.status === 'unlocked' && <Unlock className="size-6" />}
                      {selectedNode.status === 'locked' && <Lock className="size-6" />}
                    </span>
                    <div className="space-y-2">
                      <DialogTitle className="text-xl font-bold text-fg-1">{selectedNode.title}</DialogTitle>
                      <Badge variant={
                        selectedNode.status === 'completed' ? 'success' :
                        selectedNode.status === 'unlocked' ? 'info' : 'secondary'
                      }>
                        {selectedNode.status === 'completed' ? '已掌握' :
                         selectedNode.status === 'unlocked' ? '可学习' : '未解锁'}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-fg-2">
                    {selectedNode.description || '暂无描述'}
                  </p>
                  {selectedNode.points_reward > 0 && (
                    <div className="flex items-center rounded-card border border-warning/20 bg-warning/10 px-4 py-3 font-bold text-warning">
                      <span className="mr-2">🎁 完成奖励:</span>
                      +{selectedNode.points_reward} 积分
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedNode(null)}
                  >
                    关闭
                  </Button>
                  {selectedNode.status === 'unlocked' && (
                    <Button
                      onClick={handleComplete}
                      disabled={completing}
                    >
                      {completing ? '提交中...' : '完成此节点'}
                    </Button>
                  )}
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </PageScaffold>
  );
}
