import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { MessageCircle, Megaphone, Send, Trash2, User, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { classroomApi } from '@/features/classroom/api/classesApi';
import { announcementsApi, type ClassAnnouncement } from '@/features/engagement/api/announcementsApi';
import { messagesApi } from '@/features/engagement/api/messagesApi';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
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
  /** Either read failing means the feed below is not showing the class's real messages. */
  const [loadError, setLoadError] = useState(false);
  /** 班级通知 - the notices the pupils see on their wall, and their composer. */
  const [notices, setNotices] = useState<ClassAnnouncement[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticesError, setNoticesError] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [deletingNoticeId, setDeletingNoticeId] = useState<number | null>(null);
  const [msgType, setMsgType] = useState('HOME_SCHOOL');
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null); // student id to reply

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    setLoadError(false);
    try {
      const data = await classroomApi.getClasses();
      if (data.success) {
        setClasses(data.classes);
        if (data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id);
        }
      }
    } catch (err) {
      // A log alone left the page saying 「暂无班级数据，请先创建班级。」 - the teacher was
      // told to create a class they may well already have.
      console.error('Failed to fetch classes:', err);
      setLoadError(true);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchMessages();
      void fetchAnnouncements();
    }
  }, [selectedClassId, msgType]);

  const fetchMessages = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await messagesApi.getMessages(selectedClassId!, msgType, { role: 'teacher' });
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (err) {
      // 「暂无消息记录」 is a statement about the class; a rejected request is not entitled
      // to make it, so the feed shows the failure instead and offers the retry.
      console.error('Failed to fetch messages:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 班级通知: the write half of the pupil's 互动墙.
   *
   * `POST /api/class-announcements` had no caller anywhere in the four consoles while the student wall
   * read the same list - so 班级通知 could never have a first entry. The route signs the notice with
   * the actor's own teacher id and checks class ownership, so this only has to send the three fields.
   */
  const fetchAnnouncements = async () => {
    if (!selectedClassId) return;
    setNoticesLoading(true);
    try {
      const data = await announcementsApi.getClassAnnouncements(selectedClassId);
      setNotices(data.success ? data.announcements : []);
      setNoticesError(!data.success);
    } catch (err) {
      console.error('Failed to fetch announcements:', err);
      setNoticesError(true);
    } finally {
      setNoticesLoading(false);
    }
  };

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      toast.error('请先选择班级');
      return;
    }
    if (!noticeTitle.trim() || !noticeContent.trim()) {
      toast.error('请填写通知标题和内容');
      return;
    }

    setPublishing(true);
    try {
      const data = await announcementsApi.createClassAnnouncement({
        classId: selectedClassId,
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
      });
      if (data.success) {
        toast.success('通知已发布，学生打开互动墙就能看到');
        setNoticeTitle('');
        setNoticeContent('');
        await fetchAnnouncements();
      }
    } catch (err) {
      console.error('Publish announcement failed:', err);
      toast.error('发布失败，请稍后重试');
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteNotice = async (id: number) => {
    setDeletingNoticeId(id);
    try {
      await announcementsApi.deleteClassAnnouncement(id);
      toast.success('通知已撤回');
      await fetchAnnouncements();
    } catch (err) {
      console.error('Delete announcement failed:', err);
      toast.error('撤回失败，请稍后重试');
    } finally {
      setDeletingNoticeId(null);
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
        {loadError ? (
          <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
            <p className="font-semibold text-danger">班级列表加载失败</p>
            <p className="mt-1 text-sm text-fg-3">这不代表没有班级，请重试。</p>
            <Button variant="outline" className="mt-3" onClick={() => void fetchClasses()}>
              重新加载
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="暂无班级数据，请先创建班级。"
            className="bg-surface-2"
          />
        )}
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

      {/*
        班级通知: what the pupils read on 互动墙. Declared above the message feed because it is the
        one broadcast in this page - the messages below are 1:1.
      */}
      <SectionCard
        title="班级通知"
        description="发给全班学生，会显示在学生的「互动墙 · 班级通知」里"
      >
        <form onSubmit={handlePublishNotice} className="space-y-4">
          <FormField label="标题" hint="一句话说明这件事">
            <Input
              type="text"
              value={noticeTitle}
              onChange={(e) => setNoticeTitle(e.target.value)}
              placeholder="例如：明天带好数学作业本"
              maxLength={60}
            />
          </FormField>
          <FormField label="内容">
            <Textarea
              value={noticeContent}
              onChange={(e) => setNoticeContent(e.target.value)}
              rows={3}
              placeholder="补充说明（时间、地点、需要准备什么）"
            />
          </FormField>
          <Button type="submit" disabled={publishing || !selectedClassId}>
            {publishing ? (
              <>
                <Spinner label="正在发布" className="text-role-contrast" />
                发布中...
              </>
            ) : (
              <>
                <Megaphone data-icon="inline-start" />
                发布通知
              </>
            )}
          </Button>
        </form>

        <div className="mt-6 space-y-2">
          {noticesLoading ? (
            <div className="py-4 text-sm text-fg-3">正在加载已有通知...</div>
          ) : noticesError ? (
            <div className="rounded-panel border border-danger/20 bg-danger/10 px-4 py-6 text-center text-sm">
              <p className="font-semibold text-danger">已有通知没有加载出来</p>
              <p className="mt-1 text-fg-3">这不代表班级没有通知，请重试。</p>
              <Button variant="outline" className="mt-3" onClick={() => void fetchAnnouncements()}>
                重新加载
              </Button>
            </div>
          ) : notices.length === 0 ? (
            <p className="text-sm text-fg-3">这个班级还没有通知。</p>
          ) : (
            notices.map((notice) => (
              <div
                key={notice.id}
                className="flex items-start justify-between gap-4 rounded-card border border-line-1 bg-surface-3/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg-1">{notice.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-fg-2">{notice.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`撤回通知 ${notice.title}`}
                  className="shrink-0 text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={deletingNoticeId === notice.id}
                  onClick={() => void handleDeleteNotice(notice.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      </SectionCard>

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
          ) : loadError ? (
            <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
              <p className="font-semibold text-danger">消息记录加载失败</p>
              <p className="mt-1 text-sm text-fg-3">这不代表没有消息记录，请重试。</p>
              <Button variant="outline" className="mt-3" onClick={() => void fetchMessages()}>
                重新加载
              </Button>
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
