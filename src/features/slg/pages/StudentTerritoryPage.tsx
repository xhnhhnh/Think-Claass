import { useState, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Map as MapIcon, Lock, Pickaxe, Trees, Droplets, Coins, ArrowUpCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

import { useContributeTerritoryMutation, useTerritoryMap } from '@/features/slg/hooks/useTerritory';
import type { ClassResources, Territory } from '@/features/slg/api/slgApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * 王国版图探索.
 *
 * The draggable isometric map is the feature, so it keeps its pan, its absolute
 * geometry and its per-terrain node colours - the node position rides on the `motion`
 * `animate` now instead of a page-level style, which is the same geometry written where
 * the rest of the node's animation already lives. The node is a kit `Button` now - the
 * framer-motion button element it used to be is exactly the raw control the kit exists
 * to replace - and both unlocking bars are the kit `Progress`, so no width is computed
 * in a page.
 *
 * The stage is the inverted surface pair the rest of the game surfaces use: an `fg-1`
 * canvas with `fg-inverse` wells and borders over it.
 *
 * The resource strip is page content rather than a `PageScaffold` action: the immersive
 * branch of the scaffold renders its children and nothing else (there is no context bar
 * on an immersive route to portal into), so an action passed to it would be dropped.
 */
export default function StudentTerritory() {
  const user = useStore(state => state.user);
  const classId = user?.class_id ?? null;
  const studentId = user?.studentId ?? user?.id ?? null;
  const { data, isLoading: loading } = useTerritoryMap(classId, 10000);
  const territories = data?.territories ?? [];
  const resources = data?.resources as ClassResources | null | undefined;
  const contributeMutation = useContributeTerritoryMutation(classId, studentId);
  const [selectedNode, setSelectedNode] = useState<Territory | null>(null);
  const [contributeAmount, setContributeAmount] = useState<string>('');
  const isContributing = contributeMutation.isPending;
  const shouldReduceMotion = useReducedMotion();

  // Dragging Map State
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapPosition, setMapPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleContribute = async () => {
    if (!selectedNode || !user) return;
    const amount = parseInt(contributeAmount, 10);
    if (isNaN(amount) || amount <= 0) return toast.error('请输入有效积分');
    
    try {
      await contributeMutation.mutateAsync({ territoryId: selectedNode.id, amount });
      toast.success('捐献成功！');
      setContributeAmount('');
      setSelectedNode(null);
    } catch (err) {
      toast.error('网络错误');
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

  if (loading) {
    return (
      <PageScaffold variant="immersive" className="flex min-h-dvh items-center justify-center p-12">
        <div className="flex items-center justify-center gap-2 text-fg-3">
          <Spinner size="lg" label="正在加载地图数据" />
          加载地图数据中...
        </div>
      </PageScaffold>
    );
  }

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'forest': return <Trees className="size-8" />;
      case 'mine': return <Pickaxe className="size-8" />;
      case 'city': return <Coins className="size-8" />;
      case 'magic_spring': return <Droplets className="size-8" />;
      default: return <MapIcon className="size-8" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'forest': return 'bg-success border-success/40 shadow-glow-role';
      // The mine is the neutral node; `fg-2`/`fg-3` are the token set's greys.
      case 'mine': return 'bg-fg-2 border-fg-3 shadow-glow-role';
      case 'city': return 'bg-warning border-warning/40 shadow-glow-role';
      case 'magic_spring': return 'bg-info border-info/40 shadow-glow-role';
      default: return 'bg-role border-role/40 shadow-glow-role';
    }
  };

  return (
    <PageScaffold variant="immersive" className="flex h-dvh flex-col gap-4 px-4 pb-4 pt-16 sm:px-8 sm:pb-8">
      {/* The immersive shell renders no context bar, so the page keeps its own heading and
          the class resource strip that used to ride on the page header's actions. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-role-soft text-role-ink">
            <MapIcon aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-tight text-fg-1">王国版图探索</h2>
            <p className="mt-1 text-sm text-fg-3">全班合作捐献积分解锁迷雾区域，建造设施产出全班增益资源。</p>
          </div>
        </div>

        {resources ? (
          <div className="flex flex-wrap gap-3 rounded-card border border-line-1 bg-surface-2/80 p-3 shadow-card backdrop-blur-xl">
            <Badge variant="outline" className="h-auto gap-2 px-3 py-1 text-sm">
              <Trees className="text-success" />
              <span className="font-bold text-fg-2">{resources.wood}</span>
            </Badge>
            <Badge variant="outline" className="h-auto gap-2 px-3 py-1 text-sm">
              <Pickaxe className="text-fg-3" />
              <span className="font-bold text-fg-2">{resources.stone}</span>
            </Badge>
            <Badge variant="outline" className="h-auto gap-2 px-3 py-1 text-sm">
              <Droplets className="text-info" />
              <span className="font-bold text-fg-2">{resources.magic_dust}</span>
            </Badge>
            <Badge variant="outline" className="h-auto gap-2 px-3 py-1 text-sm">
              <Coins className="text-warning" />
              <span className="font-bold text-fg-2">{resources.gold}</span>
            </Badge>
          </div>
        ) : null}
      </div>

      {/* Draggable Map Area */}
      <div 
        className="relative min-h-0 flex-1 cursor-grab select-none overflow-hidden rounded-panel border border-role-ink bg-fg-1 shadow-raised active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={(e) => handleMouseDown(e as any)}
      >
        {/* Isometric Grid Background */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
        
        <motion.div 
          ref={mapRef}
          animate={{ x: mapPosition.x, y: mapPosition.y }}
          transition={{ type: 'tween', ease: 'easeOut', duration: 0.1 }}
          className="absolute left-1/2 top-1/2 h-[3000px] w-[3000px] -translate-x-1/2 -translate-y-1/2"
        >
          {territories.map(node => {
            const isOwned = node.status === 'owned';
            const progress = (node.current_contribution / node.cost_to_unlock) * 100;
            
            return (
              <motion.div
                key={node.id}
                animate={{ left: `calc(50% + ${node.x_pos * 100}px)`, top: `calc(50% + ${node.y_pos * 100}px)` }}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
                className="absolute z-10"
              >
                <Button
                  type="button"
                  variant="outline"
                  aria-label={node.name}
                  onClick={(e) => { e.stopPropagation(); setSelectedNode(node); }}
                  className={cn(
                    'relative size-24 flex-col gap-0 rounded-panel border-4 p-0 text-fg-inverse',
                    isOwned
                      ? getTypeColor(node.type)
                      : 'border-fg-inverse/20 bg-fg-inverse/10 text-fg-inverse/40',
                  )}
                >
                  {!isOwned && <Lock className="absolute right-2 top-2 mb-1 size-6 opacity-50" />}
                  {isOwned && <div className="absolute -right-3 -top-3 flex size-6 items-center justify-center rounded-full border-2 border-surface-2 bg-role text-xs font-bold text-role-contrast shadow-card">Lv.{node.level}</div>}
                  
                  {isOwned ? getTypeIcon(node.type) : <MapIcon className="size-8 opacity-40" />}
                  
                  <span className="mt-1 max-w-full truncate px-1 text-xs font-bold drop-shadow-md">
                    {node.name}
                  </span>
                </Button>

                {/* Progress Bar for unlocking */}
                {!isOwned && node.status === 'unlocking' && (
                  <Progress
                    value={progress}
                    label={`${node.name} 解锁进度`}
                    tone="success"
                    className="absolute -bottom-4 left-1/2 w-20 -translate-x-1/2"
                  />
                )}
              </motion.div>
            )
          })}
        </motion.div>

        {/* Center crosshair */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20">
          <div className="absolute left-1/2 top-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2 bg-fg-inverse" />
          <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 bg-fg-inverse" />
        </div>
      </div>

      {/* Node Detail Modal */}
      <Dialog open={Boolean(selectedNode)} onOpenChange={(open) => !open && setSelectedNode(null)}>
        <DialogContent className="sm:max-w-sm">
          {selectedNode ? (
            <>
              <DialogHeader>
                <div className="text-center">
                  <div className={cn(
                    'mx-auto mb-4 flex size-20 items-center justify-center rounded-panel border-4 text-fg-inverse shadow-raised',
                    selectedNode.status === 'owned' ? getTypeColor(selectedNode.type) : 'border-line-1 bg-surface-3/50 text-fg-3',
                  )}>
                    {getTypeIcon(selectedNode.type)}
                  </div>
                  <DialogTitle className="text-2xl font-black text-fg-1">{selectedNode.name}</DialogTitle>
                  <Badge
                    variant={
                      selectedNode.status === 'owned' ? 'success' :
                      selectedNode.status === 'unlocking' ? 'warning' : 'secondary'
                    }
                    className="mt-2"
                  >
                    {selectedNode.status === 'owned' ? `已解锁 (Lv.${selectedNode.level})` :
                     selectedNode.status === 'unlocking' ? '解锁中...' : '未解锁领地'}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                {selectedNode.status !== 'owned' ? (
                  <div className="rounded-card border border-line-1 bg-surface-3/50 p-4">
                    <div className="mb-2 flex justify-between text-sm font-bold text-fg-2">
                      <span>探索进度</span>
                      <span>{selectedNode.current_contribution} / {selectedNode.cost_to_unlock}</span>
                    </div>
                    <Progress
                      value={(selectedNode.current_contribution / selectedNode.cost_to_unlock) * 100}
                      label="探索进度"
                      tone="success"
                    />
                    
                    <div className="mt-6">
                      <FormField label="捐献积分加速探索">
                        <Input
                          type="number"
                          placeholder="输入捐献额度..."
                          value={contributeAmount}
                          onChange={e => setContributeAmount(e.target.value)}
                        />
                      </FormField>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-card border border-success/20 bg-success/10 p-4 text-center">
                    <p className="text-sm font-medium text-success">该领地正在为全班持续产出资源。</p>
                    <div className="mt-4 flex items-center justify-center gap-2 font-bold text-success">
                      <ArrowUpCircle className="size-5 animate-bounce" />
                      当前产出速率: Lv.{selectedNode.level}
                    </div>
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
                {selectedNode.status !== 'owned' && (
                  <Button
                    onClick={handleContribute}
                    disabled={isContributing || !contributeAmount}
                  >
                    {isContributing ? '捐献中...' : '确认捐献'}
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
