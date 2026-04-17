import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Send, MessageSquare, AlertCircle, RefreshCw, Heart } from 'lucide-react';
import { toast } from 'sonner';

import { studentsApi } from '@/api/students';
import { useMessages, useSendMessageMutation } from '@/hooks/queries/useMessages';

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

export default function ParentCommunication() {
  const user = useStore(state => state.user);
  const [newMessage, setNewMessage] = useState('');
  const [classId, setClassId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: rawMessages = [], isLoading: loading, refetch } = useMessages(classId, 'HOME_SCHOOL');
  const sendMutation = useSendMessageMutation(classId, 'HOME_SCHOOL');
  const messages = (rawMessages as Message[])
    .filter(
      (m) =>
        (m.sender_role === 'user' && m.sender_id === user?.id) ||
        m.receiver_id === user?.id ||
        (m.sender_role === 'teacher' && m.receiver_id === user?.id),
    )
    .reverse();

  useEffect(() => {
    if (!user?.studentId) return;

    const init = async () => {
      try {
        const data = (await studentsApi.getStudentById(user.studentId)) as any;
        if (data.success && data.student) {
          setClassId(data.student.class_id);
        }
      } catch (error) {
        console.error('Failed to init communication', error);
      }
    };
    init();
  }, [user?.studentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !classId || !user) return;

    try {
      await sendMutation.mutateAsync({
        class_id: classId,
        sender_id: user.id,
        content: newMessage.trim(),
        is_anonymous: false,
        type: 'HOME_SCHOOL',
        sender_role: 'user',
      });
      setNewMessage('');
      await refetch();
      toast.success('信件已寄出');
    } catch (error) {
      toast.error('寄信失败，请重试');
    }
  };

  if (!user?.studentId) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100/50 p-8 text-center max-w-4xl mx-auto">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <Heart className="w-10 h-10 text-coral-400" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-3">等待宝贝加入</h2>
        <p className="text-stone-500 max-w-md">
          您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col bg-[#fffdfa] rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100/50 overflow-hidden relative">
      {/* Header */}
      <div className="px-8 py-6 border-b border-amber-100/50 bg-white/50 backdrop-blur-sm flex justify-between items-center relative z-10">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-coral-50 text-coral-500 rounded-2xl flex items-center justify-center shadow-inner">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800 tracking-wide">家校信箱</h1>
            <p className="text-sm text-stone-500 mt-1">记录与老师的每一次温暖交流</p>
          </div>
        </div>
        <button 
          onClick={() => classId && refetch()}
          disabled={loading}
          className="p-2.5 text-stone-400 hover:text-coral-500 hover:bg-coral-50 rounded-xl transition-all duration-300 disabled:opacity-50"
          title="刷新信箱"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 p-8 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#fffdfa]/80 to-[#fffdfa]/40 pointer-events-none"></div>
        
        <div className="relative z-10 h-full">
          {messages.length === 0 && !loading ? (
            <div className="h-full flex flex-col items-center justify-center text-stone-400">
              <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 opacity-50" />
              </div>
              <p className="font-medium tracking-wide">信箱空空如也，写下第一封信吧</p>
            </div>
          ) : (
            <div className="space-y-8">
              {messages.map((msg) => {
                const isMine = msg.sender_role === 'user' && msg.sender_id === user.id;
                
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-stone-400 mb-1.5 px-2 font-medium tracking-wider">
                        {isMine ? '我' : msg.sender_name || '老师'} • {new Date(msg.created_at).toLocaleString([], {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                      <div 
                        className={`px-6 py-4 rounded-[2rem] shadow-[0_4px_20px_rgb(0,0,0,0.03)] ${
                          isMine 
                            ? 'bg-coral-400 text-white rounded-tr-sm' 
                            : 'bg-white border border-amber-50 text-stone-800 rounded-tl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white/80 backdrop-blur-md border-t border-amber-100/50 relative z-10">
        <form onSubmit={handleSend} className="flex items-end space-x-4 max-w-4xl mx-auto">
          <div className="flex-1 bg-stone-50/80 rounded-[1.5rem] border border-stone-200/60 focus-within:border-coral-300 focus-within:ring-4 focus-within:ring-coral-100/50 transition-all duration-300 p-2.5 shadow-inner">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="写下想对老师说的话..."
              className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] text-[15px] py-2 px-4 text-stone-700 placeholder-stone-400 tracking-wide"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() || sendMutation.isPending}
            className="flex-shrink-0 h-14 w-14 flex items-center justify-center bg-coral-400 text-white rounded-[1.25rem] hover:bg-coral-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-coral-500/30 disabled:opacity-50 disabled:hover:bg-coral-400 disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-300 shadow-md"
          >
            {sendMutation.isPending ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6 ml-1" />}
          </button>
        </form>
        <p className="text-center text-xs text-stone-400 mt-4 tracking-widest font-medium">按 Enter 发出信件，Shift + Enter 换行</p>
      </div>
    </div>
  );
}
