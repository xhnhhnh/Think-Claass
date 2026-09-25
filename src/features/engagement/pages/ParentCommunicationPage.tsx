import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Send, MessageSquare, RefreshCw, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Textarea } from '@/components/ui/textarea';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { toast } from 'sonner';

import { studentsApi } from '@/features/classroom/api/studentsApi';
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

/**
 * 家校信箱.
 *
 * The page is a two-pane letter thread rather than a form, so it takes
 * `PageScaffold variant="detail"` and keeps its own panel composition inside the
 * scaffold's measure. The heading and the refresh control used to be a `PageHeader`
 * plus a second button in a hand-built bar; both are the scaffold's now - the title is
 * suppressed while the shell renders the route's `h1`, and 刷新信箱 went to the context
 * bar (the same button, same `title`, same disabled state).
 *
 * Layout, message filtering, the reverse(), the scroll-to-end effect and the send
 * payload are unchanged: the panel is the same flex column at the same
 * `calc(100vh - 8rem)` height, only its colours are tokens now.
 */
export default function ParentCommunication() {
  const user = useStore(state => state.user);
  const [newMessage, setNewMessage] = useState('');
  const [classId, setClassId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: rawMessages = [], isLoading: loading, refetch } = useMessages(classId, 'HOME_SCHOOL');
  const sendMutation = useSendMessageMutation(classId, 'HOME_SCHOOL');
  const messages = (rawMessages as Message[])
    .filter((m) => {
      const isOwnParentMessage = (m.sender_role === 'parent' || m.sender_role === 'user') && m.sender_id === user?.id;
      const isTeacherReply = (m.sender_role === 'teacher' || m.sender_role === 'user') && m.sender_id !== user?.id && m.receiver_id === user?.id;
      return isOwnParentMessage || isTeacherReply;
    })
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
        sender_role: 'parent',
      });
      setNewMessage('');
      await refetch();
      toast.success('信件已寄出');
    } catch (error) {
      toast.error('寄信失败，请重试');
    }
  };

  // Registered before the early return below so the hook order is stable.
  useRegisterPageCommands([
    {
      id: 'parent-communication:refresh',
      label: '刷新信箱',
      icon: RefreshCw,
      keywords: ['家校信箱', '刷新', '留言'],
      run: () => {
        if (classId) void refetch();
      },
      disabled: loading,
    },
  ]);

  if (!user?.studentId) {
    return (
      <PageScaffold variant="detail" title="家校信箱" description="记录与老师的每一次温暖交流">
        <EmptyState
          icon={Heart}
          className="mx-auto h-80 max-w-4xl"
          title="等待宝贝加入"
          description="您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。"
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="detail"
      title="家校信箱"
      description="记录与老师的每一次温暖交流"
      actions={
        <Button
          type="button"
          onClick={() => classId && refetch()}
          disabled={loading}
          className="rounded-xl bg-role-soft p-2.5 text-role-ink transition-all duration-300 hover:bg-role/20 disabled:opacity-50"
          title="刷新信箱"
        >
          <RefreshCw className={`size-5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      }
    >
      <div className="relative mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col overflow-hidden rounded-panel border border-line-1 bg-surface-3 shadow-raised">
        {/* Messages Area */}
        <div className="relative flex-1 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-3/80 to-surface-3/40"></div>

          <div className="relative z-10 h-full">
            {messages.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center text-fg-3">
                <div className="mb-4 flex size-20 items-center justify-center rounded-full bg-surface-2/60">
                  <MessageSquare className="size-8 opacity-50" />
                </div>
                <p className="font-medium tracking-wide">信箱空空如也，写下第一封信吧</p>
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((msg) => {
                  const isMine = (msg.sender_role === 'parent' || msg.sender_role === 'user') && msg.sender_id === user.id;

                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[75%] flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <span className="mb-1.5 px-2 text-xs font-medium tracking-wider text-fg-3">
                          {isMine ? '我' : msg.sender_name || '老师'} • {new Date(msg.created_at).toLocaleString([], {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        <div
                          className={`rounded-panel px-6 py-4 shadow-card ${
                            isMine
                              ? 'rounded-tr-sm bg-role text-role-contrast'
                              : 'rounded-tl-sm border border-line-1 bg-surface-2 text-fg-1'
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
        <div className="relative z-10 border-t border-line-1 bg-surface-2/80 p-6 backdrop-blur-md">
          <form onSubmit={handleSend} className="mx-auto flex max-w-4xl items-end space-x-4">
            <div className="flex-1 rounded-card border border-line-1 bg-surface-2/80 p-2.5 shadow-inset transition-all duration-300 focus-within:border-role/30 focus-within:ring-4 focus-within:ring-role/10">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="写下想对老师说的话..."
                className="max-h-32 min-h-[44px] w-full resize-none border-none bg-transparent px-4 py-2 text-[15px] tracking-wide text-fg-2 placeholder:text-fg-3 focus:ring-0"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
            </div>
            <Button
              type="submit"
              disabled={!newMessage.trim() || sendMutation.isPending}
              className="h-14 w-14 flex-shrink-0 rounded-sheet bg-role text-role-contrast shadow-card transition-all duration-300 hover:-translate-y-1 hover:bg-role/90 hover:shadow-raised hover:shadow-role/30 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-role disabled:hover:shadow-card"
            >
              {sendMutation.isPending ? <RefreshCw className="size-6 animate-spin" /> : <Send className="ml-1 size-6" />}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs font-medium tracking-widest text-fg-3">按 Enter 发出信件，Shift + Enter 换行</p>
        </div>
      </div>
    </PageScaffold>
  );
}
