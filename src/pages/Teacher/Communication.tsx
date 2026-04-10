import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { MessageCircle, Send, User, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { apiGet, apiPost } from "@/lib/api";

interface ClassItem {
  id: number;
  name: string;
}

interface Message {
  id: number;
  class_id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  type: string;
  is_anonymous: number;
  created_at: string;
  sender_role: string;
  sender_name?: string;
  receiver_name?: string;
}

export default function TeacherCommunication() {
  const user = useStore((state) => state.user);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgType, setMsgType] = useState('HOME_SCHOOL');
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null); // student id to reply

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const data = await apiGet('/api/classes');
      if (data.success) {
        setClasses(data.classes);
        if (data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchMessages();
    }
  }, [selectedClassId, msgType]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/messages?classId=${selectedClassId}&type=${msgType}&role=teacher`);
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (receiverId: number) => {
    if (!replyContent.trim()) return;
    try {
      const data = await apiPost('/api/messages', {
        class_id: selectedClassId,
        sender_id: user?.id,
        receiver_id: receiverId,
        content: replyContent,
        type: msgType,
        sender_role: 'user', // use 'user' so backend joins with users table
        is_anonymous: false
      });

      if (data.success) {
        toast.success('回复成功');
        setReplyContent('');
        setReplyingTo(null);
        fetchMessages();
      } else {
        toast.error(data.message || '回复失败');
      }
    } catch (err) {
      console.error('Reply error:', err);
      toast.error('网络错误');
    }
  };

  if (!classes.length) {
    return <div className="p-8 text-center text-slate-500">暂无班级数据，请先创建班级。</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Class & Type Selector */}
      <div className="bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto">
          <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">选择班级:</span>
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedClassId === cls.id
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                  : 'bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50'
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>
        <div className="flex bg-slate-100/50 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setMsgType('HOME_SCHOOL')}
            className={`flex-1 px-6 py-2 rounded-2xl text-sm font-medium transition-colors ${
              msgType === 'HOME_SCHOOL' ? 'bg-white/80 backdrop-blur-xl text-indigo-600 shadow-[0_2px_12px_rgba(0,0,0,0.03)]' : 'text-slate-600 hover:bg-slate-50/50'
            }`}
          >
            家校留言
          </button>
          <button
            onClick={() => setMsgType('TREE_HOLE')}
            className={`flex-1 px-6 py-2 rounded-2xl text-sm font-medium transition-colors ${
              msgType === 'TREE_HOLE' ? 'bg-white/80 backdrop-blur-xl text-indigo-600 shadow-[0_2px_12px_rgba(0,0,0,0.03)]' : 'text-slate-600 hover:bg-slate-50/50'
            }`}
          >
            树洞心声
          </button>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 overflow-hidden min-h-[500px] flex flex-col">
        <div className="p-6 border-b border-white/60 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <MessageCircle className="w-5 h-5 mr-2 text-indigo-500" />
            {msgType === 'HOME_SCHOOL' ? '家校沟通记录' : '学生树洞留言'}
          </h2>
          <span className="text-sm text-slate-500">共 {messages.length} 条消息</span>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6 bg-slate-50/50/50">
          {loading ? (
            <div className="text-center py-12 text-slate-500">加载中...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              暂无消息记录
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-indigo-100/50 rounded-full flex items-center justify-center mr-3">
                      <User className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 flex items-center">
                        {msg.sender_role === 'user' ? '老师' : (msg.is_anonymous ? `${msg.sender_name} (匿名)` : msg.sender_name)}
                        {msg.sender_role !== 'user' && msg.receiver_name && (
                          <span className="text-sm font-normal text-slate-500 ml-2">
                            发给 {msg.receiver_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 flex items-center mt-0.5">
                        <Clock className="w-3 h-3 mr-1" />
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {msg.sender_role !== 'user' && (
                    <button
                      onClick={() => setReplyingTo(msg.sender_id)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 rounded-2xl"
                    >
                      回复
                    </button>
                  )}
                </div>
                <div className="pl-13 pr-4 text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>

                {replyingTo === msg.sender_id && (
                  <div className="mt-4 pl-13 flex space-x-3 animate-in slide-in-from-top-2">
                    <input
                      type="text"
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder={`回复 ${msg.sender_name}...`}
                      className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleReply(msg.sender_id);
                      }}
                    />
                    <button
                      onClick={() => handleReply(msg.sender_id)}
                      className="bg-gradient-to-r from-indigo-500 to-cyan-500 text-white px-4 py-2 rounded-xl flex items-center text-sm font-medium hover:from-indigo-600 hover:to-cyan-600 transition-colors"
                    >
                      <Send className="w-4 h-4 mr-1" />
                      发送
                    </button>
                    <button
                      onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                      className="bg-slate-100/50 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
