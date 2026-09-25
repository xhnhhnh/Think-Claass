import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Swords, ShieldAlert, Crosshair, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

import { battlesApi, type Battle } from '@/features/battles/api/battlesApi';
import { useBattleActionMutation, useBattleStats, useInitiateBattleMutation, useTeacherBattles } from '@/features/battles/hooks/useBattles';
import { useClasses } from '@/hooks/queries/useClasses';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Toolbar } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';

/**
 * 校区跨班大乱斗.
 *
 * The live battle panel is a stage, not a table: the red/blue split, the giant VS and
 * the tug-of-war bar that a spring animates from the two scores all stay. The two team
 * colours are the `destructive` and `info` tokens now, and the bar is the one place
 * where a `motion` width is the point - it is two scores sharing one track, which a
 * single `Progress` cannot express. Challenging a class asks through `ConfirmDialog`
 * instead of `window.confirm`.
 */
export default function TeacherBrawl() {
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const classId = useMemo(() => classes[0]?.id ?? null, [classes]);
  const { data: battles = [] } = useTeacherBattles(classId);
  const activeBattle = battles.find(b => b.status === 'active') ?? null;
  const { data: activeStats } = useBattleStats(activeBattle?.id ?? null, !!activeBattle);
  const initiateMutation = useInitiateBattleMutation(classId);
  const actionMutation = useBattleActionMutation(classId);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{id: number, name: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<{ id: number, name: string } | null>(null);
  const reloadBattles = async () => {
    if (!classId) return;
    await queryClient.invalidateQueries({ queryKey: ['teacher-battles', classId] });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !classId) return;

    setIsSearching(true);
    try {
      const data = await battlesApi.searchClasses(
        searchQuery,
        classId,
      );

      if (data.success) {
        const classes = data.data?.classes ?? data.classes ?? [];
        setSearchResults(classes);
        if (classes.length === 0) toast.info('未找到其他班级');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const initiateBattle = async (targetId: number, targetName: string) => {
    if (!classId) return;

    try {
      const data = await initiateMutation.mutateAsync({ initiator_class_id: classId, target_class_id: targetId });

      if (data.success) {
        toast.success('挑战已发出！等待对方教师接受。');
        setSearchQuery('');
        setSearchResults([]);
        await reloadBattles();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const handleAction = async (battleId: number, action: 'accept' | 'reject' | 'end') => {
    try {
      let winnerClassId: number | null | undefined;
      if (action === 'end' && activeStats) {
        // Determine winner
        const winnerId = activeStats.initiatorScore > activeStats.targetScore 
          ? activeStats.battle.initiator_class_id 
          : (activeStats.targetScore > activeStats.initiatorScore ? activeStats.battle.target_class_id : null);
        winnerClassId = winnerId;
      }

      const data = await actionMutation.mutateAsync({
        battleId,
        action,
        winnerClassId,
      });
      if (data.success) {
        toast.success(`操作成功: ${action}`);
        await reloadBattles();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  // The stage has no page-level button; its one action is re-reading the battle list.
  useRegisterPageCommands([
    {
      id: 'teacher-brawl:refresh',
      label: '刷新战况',
      icon: RefreshCw,
      keywords: ['大乱斗', '战况', '刷新'],
      run: () => void reloadBattles(),
    },
  ]);

  if (!classId) {
    return (
      <PageScaffold variant="dashboard">
        <EmptyState
          icon={Swords}
          title="请先创建或选择一个班级"
          className="bg-surface-2"
        />
      </PageScaffold>
    );
  }

  const pendingReceived = battles.filter(b => b.status === 'pending' && b.target_class_id === classId);
  const pendingSent = battles.filter(b => b.status === 'pending' && b.initiator_class_id === classId);
  const historyBattles = battles.filter(b => b.status === 'ended' || b.status === 'rejected').slice(0, 10);

  return (
    <PageScaffold
      variant="dashboard"
      title="校区跨班大乱斗"
      description="挑战其他班级，争夺校区最强魔法分院荣誉！"
      contentClassName="mx-auto max-w-5xl"
    >

      {/* Active Battle Dashboard */}
      {activeBattle && activeStats && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-panel border border-role-ink bg-fg-1 p-8 shadow-raised"
        >
          {/* VS Background */}
          <div className="absolute inset-0 flex">
            <div className="w-1/2 bg-danger/20" />
            <div className="w-1/2 bg-info/20" />
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
            <Swords className="size-96 text-role-contrast" />
          </div>

          <div className="relative z-10">
            <div className="mb-12 flex items-center justify-between">
              <div className="w-1/3 text-center">
                <div className="mb-2 text-xl font-bold text-danger">
                  {activeBattle.initiator_class_id === classId ? '本班 (红方)' : '敌班 (红方)'}
                </div>
                <div className="text-3xl font-black text-role-contrast">{activeBattle.initiator_class_name}</div>
                <div className="mt-4 text-5xl font-black text-danger drop-shadow-raised">
                  {activeStats.initiatorScore}
                </div>
              </div>

              <div className="w-1/3 text-center">
                <div className="text-6xl font-black italic text-warning drop-shadow-raised">VS</div>
                <div className="mt-4 flex items-center justify-center font-mono text-sm text-role-contrast/70">
                  <RefreshCw className="mr-2 size-4 animate-spin" /> 战况实时同步中
                </div>
              </div>

              <div className="w-1/3 text-center">
                <div className="mb-2 text-xl font-bold text-info">
                  {activeBattle.target_class_id === classId ? '本班 (蓝方)' : '敌班 (蓝方)'}
                </div>
                <div className="text-3xl font-black text-role-contrast">{activeBattle.target_class_name}</div>
                <div className="mt-4 text-5xl font-black text-info drop-shadow-raised">
                  {activeStats.targetScore}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="flex h-6 w-full overflow-hidden rounded-full bg-fg-1 shadow-inner">
              <motion.div 
                className="h-full bg-gradient-to-r from-danger to-danger/60"
                initial={{ width: '50%' }}
                animate={{ 
                  width: `${activeStats.initiatorScore + activeStats.targetScore === 0 ? 50 : (activeStats.initiatorScore / (activeStats.initiatorScore + activeStats.targetScore)) * 100}%` 
                }}
                transition={{ type: 'spring', bounce: 0.2 }}
              />
              <motion.div 
                className="h-full bg-gradient-to-l from-info to-info/60"
                initial={{ width: '50%' }}
                animate={{ 
                  width: `${activeStats.initiatorScore + activeStats.targetScore === 0 ? 50 : (activeStats.targetScore / (activeStats.initiatorScore + activeStats.targetScore)) * 100}%` 
                }}
                transition={{ type: 'spring', bounce: 0.2 }}
              />
            </div>

            <div className="mt-8 flex justify-center">
              <Button 
                onClick={() => handleAction(activeBattle.id, 'end')}
                className="bg-danger text-fg-inverse shadow-raised transition-all hover:scale-105 hover:bg-danger/90"
              >
                结束大乱斗并结算
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Search & Initiate */}
        {!activeBattle && (
          <div className="rounded-panel border border-line-1 bg-surface-2/80 p-6 shadow-card backdrop-blur-xl">
            <h3 className="mb-4 flex items-center text-lg font-bold text-fg-1">
              <Crosshair className="mr-2 size-5 text-role" />
              寻找对手
            </h3>
            <form onSubmit={handleSearch} className="mb-6">
              <Toolbar
                search={{
                  value: searchQuery,
                  onChange: setSearchQuery,
                  placeholder: '输入班级名称搜索...',
                }}
                searchLabel="输入班级名称搜索"
                actions={
                  <Button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="bg-fg-1 text-role-contrast hover:bg-fg-1/90"
                  >
                    {isSearching ? '搜索中...' : '搜索'}
                  </Button>
                }
              />
            </form>

            <div className="space-y-3">
              {searchResults.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-card border border-line-1 bg-surface-3/50 p-4">
                  <span className="font-bold text-fg-2">{c.name}</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setChallengeTarget({ id: c.id, name: c.name })}
                  >
                    发起挑战
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Requests */}
        <div className="space-y-6">
          {pendingReceived.length > 0 && (
            <div className="rounded-panel border border-warning/30 bg-warning/10 p-6 shadow-card">
              <h3 className="mb-4 flex items-center text-lg font-bold text-warning">
                <AlertCircle className="mr-2 size-5 text-warning" />
                收到的挑战战书 ({pendingReceived.length})
              </h3>
              <div className="space-y-3">
                {pendingReceived.map(b => (
                  <div key={b.id} className="flex flex-col justify-between gap-4 rounded-card border border-warning/20 bg-surface-2 p-4 sm:flex-row sm:items-center">
                    <span className="font-bold text-fg-1">
                      来自: <span className="text-danger">{b.initiator_class_name}</span>
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-success text-role-contrast hover:bg-success/90"
                        onClick={() => handleAction(b.id, 'accept')}
                      >
                        应战
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAction(b.id, 'reject')}
                      >
                        拒绝
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingSent.length > 0 && (
            <div className="rounded-panel border border-line-1 bg-surface-3/50 p-6">
              <h3 className="mb-4 flex items-center text-lg font-bold text-fg-2">
                <ShieldAlert className="mr-2 size-5 text-fg-3" />
                已发出的挑战
              </h3>
              <div className="space-y-3">
                {pendingSent.map(b => (
                  <div key={b.id} className="flex items-center justify-between rounded-card border border-line-1 bg-surface-2 p-4">
                    <span className="font-medium text-fg-2">
                      等待 <span className="font-bold text-fg-1">{b.target_class_name}</span> 迎战
                    </span>
                    <Badge variant="warning" className="animate-pulse">
                      Pending
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Battle History */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-fg-1">历史战役记录</h3>
        <DataTable<Battle>
          columns={[
            {
              key: 'initiator',
              header: '发起方',
              render: (b) => (
                <span className={cn('font-medium', b.initiator_class_id === classId ? 'text-role' : 'text-fg-2')}>
                  {b.initiator_class_name}
                </span>
              ),
            },
            {
              key: 'target',
              header: '迎战方',
              render: (b) => (
                <span className={cn('font-medium', b.target_class_id === classId ? 'text-role' : 'text-fg-2')}>
                  {b.target_class_name}
                </span>
              ),
            },
            {
              key: 'status',
              header: '状态',
              render: (b) => (
                <Badge variant={b.status === 'ended' ? 'secondary' : 'destructive'}>
                  {b.status === 'ended' ? '已结束' : '已拒绝'}
                </Badge>
              ),
            },
            {
              key: 'winner',
              header: '获胜方',
              className: 'font-bold text-success',
              render: (b) => (
                b.winner_class_id === b.initiator_class_id
                  ? b.initiator_class_name
                  : (b.winner_class_id === b.target_class_id ? b.target_class_name : '-')
              ),
            },
          ]}
          rows={historyBattles}
          getRowKey={(b) => b.id}
          empty={
            <EmptyState
              icon={Swords}
              title="暂无历史战役记录"
              className="bg-surface-2"
            />
          }
        />
      </div>

      <ConfirmDialog
        open={Boolean(challengeTarget)}
        onOpenChange={(open) => !open && setChallengeTarget(null)}
        title={challengeTarget ? `确定要向 [${challengeTarget.name}] 发起大乱斗挑战吗？` : '发起大乱斗挑战'}
        confirmLabel="发起挑战"
        pendingLabel="发起中..."
        isPending={initiateMutation.isPending}
        onConfirm={async () => {
          if (!challengeTarget) return;
          await initiateBattle(challengeTarget.id, challengeTarget.name);
          setChallengeTarget(null);
        }}
      />
    </PageScaffold>
  );
}
