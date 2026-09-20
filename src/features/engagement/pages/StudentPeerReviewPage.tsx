import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Star, MessageSquareHeart, UserCircle2, Send, CheckCircle2, Sparkles, Ghost, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Textarea } from '@/components/ui/textarea';

interface PendingPeer {
  id: number;
  name: string;
}

const PRESET_TAGS = [
  "字迹工整", "乐于助人", "创意满分", "进步很大", "回答积极", "团队担当", "耐心细致"
];

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

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative overflow-hidden rounded-panel border-b-8 border-primary/30 bg-paper p-10 shadow-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary to-accent-foreground opacity-10" />
        <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
        <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
          <PageHeader
            title="同学夸夸榜"
            description="发现他人的闪光点，真诚的赞美能带来双倍的积分奖励哦！"
            icon={MessageSquareHeart}
            className="flex-1"
          />
          <StatCard
            label="本周待评人数"
            icon={Users}
            value={pendingPeers.length}
            className="shrink-0 border-b-8 border-r-4 border-l-4 border-t-4 border-primary/30 shadow-raised"
          />
        </div>
      </motion.div>

      <div className="grid gap-8 md:grid-cols-12">
        {/* Left: Pending List */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="h-fit rounded-panel border-b-4 border-border bg-paper p-6 shadow-card md:col-span-4"
        >
          <h3 className="mb-6 flex items-center text-xl font-bold text-ink-1">
            <Users className="mr-2 size-5 text-primary" />
            待评价的魔法师
          </h3>
          
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-ink-3">
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
                  className={`h-auto w-full justify-start rounded-card border-2 p-4 text-left transition-all duration-300 ${
                    selectedPeer?.id === peer.id
                      ? 'relative z-10 scale-105 border-primary bg-primary/5 shadow-card hover:bg-primary/5'
                      : 'border-border bg-paper hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <div className={`mr-3 flex size-10 items-center justify-center rounded-full text-lg font-bold ${
                    selectedPeer?.id === peer.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-ink-2'
                  }`}>
                    {peer.name.charAt(0)}
                  </div>
                  <span className={`font-bold ${selectedPeer?.id === peer.id ? 'text-primary' : 'text-ink-2'}`}>
                    {peer.name}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right: Review Form */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="md:col-span-8"
        >
          <AnimatePresence mode="wait">
            {selectedPeer ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative isolate overflow-hidden rounded-panel border-b-4 border-primary/20 bg-paper p-8 shadow-card md:p-10"
              >
                <div className="absolute right-0 top-0 -z-10 size-40 rounded-bl-[100%] bg-primary/5"></div>
                
                <div className="mb-10 text-center">
                  <div className="mb-4 inline-flex items-center justify-center rounded-card bg-primary/5 p-2">
                    <UserCircle2 className="size-16 text-primary" />
                  </div>
                  <h3 className="text-3xl font-black text-ink-1">
                    正在评价: <span className="bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">{selectedPeer.name}</span>
                  </h3>
                  <p className="mt-2 text-ink-3">打分越高，TA获得的奖励积分就越多哦！</p>
                </div>

                {/* Star Rating */}
                <div className="mb-10 flex justify-center space-x-2 md:space-x-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.div
                      key={star}
                      whileHover={{ scale: 1.2, rotate: 10 }}
                      whileTap={{ scale: 0.9 }}
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
                          className={`size-12 transition-all duration-300 md:size-16 ${
                            star <= (hoverScore || score)
                              ? 'fill-warning text-warning drop-shadow-md'
                              : 'fill-muted text-border'
                          }`}
                        />
                      </Button>
                    </motion.div>
                  ))}
                </div>

                {/* Comment Section */}
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
                        className="h-auto rounded-card border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 hover:text-primary"
                      >
                        + {tag}
                      </Button>
                    ))}
                  </div>

                  <FormField
                    label={
                      <span className="flex items-center text-lg font-bold">
                        <Sparkles className="mr-2 size-5 text-primary" />
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

                {/* Anonymous Toggle & Submit */}
                <div className="flex flex-col items-center justify-between gap-4 border-t-2 border-dashed border-border pt-6 sm:flex-row">
                  <Button
                    variant="ghost"
                    onClick={() => setIsAnonymous(!isAnonymous)}
                    className={`h-auto rounded-card px-4 py-2 ${
                      isAnonymous
                        ? 'bg-ink-1 text-paper hover:bg-ink-2 hover:text-paper'
                        : 'bg-muted/50 text-ink-3 hover:bg-muted hover:text-ink-1'
                    }`}
                  >
                    <Ghost className={`mr-2 size-5 ${isAnonymous ? 'text-paper' : 'text-ink-3'}`} />
                    <span className="text-sm font-bold">
                      {isAnonymous ? '已开启匿名模式' : '公开我的名字'}
                    </span>
                  </Button>

                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || score === 0}
                    className={`h-auto w-full rounded-card px-8 py-4 text-lg font-black transition-all sm:w-auto ${
                      score > 0
                        ? 'bg-gradient-to-r from-primary to-accent-foreground text-primary-foreground hover:-translate-y-1'
                        : 'bg-muted text-ink-3'
                    }`}
                  >
                    <Send className="mr-2 size-5" />
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
                  className="h-full min-h-[400px] border-4 border-dashed bg-paper/50"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
