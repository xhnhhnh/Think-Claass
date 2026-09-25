import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { MessageCircle, Send, User, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { classroomApi } from '@/features/classroom/api/classesApi';
import { messagesApi } from '@/features/engagement/api/messagesApi';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { Toolbar } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';

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

/**
 * 家校与留言.
 *
 * The class chips and the message-type switch are two filters over one feed, so they
 * are one `Toolbar`: the page used to hand-write both rows and colour the active chip
 * with an indigo-cyan gradient. The feed keeps its bubbles; the reply row keeps its
 * `animate-slide-in-top` entrance, which is a real keyframe now.
 */
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
      const data = await classroomApi.getClasses();
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
      const data = await messagesApi.getMessages(selectedClassId!, msgType, { role: 'teacher' });
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
      const data = await messagesApi.sendMessage({
        class_id: selectedClassId,
        sender_id: user?.id,
        receiver_id: receiverId,
        content: replyContent,
        type: msgType,
        sender_role: 'teacher',
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

  // The feed has no page-level button; its one action is re-reading the thread.
  useRegisterPageCommands([
    {
      id: 'teacher-communication:refresh',
      label: '刷新留言',
      icon: MessageCircle,
      keywords: ['留言', '家校', '树洞', '刷新'],
      run: () => void fetchMessages(),
    },
  ]);

  if (!classes.length) {
    return (
      <PageScaffold variant="list">
        <EmptyState
          icon={MessageCircle}
          title="暂无班级数据，请先创建班级。"
          className="bg-surface-2"
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="list"
      contentClassName="mx-auto max-w-5xl"
      toolbar={
        <Toolbar
          filters={
            <>
              <span className="mr-1 shrink-0 text-sm font-bold text-fg-3">选择班级:</span>
              {classes.map((cls) => (
                <Button
                  key={cls.id}
                  size="sm"
                  variant={selectedClassId === cls.id ? 'default' : 'outline'}
                  className="shrink-0 rounded-pill"
                  onClick={() => setSelectedClassId(cls.id)}
                >
                  {cls.name}
                </Button>
              ))}
            </>
          }
          actions={
            <div className="flex rounded-card bg-surface-3/50 p-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMsgType('HOME_SCHOOL')}
                className={cn(
                  'px-6',
                  msgType === 'HOME_SCHOOL' && 'bg-surface-2 text-role shadow-card hover:bg-surface-2',
                )}
              >
                家校留言
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMsgType('TREE_HOLE')}
                className={cn(
                  'px-6',
                  msgType === 'TREE_HOLE' && 'bg-surface-2 text-role shadow-card hover:bg-surface-2',
                )}
              >
                树洞心声
              </Button>
            </div>
          }
        />
      }
    >

      <Card className="flex min-h-[500px] flex-col gap-0 overflow-hidden rounded-panel border-line-1 bg-surface-2/80 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-line-1 bg-surface-3/50 p-6">
          <h2 className="flex items-center text-lg font-bold text-fg-1">
            <MessageCircle className="mr-2 size-5 text-role" />
            {msgType === 'HOME_SCHOOL' ? '家校沟通记录' : '学生树洞留言'}
          </h2>
          <span className="text-sm text-fg-3">共 {messages.length} 条消息</span>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto bg-surface-3/50 p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-fg-3">
              <Spinner label="正在加载消息" />
              加载中...
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="暂无消息记录"
              className="border-transparent bg-transparent"
            />
          ) : (
            messages.map((msg) => {
              const isTeacherMessage = msg.sender_role === 'teacher' || (msg.sender_role === 'user' && msg.sender_id === user?.id);

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-card border border-line-1 bg-surface-2 p-5 shadow-card"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center">
                      <div className="mr-3 flex size-10 items-center justify-center rounded-full bg-role/10">
                        <User className="size-5 text-role" />
                      </div>
                      <div>
                        <div className="flex items-center font-bold text-fg-1">
                          {isTeacherMessage ? '老师' : (msg.is_anonymous ? `${msg.sender_name} (匿名)` : msg.sender_name)}
                          {!isTeacherMessage && msg.receiver_name && (
                            <span className="ml-2 text-sm font-normal text-fg-3">
                              发给 {msg.receiver_name}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center text-xs text-fg-3">
                          <Clock className="mr-1 size-3" />
                          {new Date(msg.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {!isTeacherMessage && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setReplyingTo(msg.sender_id)}
                        className="rounded-pill bg-info/10 px-3 text-info hover:bg-info/20 hover:text-info"
                      >
                        回复
                      </Button>
                    )}
                  </div>
                  <div className="pl-12 pr-4 leading-relaxed whitespace-pre-wrap text-fg-2">
                    {msg.content}
                  </div>

                  {replyingTo === msg.sender_id && (
                    <div className="mt-4 flex animate-slide-in-top gap-3 pl-12">
                      <Input
                        type="text"
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder={`回复 ${msg.sender_name}...`}
                        aria-label={`回复 ${msg.sender_name}`}
                        className="flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleReply(msg.sender_id);
                        }}
                      />
                      <Button
                        onClick={() => handleReply(msg.sender_id)}
                        className="bg-gradient-to-r from-role to-info text-role-contrast hover:from-role hover:to-info"
                      >
                        <Send className="mr-1 size-4" />
                        发送
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                      >
                        取消
                      </Button>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </Card>
    </PageScaffold>
  );
}
