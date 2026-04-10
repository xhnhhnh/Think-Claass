import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Star, MessageSquareHeart, UserCircle2, Send, CheckCircle2, Sparkles, Ghost, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

import { apiGet, apiPost } from "@/lib/api";

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
      const data = await apiGet(`/api/students/${user?.studentId}/peer-reviews/pending`);
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
      const data = await apiPost(`/api/students/${user?.studentId}/peer-reviews`, {
        reviewee_id: selectedPeer.id,
        score,
        comment,
        is_anonymous: isAnonymous
      });

      if (data.success) {
        toast.success(data.message);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f472b6', '#38bdf8', '#fbbf24']
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
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-r from-pink-400 to-rose-400 rounded-[2.5rem] p-10 shadow-xl relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between text-center md:text-left text-white">
          <div>
            <h2 className="text-4xl font-black mb-3 flex items-center justify-center md:justify-start drop-shadow-md">
              <MessageSquareHeart className="h-10 w-10 mr-4" />
              同学夸夸榜
            </h2>
            <p className="text-lg text-pink-50 font-medium">发现他人的闪光点，真诚的赞美能带来双倍的积分奖励哦！</p>
          </div>
          <div className="mt-6 md:mt-0 bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/30 text-center">
            <div className="text-sm font-bold mb-1 opacity-90">本周待评人数</div>
            <div className="text-4xl font-black">{pendingPeers.length}</div>
          </div>
        </div>
      </motion.div>

      <div className="grid md:grid-cols-12 gap-8">
        {/* Left: Pending List */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-4 bg-white rounded-[2rem] p-6 shadow-lg border-b-4 border-slate-100 h-fit"
        >
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <Users className="w-5 h-5 mr-2 text-pink-500" />
            待评价的魔法师
          </h3>
          
          {loading ? (
            <div className="text-center py-10 text-slate-400 animate-pulse">寻找中...</div>
          ) : pendingPeers.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">本周的任务都完成啦！<br/>你是一个棒棒的评审员！</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingPeers.map(peer => (
                <button
                  key={peer.id}
                  onClick={() => {
                    setSelectedPeer(peer);
                    setScore(0);
                    setComment('');
                  }}
                  className={`w-full flex items-center p-4 rounded-xl transition-all duration-300 text-left ${
                    selectedPeer?.id === peer.id 
                      ? 'bg-pink-50 border-2 border-pink-400 shadow-md transform scale-105 z-10 relative' 
                      : 'bg-white border-2 border-slate-100 hover:border-pink-200 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 font-bold text-lg ${
                    selectedPeer?.id === peer.id ? 'bg-pink-400 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {peer.name.charAt(0)}
                  </div>
                  <span className={`font-bold ${selectedPeer?.id === peer.id ? 'text-pink-700' : 'text-slate-700'}`}>
                    {peer.name}
                  </span>
                </button>
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
                className="bg-white rounded-[2rem] p-8 md:p-10 shadow-lg border-b-4 border-pink-100 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-pink-50 rounded-bl-[100%] -z-10"></div>
                
                <div className="text-center mb-10">
                  <div className="inline-flex items-center justify-center p-2 bg-pink-100 rounded-2xl mb-4">
                    <UserCircle2 className="w-16 h-16 text-pink-500" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-800">
                    正在评价: <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500">{selectedPeer.name}</span>
                  </h3>
                  <p className="text-slate-500 mt-2">打分越高，TA获得的奖励积分就越多哦！</p>
                </div>

                {/* Star Rating */}
                <div className="flex justify-center space-x-2 md:space-x-4 mb-10">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button
                      key={star}
                      whileHover={{ scale: 1.2, rotate: 10 }}
                      whileTap={{ scale: 0.9 }}
                      onMouseEnter={() => setHoverScore(star)}
                      onMouseLeave={() => setHoverScore(0)}
                      onClick={() => setScore(star)}
                      className="focus:outline-none"
                    >
                      <Star 
                        className={`w-12 h-12 md:w-16 md:h-16 transition-all duration-300 ${
                          star <= (hoverScore || score)
                            ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]'
                            : 'text-slate-200 fill-slate-100'
                        }`} 
                      />
                    </motion.button>
                  ))}
                </div>

                {/* Comment Section */}
                <div className="space-y-4 mb-8">
                  <label className="block text-slate-700 font-bold text-lg flex items-center">
                    <Sparkles className="w-5 h-5 mr-2 text-pink-400" />
                    留下你的夸夸语录 (选填)
                  </label>
                  
                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {PRESET_TAGS.map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleTagClick(tag)}
                        className="px-3 py-1.5 bg-pink-50 text-pink-600 hover:bg-pink-100 hover:text-pink-700 rounded-lg text-sm font-medium transition-colors border border-pink-100"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="这位同学本周表现如何？写点鼓励的话吧..."
                    className="w-full h-32 px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:bg-white focus:border-pink-300 focus:ring-4 focus:ring-pink-100 outline-none transition-all resize-none text-slate-700 placeholder-slate-400"
                  />
                </div>

                {/* Anonymous Toggle & Submit */}
                <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t-2 border-dashed border-slate-100 gap-4">
                  <button
                    onClick={() => setIsAnonymous(!isAnonymous)}
                    className={`flex items-center px-4 py-2 rounded-xl transition-colors ${
                      isAnonymous 
                        ? 'bg-slate-800 text-white' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <Ghost className={`w-5 h-5 mr-2 ${isAnonymous ? 'text-white' : 'text-slate-400'}`} />
                    <span className="font-bold text-sm">
                      {isAnonymous ? '已开启匿名模式' : '公开我的名字'}
                    </span>
                  </button>

                  <button
                    onClick={handleSubmit}
                    disabled={submitting || score === 0}
                    className={`w-full sm:w-auto px-8 py-4 rounded-2xl font-black text-lg transition-all flex items-center justify-center ${
                      score > 0 
                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-[0_10px_20px_rgba(244,114,182,0.4)] hover:shadow-[0_15px_30px_rgba(244,114,182,0.6)] hover:-translate-y-1' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-5 h-5 mr-2" />
                    发送评价并领奖
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/50 rounded-[2rem] p-12 border-4 border-dashed border-slate-200 flex flex-col items-center justify-center h-full text-center min-h-[400px]"
              >
                <div className="w-24 h-24 bg-pink-100 rounded-full flex items-center justify-center mb-6">
                  <MessageSquareHeart className="w-12 h-12 text-pink-300" />
                </div>
                <h3 className="text-2xl font-black text-slate-400 mb-2">请在左侧选择一位同学</h3>
                <p className="text-slate-400 font-medium">给出评价后，你们双方都能获得积分奖励哦！</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}