import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { Sparkles, MessageCircle } from 'lucide-react';

import { apiGet, apiPost } from "@/lib/api";

interface DanmakuMessage {
  id: number;
  class_id: number;
  sender_name: string;
  content: string;
  color: string;
  created_at: string;
}

interface ActiveDanmaku extends DanmakuMessage {
  top: number;
  speed: number;
}

export default function DanmakuOverlay({ classId }: { classId: number }) {
  const [messages, setMessages] = useState<ActiveDanmaku[]>([]);
  const [lastId, setLastId] = useState<number>(0);
  const [inputContent, setInputContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const user = useStore(state => state.user);

  useEffect(() => {
    if (!classId) return;

    // Fetch new messages every 2 seconds
    const fetchDanmaku = async () => {
      try {
        const url = lastId === 0 ? `/api/danmaku?classId=${classId}` : `/api/danmaku?classId=${classId}&since=${lastId}`;
        const data = await apiGet(url);

        if (data.success && data.messages && data.messages.length > 0) {
          const newMessages = data.messages.map((msg: DanmakuMessage) => ({
            ...msg,
            top: Math.random() * 60 + 10, // Random top position between 10% and 70%
            speed: Math.random() * 5 + 8, // Random duration between 8s and 13s
          }));
          
          setMessages(prev => [...prev, ...newMessages].slice(-50)); // Keep max 50 on screen
          setLastId(Math.max(...data.messages.map((m: any) => m.id)));
        }
      } catch (err) {
        // ignore network errors silently for polling
      }
    };

    fetchDanmaku(); // Initial fetch
    const interval = setInterval(fetchDanmaku, 2000);
    return () => clearInterval(interval);
  }, [classId, lastId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim() || !classId || !user) return;

    const currentInput = inputContent;
    setInputContent('');
    setIsFocused(false);

    try {
      await apiPost('/api/danmaku', {
        class_id: classId,
        sender_name: user.name || user.username,
        content: currentInput,
        color: color
      });
      // the polling will pick it up automatically
    } catch (err) {
      console.error('Failed to send danmaku', err);
    }
  };

  return (
    <>
      {/* Danmaku Rendering Layer (Pointer events disabled so it doesn't block UI) */}
      <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ x: '100vw', opacity: 0 }}
              animate={{ x: '-100vw', opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: msg.speed, ease: "linear" }}
              onAnimationComplete={() => {
                setMessages(prev => prev.filter(m => m.id !== msg.id));
              }}
              style={{ top: `${msg.top}%`, color: msg.color }}
              className="absolute whitespace-nowrap px-4 py-2 rounded-full font-bold text-xl md:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] bg-black/20 backdrop-blur-sm border border-white/10 flex items-center gap-2"
            >
              <span className="text-xs md:text-sm text-white/70 font-normal">[{msg.sender_name}]</span>
              {msg.content}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Interactive Input Layer (Only visible when user is a student or teacher wants to chat) */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isFocused ? (
          <button 
            onClick={() => setIsFocused(true)}
            className="w-14 h-14 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full shadow-lg shadow-indigo-500/30 flex items-center justify-center text-white hover:scale-110 transition-transform"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        ) : (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border border-indigo-100 flex items-center gap-3"
          >
            <div className="flex gap-1 border-r border-indigo-100 pr-3">
              {['#ffffff', '#f87171', '#34d399', '#60a5fa', '#fbbf24'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-indigo-500 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                autoFocus
                type="text"
                maxLength={50}
                placeholder="发送全屏弹幕..."
                value={inputContent}
                onChange={e => setInputContent(e.target.value)}
                onBlur={() => {
                  if (!inputContent) setIsFocused(false);
                }}
                className="bg-transparent border-none focus:ring-0 text-slate-800 font-medium placeholder-slate-400 w-48"
              />
              <button 
                type="submit"
                disabled={!inputContent.trim()}
                className="p-2 bg-indigo-500 text-white rounded-xl disabled:opacity-50"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
        )}
      </div>
    </>
  );
}