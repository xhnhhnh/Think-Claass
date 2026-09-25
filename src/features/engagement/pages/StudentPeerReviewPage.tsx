import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Ghost,
  MessageSquareHeart,
  Send,
  Sparkles,
  Star,
  UserCircle2,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';

interface PendingPeer {
  id: number;
  name: string;
}

const PRESET_TAGS = [
  "字迹工整", "乐于助人", "创意满分", "进步很大", "回答积极", "团队担当", "耐心细致"
];

/**
 * 同伴互评 (the page calls itself 同学夸夸榜).
 *
 * A `list` page: the page's own `PageHeader` is gone - with a shell above it that
 * component prints no heading anyway, and the scaffold now owns both the heading and
 * the description. The `title` is the route table's label, because that is the one
 * list of paths and labels the shell's `h1` is read from. What is left is the
 * master-detail pair: the pending peers on the left, the review form on the right,
 * each on the tokens and each keeping its entrance.
 *
 * The five star buttons keep their exact `aria-label`s (`给<名字>打<N>分`) and the
 * submit button its label; the submission, the confetti and the list mutation are
 * untouched. The submit is also a palette command, and it runs through a ref holding
 * the latest handler because it reads `comment`/`isAnonymous`/`score` - the registry
 * re-registers only when `id`/`disabled` move.
 */
