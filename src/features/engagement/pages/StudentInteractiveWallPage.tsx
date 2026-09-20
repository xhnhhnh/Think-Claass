import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { MessageSquare, Megaphone, Send, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { announcementsApi } from '@/features/engagement/api/announcementsApi';
import { messagesApi } from '@/features/engagement/api/messagesApi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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

/**
 * 互动墙.
 *
 * Two tabs over one page: the class announcements and the anonymous 树洞. The hand-built
 * header card (gradient wash, 4xl title, two raw tab buttons styled as furniture) is a
 * `PageHeader` whose actions are the tab switcher - two `Button`s whose active state is
 * the variant rather than a hand-written class triple.
 *
 * The blue/indigo pair the page was written in is the `primary` accent, the composer's
 * raw textarea is the kit `Textarea` inside the same focus-within frame, and the loading
 * and empty blocks are `Spinner` and `EmptyState`.
 */
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
      const data = await studentsApi.getStudents();
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
      const data = await announcementsApi.getClassAnnouncements(classId!);
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
      const data = await messagesApi.getMessages(classId!, 'TREE_HOLE', { involvedId: user?.studentId });

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

      const data = await messagesApi.sendMessage({
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
      <div className="flex items-center justify-center gap-2 p-20 text-ink-3">
        <Spinner size="lg" label="正在加载互动墙" />
        加载中...
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto flex h-[calc(100vh-10rem)] max-w-5xl flex-col space-y-8"
    >
      {/* Header */}
      <PageHeader
        title="互动墙"
        description="查看班级通知，或给老师留个悄悄话"
        icon={MessageSquare}
        className="shrink-0"
        actions={
          <div className="flex gap-2 rounded-panel border-4 border-primary/10 bg-primary/5 p-2">
            <Button
              type="button"
              variant={activeTab === 'ANNOUNCEMENTS' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('ANNOUNCEMENTS')}
              className={cn(
                'h-auto rounded-card px-6 py-3 font-black',
                activeTab === 'ANNOUNCEMENTS'
                  ? 'border-b-4 border-foreground/20 shadow-card'
                  : 'text-primary hover:bg-primary/10 hover:text-primary',
              )}
            >
              <Megaphone className="mr-2 size-5" />
              班级通知
            </Button>
            <Button
              type="button"
              variant={activeTab === 'TREE_HOLE' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('TREE_HOLE')}
              className={cn(
                'h-auto rounded-card px-6 py-3 font-black',
                activeTab === 'TREE_HOLE'
                  ? 'border-b-4 border-foreground/20 shadow-card'
                  : 'text-primary hover:bg-primary/10 hover:text-primary',
              )}
            >
              <MessageCircle className="mr-2 size-5" />
              树洞心声
            </Button>
          </div>
        }
      />

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'ANNOUNCEMENTS' ? (
          <div className="h-full space-y-6 overflow-y-auto pb-10 pr-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-20 text-ink-3">
                <Spinner size="lg" label="正在加载班级通知" />
                加载中...
              </div>
            ) : announcements.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="暂无通知"
                description="老师还没有发布任何班级通知"
                className="bg-paper"
              />
            ) : (
              announcements.map((ann, index) => (
                <motion.div
                  key={ann.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02, x: 5 }}
                >
                  <Card className="relative overflow-hidden rounded-panel border-4 border-primary/20 p-8 shadow-card transition-all hover:border-primary/40 hover:shadow-raised">
                    <div className="absolute left-0 top-0 h-full w-3 bg-primary" />
                    <div className="pl-6">
                      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <h3 className="flex items-center text-2xl font-black text-ink-1">
                          <div className="mr-4 rounded-card bg-primary/10 p-3 shadow-inner">
                            <Megaphone className="size-6 text-primary" />
                          </div>
                          {ann.title}
                        </h3>
                        <span className="self-start rounded-pill border-2 border-border bg-muted/50 px-4 py-2 text-sm font-bold text-ink-3 shadow-card sm:self-auto">
                          {new Date(ann.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap rounded-card border-2 border-primary/10 bg-primary/5 p-6 text-lg font-medium leading-relaxed text-ink-2">
                        {ann.content}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        ) : (
          <Card className="relative flex h-full flex-col gap-0 overflow-hidden rounded-panel border-b-8 border-primary/20 p-0 shadow-card">
            <div className="pointer-events-none absolute inset-0 bg-primary/5" />
            
            {/* Messages Area */}
            <div className="relative z-10 flex-1 space-y-6 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center gap-2 p-20 text-ink-3">
                  <Spinner size="lg" label="正在加载悄悄话" />
                  加载中...
                </div>
              ) : messages.length === 0 ? (
                <EmptyState
                  icon={MessageCircle}
                  title="悄悄话树洞"
                  description="在这里发消息，除了老师谁也不知道哦！"
                  className="h-full border-none bg-transparent"
                />
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_role === 'student' && msg.sender_id === user?.studentId;
                  
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={msg.id} 
                      className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
                    >
                      <div className={cn('flex max-w-[80%] flex-col', isMine ? 'items-end' : 'items-start')}>
                        <span className="mb-2 px-2 text-sm font-bold text-ink-3">
                          {isMine ? '我 (匿名)' : '老师'} • {new Date(msg.created_at).toLocaleString([], {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        <div className={cn(
                          'rounded-panel border-b-4 px-6 py-4 shadow-card',
                          isMine
                            ? 'rounded-tr-sm border-primary bg-primary text-primary-foreground'
                            : 'rounded-tl-sm border-border bg-paper text-ink-1',
                        )}>
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
            <div className="relative z-10 border-t-4 border-primary/10 bg-primary/5 p-6 backdrop-blur-md">
              <form onSubmit={handleSendMessage} className="flex items-end space-x-4">
                <div className="flex-1 rounded-card border-4 border-primary/10 bg-paper p-2 shadow-inner transition-all duration-300 focus-within:border-primary/40">
                  {/*
                    The frame keeps the focus-within highlight, so the control itself drops
                    its own ring: two rings on one field is what the hand-written version
                    had, and the frame's is the one that survives.
                  */}
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="写下想对老师说的悄悄话..."
                    className="max-h-32 min-h-[44px] resize-none border-transparent bg-transparent px-4 py-2 text-lg font-medium text-ink-1 focus-visible:border-transparent focus-visible:ring-0"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  aria-label="发送悄悄话"
                  className="size-16 shrink-0 rounded-card border-b-4 border-foreground/20 p-0"
                >
                  {sending ? <Spinner size="lg" label="正在发送" /> : <Send className="size-8" />}
                </Button>
              </form>
            </div>
          </Card>
        )}
      </div>
    </motion.div>
  );
}
