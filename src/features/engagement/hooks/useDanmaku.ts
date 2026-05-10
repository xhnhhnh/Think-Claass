import { useEffect, useRef, useState } from 'react';

import { danmakuApi } from '../api/danmakuApi';
import type { DanmakuMessageDto } from '@/shared/engagement/contracts';

export interface ActiveDanmaku extends DanmakuMessageDto {
  top: number;
  speed: number;
}

function toActiveMessage(message: DanmakuMessageDto): ActiveDanmaku {
  return {
    ...message,
    top: Math.random() * 60 + 10,
    speed: Math.random() * 5 + 8,
  };
}

export function useDanmakuMessages(classId: number) {
  const [messages, setMessages] = useState<ActiveDanmaku[]>([]);
  const lastIdRef = useRef(0);

  useEffect(() => {
    if (!classId) return;
    let isMounted = true;

    const fetchDanmaku = async () => {
      try {
        const data = await danmakuApi.getMessages(classId, lastIdRef.current || undefined);
        if (!isMounted || !data.success || !data.messages?.length) return;

        setMessages((previous) => [...previous, ...data.messages.map(toActiveMessage)].slice(-50));
        lastIdRef.current = Math.max(lastIdRef.current, ...data.messages.map((message) => message.id));
      } catch (err) {
        // Polling should stay quiet when the network blips.
      }
    };

    void fetchDanmaku();
    const interval = setInterval(fetchDanmaku, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [classId]);

  const removeMessage = (messageId: number) => {
    setMessages((previous) => previous.filter((message) => message.id !== messageId));
  };

  return { messages, removeMessage };
}
