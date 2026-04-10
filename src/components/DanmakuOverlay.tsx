import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiGet } from "@/lib/api";

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
    </>
  );
}