import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Activity,
  Award,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Dice5,
  Edit2,
  Minus,
  Plus,
  PlusCircle,
  Search,
  Settings2,
  Timer,
  UserPlus,
  Users,
  UsersRound,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { KpiStrip } from '@/components/ui/kpi-strip';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, closestCorners } from '@dnd-kit/core';
import { DroppableGroup } from '@/pages/Teacher/components/DroppableGroup';
import { DraggableStudent } from '@/pages/Teacher/components/DraggableStudent';
import { ClassroomTools } from '@/pages/Teacher/components/ClassroomTools';

import { useClasses } from '@/hooks/queries/useClasses';
import { useStudents } from '@/hooks/queries/useStudents';
import { useGroups } from '@/hooks/queries/useGroups';
import { usePresets } from '@/hooks/queries/usePresets';
import { useStudentMutations } from '@/hooks/queries/useStudentMutations';
import { useSettings } from '@/hooks/queries/useSettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '@/features/classroom/api/analyticsApi';
import { teacherApi } from '@/features/classroom/api/classesApi';
import { praisesApi, type Praise } from '@/features/engagement/api/praisesApi';
import { useStore } from '@/store/useStore';
import { launchConfetti } from '@/lib/confetti';
import { FirstRunWizard } from '@/features/onboarding/FirstRunWizard';
import { useFirstRun } from '@/features/onboarding/useFirstRun';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { studentsApi } from '@/features/classroom/api/studentsApi';

