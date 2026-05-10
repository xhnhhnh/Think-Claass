import { motion, AnimatePresence } from 'framer-motion';

import { useDanmakuMessages } from '@/features/engagement/hooks/useDanmaku';

export default function DanmakuOverlay({ classId }: { classId: number }) {
  const { messages, removeMessage } = useDanmakuMessages(classId);

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
                removeMessage(msg.id);
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
