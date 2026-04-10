import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { MessageSquare, Megaphone, Loader2, Send, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { apiGet, apiPost } from "@/lib/api";

interface Announcement {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

interface Message {
  id: number;
  class_id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  is_anonymous: number;
  type: string;
  sender_role: string;
  created_at: string;
  sender_name?: string;
}

export default function StudentInteractiveWall() {
  const user = useStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'ANNOUNCEMENTS' | 'TREE_HOLE'>('ANNOUNCEMENTS');
  
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.studentId) {
      fetchStudentClass();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchStudentClass = async () => {
    try {
      const data = await apiGet(`/api/students`);
      if (data.success) {
        const student = data.students.find((s: any) => s.id === user?.studentId);
        if (student && student.class_id) {
          setClassId(student.class_id);
        } else {
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('获取班级信息失败', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (classId) {
      if (activeTab === 'ANNOUNCEMENTS') {
        fetchAnnouncements();
      } else {
        fetchMessages();
      }
    }
  }, [classId, activeTab]);

  useEffect(() => {
    if (activeTab === 'TREE_HOLE') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/class-announcements?classId=${classId}`);
      if (data.success) {
        setAnnouncements(data.announcements);
      }
    } catch (error) {
      console.error('获取通知失败', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const data = await apiGet(
        `/api/messages?classId=${classId}&type=TREE_HOLE&involvedId=${user?.studentId}`
      );

      if (data.success) {
        setMessages(data.messages.reverse()); // Chronological order
      }
    } catch (error) {
      console.error('获取留言失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !classId || !user?.studentId) return;

    try {
      setSending(true);

      const data = await apiPost('/api/messages', {
        class_id: classId,
        sender_id: user.studentId,
        content: newMessage.trim(),
        is_anonymous: true,
        type: 'TREE_HOLE',
        sender_role: 'student'
      });

      if (data.success) {
        setNewMessage('');
        await fetchMessages();
        toast.success('留言发送成功！');
      } else {
        toast.error(data.message || '发送失败');
      }
    } catch (error) {
      toast.error('发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  if (loading && !classId) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto space-y-8 h-[calc(100vh-10rem)] flex flex-col"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-white rounded-[2rem] p-8 shadow-xl border-b-8 border-blue-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden flex-shrink-0"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 opacity-10 pointer-events-none"></div>
        
        <div className="relative z-10 mb-6 md:mb-0 text-center md:text-left">
          <h2 className="text-4xl font-black text-gray-900 mb-2 drop-shadow-sm flex items-center justify-center md:justify-start">
            <MessageSquare className="w-10 h-10 text-blue-500 mr-4" />
            互动墙
          </h2>
          <p className="text-lg text-gray-600 font-bold">查看班级通知，或给老师留个悄悄话</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-blue-50 p-2 rounded-3xl border-4 border-blue-100 relative z-10">
          <button
            onClick={() => setActiveTab('ANNOUNCEMENTS')}
            className={`px-6 py-3 rounded-2xl font-black transition-all ${
              activeTab === 'ANNOUNCEMENTS'
                ? 'bg-blue-500 text-white shadow-md border-b-4 border-blue-700 scale-105'
                : 'text-blue-500 hover:bg-blue-100'
            }`}
          >
            <div className="flex items-center">
              <Megaphone className="w-5 h-5 mr-2" />
              班级通知
            </div>
          </button>
          <button
            onClick={() => setActiveTab('TREE_HOLE')}
            className={`px-6 py-3 rounded-2xl font-black transition-all ${
              activeTab === 'TREE_HOLE'
                ? 'bg-indigo-500 text-white shadow-md border-b-4 border-indigo-700 scale-105'
                : 'text-indigo-500 hover:bg-indigo-100'
            }`}
          >
            <div className="flex items-center">
              <MessageCircle className="w-5 h-5 mr-2" />
              树洞心声
            </div>
          </button>
        </div>
      </motion.div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'ANNOUNCEMENTS' ? (
          <div className="h-full overflow-y-auto pr-2 space-y-6 pb-10">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              </div>
            ) : announcements.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-[3rem] p-16 text-center border-8 border-dashed border-gray-200 shadow-sm"
              >
                <div className="inline-flex items-center justify-center p-8 bg-gray-100 rounded-full mb-6 shadow-inner">
                  <Megaphone className="h-16 w-16 text-gray-400" />
                </div>
                <h3 className="text-3xl font-black text-gray-600">暂无通知</h3>
                <p className="text-xl font-bold text-gray-400 mt-4">老师还没有发布任何班级通知</p>
              </motion.div>
            ) : (
              announcements.map((ann, index) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  key={ann.id} 
                  className="bg-white rounded-[2rem] p-8 border-b-8 border-r-4 border-l-4 border-t-4 border-blue-200 shadow-lg hover:border-blue-400 hover:shadow-xl transition-all relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-3 h-full bg-blue-500"></div>
                  <div className="pl-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                      <h3 className="text-2xl font-black text-gray-900 flex items-center">
                        <div className="bg-blue-100 p-3 rounded-xl mr-4 shadow-inner">
                          <Megaphone className="w-6 h-6 text-blue-500" />
                        </div>
                        {ann.title}
                      </h3>
                      <span className="text-sm font-bold text-gray-500 bg-gray-100 px-4 py-2 rounded-full border-2 border-gray-200 shadow-sm self-start sm:self-auto">
                        {new Date(ann.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-lg font-medium bg-blue-50/50 p-6 rounded-2xl border-2 border-blue-100/50">
                      {ann.content}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] shadow-xl border-b-8 border-indigo-200 overflow-hidden flex flex-col h-full relative">
            <div className="absolute inset-0 bg-indigo-50/30 pointer-events-none"></div>
            
            {/* Messages Area */}
            <div className="flex-1 p-6 overflow-y-auto relative z-10 space-y-6">
              {loading ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-indigo-300">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4 border-4 border-indigo-100">
                    <MessageCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-black text-indigo-400 mb-2">悄悄话树洞</h3>
                  <p className="font-bold tracking-wide">在这里发消息，除了老师谁也不知道哦！</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_role === 'student' && msg.sender_id === user?.studentId;
                  
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={msg.id} 
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <span className="text-sm text-indigo-400 mb-2 px-2 font-bold">
                          {isMine ? '我 (匿名)' : '老师'} • {new Date(msg.created_at).toLocaleString([], {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        <div 
                          className={`px-6 py-4 rounded-[2rem] shadow-md border-b-4 ${
                            isMine 
                              ? 'bg-indigo-500 text-white border-indigo-700 rounded-tr-sm' 
                              : 'bg-white border-gray-200 text-gray-800 rounded-tl-sm'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-lg font-medium">{msg.content}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-indigo-50/80 backdrop-blur-md border-t-4 border-indigo-100 relative z-10">
              <form onSubmit={handleSendMessage} className="flex items-end space-x-4">
                <div className="flex-1 bg-white rounded-[1.5rem] border-4 border-indigo-100 focus-within:border-indigo-400 transition-all duration-300 p-2 shadow-inner">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="写下想对老师说的悄悄话..."
                    className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] text-lg font-medium py-2 px-4 text-gray-700 placeholder-indigo-300"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                <motion.button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95, y: 0 }}
                  className="flex-shrink-0 h-16 w-16 flex items-center justify-center bg-indigo-500 text-white rounded-[1.5rem] border-b-4 border-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {sending ? <Loader2 className="w-8 h-8 animate-spin" /> : <Send className="w-8 h-8 ml-1" />}
                </motion.button>
              </form>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}