import { PointsModal } from '@/pages/Teacher/components/PointsModal';
import { CreateClassModal } from '@/pages/Teacher/components/CreateClassModal';
import { CreateGroupModal } from '@/pages/Teacher/components/CreateGroupModal';
import { PraiseModal } from '@/pages/Teacher/components/PraiseModal';
import { EditStudentsModal } from '@/pages/Teacher/components/EditStudentsModal';
import { AIRadarModal } from '@/pages/Teacher/components/AIRadarModal';
import ClassFeaturePanel from '@/pages/Teacher/components/ClassFeaturePanel';
import { IncentivePolicyPanel } from '@/features/classroom/components/IncentivePolicyPanel';
import {  } from '@/lib/utils';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const { shouldShow: showFirstRun, dismiss: dismissFirstRun } = useFirstRun();

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [showTools, setShowTools] = useState(false);

  /** 最近表扬: the class's praise roll-up, read through `praisesApi.getClassPraises`. */
  const [praises, setPraises] = useState<Praise[]>([]);
  const [praisesLoading, setPraisesLoading] = useState(false);
  const [praisesFailed, setPraisesFailed] = useState(false);

  // Queries
  const { data: classes = [] } = useClasses();
  const { data: students = [], isLoading: loadingStudents, isError: studentsFailed, refetch: refetchStudents } =
    useStudents(selectedClassId);
  const { data: groups = [] } = useGroups(selectedClassId);
  const { data: presets = [] } = usePresets();
  const { data: settings } = useSettings();

  // Mutations
  const {
    addPointsMutation,
    addBatchPointsMutation,
    changeGroupMutation,
  } = useStudentMutations(selectedClassId);

  const batchEditMutation = useMutation({
    mutationFn: (data: { studentIds: number[]; action: 'change_class' | 'change_group' | 'reset_password'; value: string }) =>
      studentsApi.batchEdit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', selectedClassId] });
      toast.success('批量修改成功');
    },
  });

  const createClassMutation = useMutation({
    mutationFn: async (name: string) => teacherApi.createClass(name, user?.id),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setSelectedClassId(data.class.id);
      setShowAddClass(false);
      toast.success('班级创建成功');
    }
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => teacherApi.createGroup(name, selectedClassId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', selectedClassId] });
      setShowAddGroup(false);
      toast.success('小组创建成功');
    }
  });

  const createPresetMutation = useMutation({
    mutationFn: async ({ label, amount }: { label: string, amount: number }) => teacherApi.createPreset(label, amount, user?.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presets'] })
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (id: number) => teacherApi.deletePreset(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presets'] })
  });

  const praiseMutation = useMutation({
    mutationFn: async ({ studentId, content, color }: { studentId: number, content: string, color: string }) =>
      teacherApi.sendPraise({ teacher_id: user?.id ?? 1, student_id: studentId, content, color }),
    onSuccess: () => {
      toast.success('表扬信发送成功！学生已获得经验加成！');
      triggerConfetti();
      setShowPraiseModal(false);
      // The roll-up above is stale the moment the praise is stored.
      void loadPraises();
    }
  });

  const studentRadarMutation = useMutation({
    mutationFn: async (studentId: number) => analyticsApi.getStudentRadar(studentId),
    onSuccess: (data) => {
      setAiAnalysisStage(3);
      setAiReport({
        strengths: data.report.strengths,
        weaknesses: data.report.weaknesses,
        advice: data.report.advice.join(' '),
      });
    },
    onError: () => {
      // The api layer already toasted the server's reason; close the fake "analysing" animation
      // rather than leaving it spinning at stage 2.
      setShowAIModal(false);
    },
  });

  // Modal States
  const [showAddClass, setShowAddClass] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);

  const [showPointsModal, setShowPointsModal] = useState(false);
  const [pointsTarget, setPointsTarget] = useState<'single' | 'batch' | null>(null);
  const [currentTargetId, setCurrentTargetId] = useState<number | null>(null);
  const [pointsRequestId, setPointsRequestId] = useState('');
  const [isEditingPresets, setIsEditingPresets] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showPraiseModal, setShowPraiseModal] = useState(false);
  const [praiseTargetId, setPraiseTargetId] = useState<number | null>(null);

  const [showAIModal, setShowAIModal] = useState(false);
  const [aiTargetStudent, setAiTargetStudent] = useState<any>(null);
  const [aiAnalysisStage, setAiAnalysisStage] = useState(0);
  const [aiReport, setAiReport] = useState<any>(null);

  // Initialize selected class
  useEffect(() => {
    if (location.state && (location.state as any).classId) {
      setSelectedClassId((location.state as any).classId);
    } else if (classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [location, classes, selectedClassId]);

  useEffect(() => {
    setSelectedStudents([]);
  }, [selectedClassId]);

  /**
   * 最近表扬: re-read whenever the class changes, and after the praise modal sends one.
   *
   * Deliberately not a query hook: this page owns its fragments (students, groups, presets) through
   * the hooks layer and its class-scoped extras through effects, and the roll-up is one of the
   * extras. A failed read is a state of its own - 「还没有表扬记录」 would otherwise tell a teacher
   * that nobody in the class has ever been praised.
   */
  const loadPraises = async () => {
    if (!selectedClassId) {
      setPraises([]);
      return;
    }
    setPraisesLoading(true);
    setPraisesFailed(false);
    try {
      const data = await praisesApi.getClassPraises(selectedClassId);
      setPraises(data.success ? data.praises : []);
      setPraisesFailed(!data.success);
    } catch (error) {
      console.error('Failed to fetch class praises:', error);
      setPraisesFailed(true);
    } finally {
      setPraisesLoading(false);
    }
  };

  useEffect(() => {
    void loadPraises();
  }, [selectedClassId]);

  const triggerConfetti = () => {
    void launchConfetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const filteredStudents = students.filter(s => s.name.includes(search) || s.username.includes(search));
  const classAverage = students.length > 0
    ? (students.reduce((sum, student) => sum + student.total_points, 0) / students.length).toFixed(1)
    : '0.0';
  const classTotalPoints = students.reduce((sum, student) => sum + student.total_points, 0);

  const allGroups = [...groups, { id: 'ungrouped' as any, name: '未分组' }];
  const groupedStudentsWithEmpty = allGroups.map(group => ({
    groupId: group.id,
    groupName: group.name,
    students: filteredStudents.filter(s => {
      if (group.id === 'ungrouped') return !s.group_id && !s.group_name;
      return s.group_id === group.id || s.group_name === group.name;
    })
  }));

  const toggleSelectStudent = (id: number) => {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length) setSelectedStudents([]);
    else setSelectedStudents(filteredStudents.map(s => s.id));
  };

  const openPointsModal = (target: 'single' | 'batch', studentId: number | null = null) => {
    setPointsRequestId(crypto.randomUUID());
    setPointsTarget(target);
    setCurrentTargetId(studentId);
    setShowPointsModal(true);
  };

  const submitPoints = async (amount: number, reason: string) => {
    if (amount === 0) return;
    const finalReason = reason || (amount > 0 ? '表现优异加分' : '违规扣分');
    try {
      if (pointsTarget === 'single' && currentTargetId) {
        await addPointsMutation.mutateAsync({ studentId: currentTargetId, amount, reason: finalReason, requestId: pointsRequestId });
      } else if (pointsTarget === 'batch' && selectedStudents.length > 0) {
        await addBatchPointsMutation.mutateAsync({ studentIds: selectedStudents, amount, reason: finalReason, requestId: pointsRequestId });
        setSelectedStudents([]);
      } else return;
      setShowPointsModal(false);
      if (amount > 0) triggerConfetti();
    } catch {
      // The API layer displays the server message; keep the dialog and entered values.
    }
  };

  /**
   * One-tap ±1, the reference workbench's primary classroom gesture.
   *
   * It talks to the same two mutations the dialogs use, so the server contract, the replay
   * key and the cache invalidation are unchanged. The dialogs stay for custom reasons and
   * for presets; this is just the path a teacher takes ten times between two questions.
   */
  const quickScoreStudent = async (studentId: number, amount: 1 | -1) => {
    try {
      await addPointsMutation.mutateAsync({
        studentId,
        amount,
        reason: amount > 0 ? '课堂表现' : '课堂提醒',
        requestId: crypto.randomUUID(),
      });
      if (amount > 0) triggerConfetti();
    } catch {
      // The api layer already showed the server's sentence.
    }
  };

  const quickScoreSelected = async (amount: 1 | -1) => {
    if (selectedStudents.length === 0) {
      toast.info('先在左侧勾选学生，再批量加减分');
      return;
    }
    try {
      await addBatchPointsMutation.mutateAsync({
        studentIds: selectedStudents,
        amount,
        reason: amount > 0 ? '课堂表现' : '课堂提醒',
        requestId: crypto.randomUUID(),
      });
      setSelectedStudents([]);
      if (amount > 0) triggerConfetti();
    } catch {
      // Keep the selection so the teacher can retry without hunting for the same rows.
    }
  };

  /** Reveal the policy panel below the fold, used by the right rail's 积分策略 entry. */
  const openPolicy = () => {
    const panel = document.getElementById('class-policy');
    if (!panel) return;
    panel.setAttribute('open', '');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBatchEditSubmit = async (action: 'change_class' | 'change_group' | 'reset_password', value: string) => {
    if (selectedStudents.length === 0) return;
    try {
      await batchEditMutation.mutateAsync({ studentIds: selectedStudents, action, value });
      setSelectedStudents([]);
      setShowEditModal(false);
    } catch {
      // Keep the selected students and the entered value for correction or retry.
    }
  };

  const openPraiseModal = (studentId: number) => {
    setPraiseTargetId(studentId);
    setShowPraiseModal(true);
  };

  const openAIModal = (studentId: number) => {
    if (settings?.enable_teacher_analytics === '0') {
      toast.error('管理员暂未开放教师分析功能');
      return;
    }

    const student = students.find(s => s.id === studentId);
    if (!student) return;
    setAiTargetStudent(student);
    setShowAIModal(true);
    setAiAnalysisStage(0);
    setAiReport(null);

    setTimeout(() => setAiAnalysisStage(1), 800);
    setTimeout(() => setAiAnalysisStage(2), 1800);
    setTimeout(() => {
      studentRadarMutation.mutate(studentId);
    }, 2600);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const studentId = parseInt(active.id.toString().replace('student-', ''), 10);
    const targetGroupIdStr = over.id.toString().replace('group-', '');

    changeGroupMutation.mutate({ studentId, groupId: targetGroupIdStr });
  };

  // The page's primary action, registered with the command palette as well as the row.
  useRegisterPageCommands([
    {
      id: 'teacher-dashboard:add-student',
      label: '添加学生',
      icon: UserPlus,
      keywords: ['学生', '新增', '班级'],
      run: () => navigate('/teacher/add-student', { state: { classId: selectedClassId } }),
    },
  ]);

  return (
    <PageScaffold variant="dashboard">
      {/*
        First-run guidance. Rendered instead of the class workspace when the account has no
        class yet - an instance that has just been installed has exactly one superadmin and
        nothing else, so this is the first thing its owner sees. Everything the wizard does
        goes through the ordinary endpoints; nothing is seeded.
      */}
      {showFirstRun && <FirstRunWizard onFinish={dismissFirstRun} />}

      {!showFirstRun && (
        <div className="space-y-5">
          {/* class + search toolbar ------------------------------------------------ */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 whitespace-nowrap text-caption text-fg-3">
                当前班级
                <Select
                  value={selectedClassId ?? ''}
                  onChange={(event) => setSelectedClassId(Number(event.target.value))}
                  data-tour="teacher-class-tabs"
                  className="h-9 w-44"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </Select>
              </label>
              <Button variant="ghost" size="sm" onClick={() => setShowAddClass(true)}>
                <PlusCircle aria-hidden="true" />
                新建班级
              </Button>

              {selectedClassId ? (
                <>
                  <span className="hidden h-5 w-px bg-line-1 sm:block" aria-hidden="true" />
                  <span className="text-caption text-fg-3">小组</span>
                  {groups.map((group) => (
                    <span
                      key={group.id}
                      className="inline-flex h-7 items-center rounded-pill border border-line-1 bg-surface-2 px-2.5 text-caption font-medium text-fg-2"
                    >
                      {group.name}
                    </span>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setShowAddGroup(true)}>
                    <PlusCircle aria-hidden="true" />
                    新建小组
                  </Button>
                </>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-64">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3"
                />
                <Input
                  type="text"
                  data-tour="teacher-search"
                  className="h-9 pl-9"
                  placeholder="搜索学生姓名或账号"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                data-tour="teacher-add-student"
                onClick={() => navigate('/teacher/add-student', { state: { classId: selectedClassId } })}
              >
                <UserPlus aria-hidden="true" />
                添加学生
              </Button>
              {filteredStudents.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="hidden sm:inline-flex">
                  {selectedStudents.length === filteredStudents.length ? (
                    <CheckSquare aria-hidden="true" />
                  ) : (
                    <Square aria-hidden="true" />
                  )}
                  {selectedStudents.length === filteredStudents.length ? '取消全选' : '全选'}
                </Button>
              ) : null}
            </div>
          </div>

          {/* class figures ------------------------------------------------------- */}
          {selectedClassId ? (
            <KpiStrip
              items={[
                { label: '小组数量', value: groups.length, icon: UsersRound, tone: 'role' },
                { label: '学生总数', value: students.length, icon: Users, tone: 'info' },
                { label: '人均成长值', value: classAverage, icon: Award, tone: 'success' },
                { label: '班级总积分', value: classTotalPoints, icon: Activity, tone: 'warning' },
              ]}
            />
          ) : (
            <Card className="items-center px-6 py-10 text-center">
              <p className="text-section-title text-fg-1">先创建一个班级</p>
              <p className="mt-1 text-body-sm text-fg-3">班级创建后，学生、小组和课堂评分都会出现在这里。</p>
              <Button className="mt-4" onClick={() => setShowAddClass(true)}>
                <PlusCircle aria-hidden="true" />
                创建班级
              </Button>
            </Card>
          )}

          {/* workspace ---------------------------------------------------------- */}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              {selectedStudents.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-card border border-role/20 bg-role-soft/50 px-3 py-2">
                  <span className="text-body-sm font-medium text-role-ink">
                    已选 {selectedStudents.length} 人
                  </span>
                  <Button size="sm" variant="outline" onClick={() => openPointsModal('batch')}>
                    批量评分
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowEditModal(true)}>
                    批量修改
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedStudents([])}>
                    取消选择
                  </Button>
                </div>
              ) : null}

              {loadingStudents ? (
                <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="正在加载学生名单">
                  {[0, 1].map((index) => (
                    <div key={index} className="rounded-card border border-line-1 bg-surface-2 p-4">
                      <Skeleton className="h-5 w-32" />
                      <div className="mt-4 space-y-2">
                        {[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-12 w-full" />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : studentsFailed ? (
                <Card className="items-center px-6 py-10 text-center">
                  <p className="font-semibold text-danger">学生名单没有加载出来</p>
                  <p className="mt-1 text-body-sm text-fg-3">这不代表班级是空的。请重试后再决定是否添加学生。</p>
                  <Button variant="outline" className="mt-4" onClick={() => void refetchStudents()}>
                    重新加载
                  </Button>
                </Card>
              ) : (
                <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCorners}>
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    {groupedStudentsWithEmpty.map(({ groupId, groupName, students: groupStudents }, index) => {
                      const groupAverage = groupStudents.length > 0
                        ? (groupStudents.reduce((sum, student) => sum + student.total_points, 0) / groupStudents.length).toFixed(1)
                        : '0.0';

                      return (groupId !== 'ungrouped' || groupStudents.length > 0) && (
                        <DroppableGroup
                          key={groupId}
                          groupId={groupId}
                          groupName={groupName}
                          count={groupStudents.length}
                          average={groupAverage}
                          index={index}
                        >
                          {groupStudents.map((student) => (
                            <DraggableStudent
                              key={student.id}
                              student={student as any}
                              selectedStudents={selectedStudents}
                              toggleSelectStudent={toggleSelectStudent}
                              openPointsModal={openPointsModal}
                              openPraiseModal={openPraiseModal}
                              openAIModal={openAIModal}
                              onQuickScore={quickScoreStudent}
                            />
                          ))}
                          {groupStudents.length === 0 && (
                            <div className="flex min-h-16 items-center justify-center rounded-card border border-dashed border-line-1 text-body-sm text-fg-3">
                              拖拽学生到这里
                            </div>
                          )}
                        </DroppableGroup>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <div className="col-span-full rounded-card border border-dashed border-line-1 bg-surface-2 px-6 py-10 text-center">
                        {search ? (
                          <p className="text-body text-fg-3">没有匹配的学生，请调整搜索词。</p>
                        ) : (
                          <>
                            <p className="text-body font-medium text-fg-2">班级还没有学生</p>
                            <p className="mt-1 text-body-sm text-fg-3">点击「添加学生」开始建立名单。</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </DndContext>
              )}
            </div>

            {/* right rail ------------------------------------------------------ */}
            <aside className="space-y-4" aria-label="课堂操作">
              <Card>
                <CardHeader className="border-b border-line-1 pb-3">
                  <CardTitle>课堂评分</CardTitle>
                  <CardDescription>勾选左侧学生，一次给多人加减分</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => void quickScoreSelected(1)}
                      disabled={selectedStudents.length === 0 || addBatchPointsMutation.isPending}
                    >
                      <Plus aria-hidden="true" />
                      加 1 分
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void quickScoreSelected(-1)}
                      disabled={selectedStudents.length === 0 || addBatchPointsMutation.isPending}
                    >
                      <Minus aria-hidden="true" />
                      减 1 分
                    </Button>
                  </div>
                  <p className="rounded-card bg-surface-3/60 px-3 py-2 text-caption text-fg-3">
                    {selectedStudents.length > 0
                      ? `已选 ${selectedStudents.length} 人；点 ±1 直接记录课堂表现`
                      : '先在左侧勾选学生，再批量加减分'}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowEditModal(true)}
                    disabled={selectedStudents.length === 0}
                  >
                    <Edit2 aria-hidden="true" />
                    批量修改
                  </Button>
                </CardContent>
              </Card>

              <SectionCard title="课堂工具" description="常用的课堂小工具">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: '随机点名',
                      icon: Dice5,
                      onClick: () => {
                        setShowTools(true);
                        requestAnimationFrame(() => {
                          document.getElementById('classroom-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                      },
                    },
                    {
                      label: '倒计时',
                      icon: Timer,
                      onClick: () => {
                        setShowTools(true);
                        requestAnimationFrame(() => {
                          document.getElementById('classroom-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                      },
                    },
                    { label: '分组调整', icon: UsersRound, onClick: () => setShowAddGroup(true) },
                    { label: '课堂记录', icon: ClipboardList, onClick: () => navigate('/teacher/records') },
                  ].map((tool) => (
                    <Button
                      key={tool.label}
                      variant="outline"
                      onClick={tool.onClick}
                      className="h-auto flex-col items-start gap-1.5 px-3 py-3 text-left"
                    >
                      <tool.icon aria-hidden="true" className="size-4 text-fg-3" />
                      <span className="text-body-sm font-medium text-fg-1">{tool.label}</span>
                    </Button>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="功能设置" description="班级范围">
                <div className="divide-y divide-line-2">
                  {[
                    { label: '功能开关', description: '控制学生能看到哪些玩法', icon: Settings2, onClick: () => navigate('/teacher/features') },
                    { label: '积分策略', description: '评分预设与家长增益', icon: Award, onClick: openPolicy },
                    { label: '学情分析', description: '班级与学生的数据看板', icon: Activity, onClick: () => navigate('/teacher/analysis') },
                  ].map((item) => (
                    <Button
                      key={item.label}
                      variant="ghost"
                      onClick={item.onClick}
                      className="h-auto w-full justify-between gap-2 rounded-none px-0 py-2.5 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <item.icon aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
                        <span className="min-w-0">
                          <span className="block text-body-sm font-medium text-fg-1">{item.label}</span>
                          <span className="mt-0.5 block whitespace-normal text-caption text-fg-3">{item.description}</span>
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
                    </Button>
                  ))}
                </div>
              </SectionCard>
            </aside>
          </div>

          {showTools && (
            <div id="classroom-tools" className="scroll-mt-24" data-tour="teacher-tools-panel">
              <SectionCard
                title="课堂工具"
                description="随机点名与课堂倒计时"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => setShowTools(false)}>
                    收起
                  </Button>
                }
              >
                <ClassroomTools students={filteredStudents} />
              </SectionCard>
            </div>
          )}

          {/* recent praise ------------------------------------------------------ */}
          {selectedClassId ? (
            <SectionCard
              title="最近表扬"
              description="这个班收到过的表扬，最新的在上面"
              actions={
                <Button variant="outline" size="sm" onClick={() => navigate('/teacher/features')}>
                  班级功能
                </Button>
              }
            >
              {praisesLoading ? (
                <p className="py-4 text-body-sm text-fg-3">正在加载表扬记录...</p>
              ) : praisesFailed ? (
                <div className="rounded-card border border-danger/20 bg-danger-soft px-4 py-6 text-center">
                  <p className="font-semibold text-danger">表扬记录没有加载出来</p>
                  <p className="mt-1 text-body-sm text-fg-3">这不代表这个班没有被表扬过，请重试。</p>
                  <Button variant="outline" className="mt-3" onClick={() => void loadPraises()}>
                    重新加载
                  </Button>
                </div>
              ) : praises.length === 0 ? (
                <p className="text-body-sm text-fg-3">还没有表扬记录。点学生卡片上的「表扬」写下第一条。</p>
              ) : (
                <ul className="space-y-2">
                  {praises.slice(0, 5).map((praise) => (
                    <li
                      key={praise.id}
                      className="flex items-start justify-between gap-4 rounded-card border border-line-1 bg-surface-3/40 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-body font-semibold text-fg-1">
                          {praise.student_name || `学生 #${praise.student_id}`}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-body-sm text-fg-2">{praise.content}</p>
                      </div>
                      <span className="shrink-0 text-caption text-fg-3">{String(praise.created_at ?? '').slice(0, 10)}</span>
                    </li>
                  ))}
                  {praises.length > 5 ? (
                    <li className="text-caption text-fg-3">共 {praises.length} 条，只显示最近 5 条。</li>
                  ) : null}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {/* strategy + feature settings ---------------------------------------- */}
          {selectedClassId ? (
            <details id="class-policy" className="scroll-mt-24 rounded-card border border-line-1 bg-surface-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-body font-semibold text-fg-1 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <Settings2 aria-hidden="true" className="size-4 text-fg-3" />
                  班级策略与功能设置
                </span>
                <ChevronDown aria-hidden="true" className="size-4 text-fg-3" />
              </summary>
              <div className="space-y-4 border-t border-line-1 p-4">
                <IncentivePolicyPanel classId={selectedClassId} />
                <ClassFeaturePanel classId={selectedClassId} compact />
                <Button variant="outline" onClick={() => navigate('/teacher/features')}>
                  进入完整功能控制台
                </Button>
              </div>
            </details>
          ) : null}
        </div>
      )}

      {/* Modals. Scoped to the dashboard, not the wizard: they act on a class that has to exist. */}
      <CreateClassModal
        isOpen={showAddClass}
        onClose={() => setShowAddClass(false)}
        onSubmit={(name) => createClassMutation.mutate(name)}
        submitting={createClassMutation.isPending}
      />
      <CreateGroupModal
        isOpen={showAddGroup}
        onClose={() => setShowAddGroup(false)}
        onSubmit={(name) => createGroupMutation.mutate(name)}
        submitting={createGroupMutation.isPending}
      />
      <PointsModal
        isOpen={showPointsModal}
        onClose={() => setShowPointsModal(false)}
        targetCount={pointsTarget === 'batch' ? selectedStudents.length : 1}
        presets={presets}
        isEditingPresets={isEditingPresets}
        setIsEditingPresets={setIsEditingPresets}
        onAddPreset={(label, amount) => createPresetMutation.mutate({ label, amount })}
        onDeletePreset={(id) => {
          deletePresetMutation.mutate(id);
        }}
        onSubmitPoints={submitPoints}
        submitting={addPointsMutation.isPending || addBatchPointsMutation.isPending}
      />
      <EditStudentsModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        targetCount={selectedStudents.length}
        classes={classes}
        groups={groups as any}
        onSubmit={handleBatchEditSubmit}
        submitting={batchEditMutation.isPending}
      />
      <PraiseModal
        isOpen={showPraiseModal}
        onClose={() => setShowPraiseModal(false)}
        onSubmit={(content, color) => praiseTargetId && praiseMutation.mutate({ studentId: praiseTargetId, content, color })}
        submitting={praiseMutation.isPending}
      />
      <AIRadarModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        student={aiTargetStudent}
        stage={aiAnalysisStage}
        report={aiReport}
      />
    </PageScaffold>
  );
}
