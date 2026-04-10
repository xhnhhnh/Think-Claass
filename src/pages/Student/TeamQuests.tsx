import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Users, Target, CheckSquare, MessageCircle, Star, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface TeamMember {
  id: number;
  name: string;
  role: 'leader' | 'member';
  avatar?: string;
}

interface TeamQuest {
  id: number;
  title: string;
  description: string;
  progress: number;
  dueDate: string;
  status: 'active' | 'completed';
  members: TeamMember[];
}

export default function StudentTeamQuests() {
  const user = useStore((state) => state.user);
  
  const [activeQuest, setActiveQuest] = useState<TeamQuest>({
    id: 1,
    title: '环保主题手抄报制作',
    description: '小组成员共同完成一份关于"绿色地球"的手抄报，需要包含文字介绍、插图和数据图表。',
    progress: 60,
    dueDate: '2023-11-20',
    status: 'active',
    members: [
      { id: 101, name: '张小明', role: 'leader' },
      { id: 102, name: '李华', role: 'member' },
      { id: user?.id || 103, name: user?.name || '我', role: 'member' },
      { id: 104, name: '王强', role: 'member' },
    ]
  });

  const [reviewForm, setReviewForm] = useState<{ [key: number]: number }>({});
  const [reviewComments, setReviewComments] = useState<{ [key: number]: string }>({});

  const handleRatingChange = (memberId: number, rating: number) => {
    setReviewForm(prev => ({ ...prev, [memberId]: rating }));
  };

  const handleCommentChange = (memberId: number, comment: string) => {
    setReviewComments(prev => ({ ...prev, [memberId]: comment }));
  };

  const submitPeerReview = () => {
    // Basic validation
    const otherMembers = activeQuest.members.filter(m => m.id !== user?.id);
    if (Object.keys(reviewForm).length < otherMembers.length) {
      toast.error('请为所有组员打分！');
      return;
    }
    toast.success('同伴评价提交成功！');
    // Clear form after submission for demo
    setReviewForm({});
    setReviewComments({});
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl mx-auto space-y-8"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-white rounded-[2rem] p-10 shadow-xl border-b-8 border-orange-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-400 opacity-10 pointer-events-none"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-red-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 flex items-center space-x-6">
          <div className="p-5 bg-orange-100 rounded-[1.5rem] shadow-inner border-b-4 border-orange-300">
            <Users className="w-12 h-12 text-orange-500" />
          </div>
          <div>
            <h1 className="text-5xl font-black mb-2 text-gray-900 drop-shadow-sm">团队任务</h1>
            <p className="text-xl font-bold text-gray-600">协作完成挑战，共同成长！</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quest Progress */}
        <div className="lg:col-span-2 space-y-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl border-8 border-blue-100"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
              <h2 className="text-3xl font-black flex items-center text-gray-900">
                <Target className="w-10 h-10 mr-4 text-blue-500" />
                当前任务: {activeQuest.title}
              </h2>
              <span className={`px-6 py-2 rounded-full text-lg font-black border-b-4 shadow-sm self-start sm:self-auto ${
                activeQuest.status === 'active' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-700 border-gray-300'
              }`}>
                {activeQuest.status === 'active' ? '进行中' : '已完成'}
              </span>
            </div>
            
            <p className="text-gray-700 mb-10 text-xl font-medium leading-relaxed bg-blue-50/50 p-6 rounded-[1.5rem] border-2 border-blue-100">
              {activeQuest.description}
            </p>

            <div className="mb-10">
              <div className="flex justify-between text-lg font-black text-gray-700 mb-3">
                <span>任务进度</span>
                <span className="text-blue-600">{activeQuest.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden border-2 border-gray-300 shadow-inner">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${activeQuest.progress}%` }}
                  transition={{ duration: 1, type: "spring" }}
                  className="bg-blue-500 h-full rounded-full relative"
                >
                  <div className="absolute inset-0 bg-white/20 w-full h-1/2"></div>
                </motion.div>
              </div>
            </div>

            <div className="flex items-center text-lg font-bold text-orange-700 bg-orange-100 p-5 rounded-[1.5rem] border-b-4 border-orange-300 shadow-sm">
              <ShieldAlert className="w-8 h-8 mr-3 text-orange-500" />
              截止日期: {activeQuest.dueDate}
            </div>
          </motion.div>

          {/* Peer Review Form */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl border-8 border-purple-100"
          >
            <h2 className="text-3xl font-black flex items-center text-gray-900 mb-4">
              <CheckSquare className="w-10 h-10 mr-4 text-purple-500" />
              组内互评
            </h2>
            <p className="text-lg font-bold text-gray-500 mb-8">
              请根据组员在任务中的表现给予客观评价。你的评价将帮助团队更好地协作。
            </p>

            <div className="space-y-6">
              {activeQuest.members.filter(m => m.id !== user?.id).map((member, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={member.id} 
                  className="p-6 rounded-[2rem] border-4 border-gray-100 bg-gray-50 hover:bg-white hover:border-purple-200 hover:shadow-lg transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-[1.2rem] border-b-4 border-indigo-200 flex items-center justify-center font-black text-2xl shadow-sm">
                        {member.name[0]}
                      </div>
                      <div>
                        <span className="font-black text-xl text-gray-900 block">{member.name}</span>
                        <span className="text-sm font-bold text-gray-500 bg-gray-200 px-3 py-1 rounded-full mt-1 inline-block">
                          {member.role === 'leader' ? '👑 组长' : '👤 组员'}
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-2 bg-white p-3 rounded-2xl shadow-sm border-2 border-gray-100">
                      {[1, 2, 3, 4, 5].map(star => (
                        <motion.button
                          whileHover={{ scale: 1.2, rotate: 10 }}
                          whileTap={{ scale: 0.9 }}
                          key={star}
                          onClick={() => handleRatingChange(member.id, star)}
                          className="focus:outline-none"
                        >
                          <Star className={`w-8 h-8 ${
                            (reviewForm[member.id] || 0) >= star 
                              ? 'text-yellow-400 fill-current drop-shadow-sm' 
                              : 'text-gray-200'
                          }`} />
                        </motion.button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={reviewComments[member.id] || ''}
                    onChange={(e) => handleCommentChange(member.id, e.target.value)}
                    placeholder="写下对该组员的评价或建议（选填）..."
                    className="w-full p-5 text-lg font-medium rounded-[1.5rem] border-4 border-gray-200 focus:ring-0 focus:border-purple-400 outline-none resize-none bg-white shadow-inner transition-colors"
                    rows={2}
                  />
                </motion.div>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={submitPeerReview}
              className="mt-8 w-full py-5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-[2rem] font-black text-2xl border-b-8 border-indigo-700 shadow-xl flex items-center justify-center transition-all"
            >
              <MessageCircle className="w-8 h-8 mr-3" />
              提交互评
            </motion.button>
          </motion.div>
        </div>

        {/* Sidebar: Team Members */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border-8 border-green-100 sticky top-8">
            <h3 className="text-2xl font-black text-gray-900 mb-6 flex items-center">
              <div className="bg-green-100 p-3 rounded-xl mr-3 shadow-inner">
                <Users className="w-8 h-8 text-green-500" />
              </div>
              我的团队
            </h3>
            <ul className="space-y-4">
              {activeQuest.members.map((member, idx) => (
                <motion.li 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={member.id} 
                  className="flex items-center justify-between p-4 rounded-[1.5rem] bg-gray-50 border-4 border-gray-100 hover:bg-white hover:border-green-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-[1rem] border-b-4 flex items-center justify-center font-black text-xl shadow-sm ${
                      member.id === user?.id 
                        ? 'bg-blue-100 text-blue-600 border-blue-200' 
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                      {member.name[0]}
                    </div>
                    <span className={`font-black text-lg ${member.id === user?.id ? 'text-blue-600' : 'text-gray-800'}`}>
                      {member.name} {member.id === user?.id && <span className="text-sm font-bold text-gray-400 ml-1">(我)</span>}
                    </span>
                  </div>
                  {member.role === 'leader' && (
                    <span className="px-3 py-1.5 bg-yellow-100 text-yellow-700 text-sm font-black rounded-full border-2 border-yellow-200 shadow-sm">
                      👑 组长
                    </span>
                  )}
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