export default function StudentPeerReview() {
  const user = useStore((state) => state.user);
  const [pendingPeers, setPendingPeers] = useState<PendingPeer[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPeer, setSelectedPeer] = useState<PendingPeer | null>(null);
  const [score, setScore] = useState<number>(0);
  const [hoverScore, setHoverScore] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const fetchPendingPeers = async () => {
    try {
      if (!user?.studentId) return;
      const data = await studentsApi.getPendingPeerReviews(user.studentId);
      if (data.success) {
        setPendingPeers(data.pending);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.studentId) {
      fetchPendingPeers();
    }
  }, [user]);

  const handleTagClick = (tag: string) => {
    if (!comment.includes(tag)) {
      setComment(prev => prev ? `${prev}，${tag}` : tag);
    }
  };

  const handleSubmit = async () => {
    if (!selectedPeer || score === 0) {
      toast.error('请选择一位同学并打分哦！');
      return;
    }

    setSubmitting(true);
    try {
      const data = await studentsApi.submitPeerReview(user!.studentId!, {
        reviewee_id: selectedPeer.id,
        score,
        comment,
        is_anonymous: isAnonymous
      });

      if (data.success) {
        toast.success(data.message);
        void launchConfetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: [...CELEBRATION.cool]
        });
        
        // Remove from list
        setPendingPeers(prev => prev.filter(p => p.id !== selectedPeer.id));
        // Reset form
        setSelectedPeer(null);
        setScore(0);
        setComment('');
        setIsAnonymous(false);
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // The latest handler, so the palette submits the comment and the anonymity flag as
  // they are now rather than as they were when the command was registered.
  const submitRef = useRef(handleSubmit);
  useEffect(() => {
    submitRef.current = handleSubmit;
  });

  useRegisterPageCommands([
    {
      id: 'peer-review:submit',
      label: '发送评价并领奖',
      icon: Send,
      disabled: submitting || score === 0 || !selectedPeer,
      run: () => void submitRef.current(),
    },
  ]);

  return (
    <PageScaffold
      variant="list"
      title="同伴互评"
      description="发现他人的闪光点，真诚的赞美能带来双倍的积分奖励哦！"
    >
      <div className="sm:max-w-xs">
        <StatCard icon={Users} label="本周待评人数" value={pendingPeers.length} />
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left: pending peers */}
        <motion.div
          initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: -16 }) }}
          animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
          transition={{ delay: 0.1 }}
          className="h-fit rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card md:col-span-4"
        >
          <h3 className="mb-4 flex items-center text-lg font-bold text-fg-1">
            <Users aria-hidden="true" className="mr-2 size-5 text-role" />
            待评价的魔法师
          </h3>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-fg-3">
              <Spinner label="正在寻找待评价的同学" />
              <span>寻找中...</span>
            </div>
          ) : pendingPeers.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="本周的任务都完成啦！"
              description="你是一个棒棒的评审员！"
              className="bg-transparent"
            />
          ) : (
            <div className="space-y-3">
              {pendingPeers.map(peer => (
                <Button
                  key={peer.id}
                  variant="ghost"
                  onClick={() => {
                    setSelectedPeer(peer);
                    setScore(0);
                    setComment('');
                  }}
                  className={cn(
                    'h-auto w-full justify-start rounded-card border-2 p-4 text-left transition-all duration-300',
                    selectedPeer?.id === peer.id
                      ? 'relative z-10 scale-105 border-role bg-role-soft shadow-card hover:bg-role-soft'
                      : 'border-line-1 bg-surface-2 hover:border-role/30 hover:bg-surface-3',
                  )}
                >
                  <div
                    className={cn(
                      'mr-3 flex size-10 items-center justify-center rounded-full text-lg font-bold',
                      selectedPeer?.id === peer.id ? 'bg-role text-role-contrast' : 'bg-surface-3 text-fg-2',
                    )}
                  >
                    {peer.name.charAt(0)}
                  </div>
                  <span className={cn('font-bold', selectedPeer?.id === peer.id ? 'text-role-ink' : 'text-fg-2')}>
                    {peer.name}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right: review form */}
        <motion.div
          initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: 16 }) }}
          animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
          transition={{ delay: 0.2 }}
          className="md:col-span-8"
        >
          <AnimatePresence mode="wait">
            {selectedPeer ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.97 }) }}
                animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
                exit={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.97 }) }}
                className="relative isolate overflow-hidden rounded-panel border border-line-1 bg-surface-2 p-8 shadow-card md:p-10"
              >
                <div className="absolute right-0 top-0 -z-10 size-40 rounded-bl-[100%] bg-role-soft" />

                <div className="mb-8 text-center">
                  <div className="mb-4 inline-flex items-center justify-center rounded-card bg-role-soft p-2">
                    <UserCircle2 aria-hidden="true" className="size-16 text-role-ink" />
                  </div>
                  <h3 className="text-2xl font-black text-fg-1">
                    正在评价: <span className="text-role-ink">{selectedPeer.name}</span>
                  </h3>
                  <p className="mt-2 text-fg-3">打分越高，TA获得的奖励积分就越多哦！</p>
                </div>

                {/* Star rating */}
                <div className="mb-8 flex justify-center space-x-2 md:space-x-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.div
                      key={star}
                      whileHover={shouldReduceMotion ? undefined : { scale: 1.2, rotate: 10 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`给${selectedPeer.name}打${star}分`}
                        onMouseEnter={() => setHoverScore(star)}
                        onMouseLeave={() => setHoverScore(0)}
                        onClick={() => setScore(star)}
                        className="size-12 rounded-full hover:bg-transparent md:size-16"
                      >
                        <Star
                          aria-hidden="true"
                          className={cn(
                            'size-12 transition-all duration-300 md:size-16',
                            star <= (hoverScore || score)
                              ? 'fill-warning text-warning drop-shadow-md'
                              : 'fill-surface-3 text-line-strong',
                          )}
                        />
                      </Button>
                    </motion.div>
                  ))}
                </div>

                {/* Comment section */}
                <div className="mb-8 space-y-4">
                  {/* Shortcut chips sit above the field on purpose: `FormField` renders its
                      children inside the `<label>`, and a clickable chip nested in a label
                      would fire the label's activation on every tag click. */}
                  <div className="flex flex-wrap gap-2">
                    {PRESET_TAGS.map(tag => (
                      <Button
                        key={tag}
                        variant="ghost"
                        onClick={() => handleTagClick(tag)}
                        className="h-auto rounded-card border border-role/20 bg-role-soft px-3 py-1.5 text-sm font-medium text-role-ink hover:bg-role-soft hover:text-role-ink"
                      >
                        + {tag}
                      </Button>
                    ))}
                  </div>

                  <FormField
                    label={
                      <span className="flex items-center text-lg font-bold">
                        <Sparkles aria-hidden="true" className="mr-2 size-5 text-role" />
                        留下你的夸夸语录 (选填)
                      </span>
                    }
                  >
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="这位同学本周表现如何？写点鼓励的话吧..."
                      className="h-32 resize-none rounded-card"
                    />
                  </FormField>
                </div>

                {/* Anonymous toggle & submit */}
                <div className="flex flex-col items-center justify-between gap-4 border-t-2 border-dashed border-line-1 pt-6 sm:flex-row">
                  <Button
                    variant="ghost"
                    onClick={() => setIsAnonymous(!isAnonymous)}
                    className={cn(
                      'h-auto rounded-card px-4 py-2',
                      isAnonymous
                        ? 'bg-fg-1 text-fg-inverse hover:bg-fg-1 hover:text-fg-inverse'
                        : 'bg-surface-3 text-fg-3 hover:bg-surface-steel hover:text-fg-1',
                    )}
                  >
                    <Ghost
                      aria-hidden="true"
                      className={cn('mr-2 size-5', isAnonymous ? 'text-fg-inverse' : 'text-fg-3')}
                    />
                    <span className="text-sm font-bold">
                      {isAnonymous ? '已开启匿名模式' : '公开我的名字'}
                    </span>
                  </Button>

                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || score === 0}
                    className="h-auto w-full rounded-card px-8 py-4 text-lg font-black sm:w-auto"
                  >
                    <Send aria-hidden="true" className="mr-2 size-5" />
                    发送评价并领奖
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full"
              >
                <EmptyState
                  icon={MessageSquareHeart}
                  title="请在左侧选择一位同学"
                  description="给出评价后，你们双方都能获得积分奖励哦！"
                  className="h-full min-h-[400px] border-dashed"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </PageScaffold>
  );
}
