import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, UserPlus, Users, PlusCircle, CheckSquare, Square, Edit2, Dice5 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
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

  // Queries
  const { data: classes = [] } = useClasses();
  const { data: students = [], isLoading: loadingStudents } = useStudents(selectedClassId);
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
      toast.error('AI 学情摘要生成失败，请稍后重试');
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

  const triggerConfetti = () => {
    void launchConfetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const filteredStudents = students.filter(s => s.name.includes(search) || s.username.includes(search));
  const classAverage = students.length > 0
    ? (students.reduce((sum, student) => sum + student.total_points, 0) / students.length).toFixed(1)
    : '0.0';

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
        First-run guidance. Rendered instead of the (empty) class tabs when the account has no
        class yet - an instance that has just been installed has exactly one superadmin and nothing
        else, so this is the first thing its owner sees. Everything the wizard does goes through the
        ordinary endpoints; nothing is seeded. It disappears as soon as a class exists, and can be
        dismissed for this browser.
      */}
      {showFirstRun && <FirstRunWizard onFinish={dismissFirstRun} />}

      {!showFirstRun && (
        <>
      <div className="rounded-panel border border-line-1 bg-surface-2 p-5 shadow-card">
        <p className="text-sm text-fg-3">选择班级 · 管理小组 · 课堂评分</p>
        <h2 className="mt-1 text-xl font-semibold text-fg-1">让每个孩子的进步都被看见</h2>
      </div>
      {/* Class Tabs */}
      <div data-tour="teacher-class-tabs" className="flex flex-col gap-3 rounded-panel border border-line-1 bg-surface-2 p-4 shadow-card sm:flex-row sm:items-center">
        <label className="flex items-center gap-3 text-sm font-medium text-fg-2">当前班级
          <Select value={selectedClassId ?? ''} onChange={(event) => setSelectedClassId(Number(event.target.value))} className="min-w-44 rounded-card border border-line-1 bg-surface-2 px-3 py-2 text-fg-1">
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
          </Select>
        </label>
        <Button variant="outline" onClick={() => setShowAddClass(true)}><PlusCircle className="mr-1 size-4" />新建班级</Button>

        {selectedClassId && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide sm:ml-auto">
            <span className="flex-shrink-0 text-sm font-medium text-fg-3">小组</span>
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex-shrink-0 px-3 py-1.5 rounded-card text-sm font-medium bg-info-soft text-info-ink border border-info/30"
              >
                {group.name}
              </div>
            ))}
            <Button variant="ghost"
              onClick={() => setShowAddGroup(true)}
              className="flex-shrink-0 flex items-center px-3 py-1.5 rounded-card text-sm font-medium bg-surface-2/80 backdrop-blur-xl text-info border border-info/30 hover:bg-info-soft transition-colors border-dashed"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1" />
              新建小组
            </Button>
          </div>
        )}
      </div>

      {selectedClassId && <div className="grid grid-cols-2 gap-3 rounded-panel border border-line-1 bg-surface-2 p-4 shadow-card sm:grid-cols-4">
        <div><p className="text-sm text-fg-3">小组数量</p><p className="text-2xl font-semibold text-fg-1">{groups.length}</p></div>
        <div><p className="text-sm text-fg-3">学生总数</p><p className="text-2xl font-semibold text-fg-1">{students.length}</p></div>
        <div><p className="text-sm text-fg-3">人均成长值</p><p className="text-2xl font-semibold text-fg-1">{classAverage}</p></div>
        <div><p className="text-sm text-fg-3">今日课堂</p><p className="mt-1 font-medium text-success">继续加油！</p></div>
      </div>}

      {/* Top Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-2/80 backdrop-blur-xl p-4 rounded-card shadow-card border border-line-1 gap-4 sm:gap-0">
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="size-5 text-fg-3" />
            </div>
            <Input
              type="text"
              data-tour="teacher-search"
              className="pl-10"
              placeholder="搜索学生姓名或账号..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {selectedClassId && (
            <>
              <span className="sr-only">班级人均成长值 {classAverage}</span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <Button variant="ghost"
            onClick={() => setShowTools(!showTools)}
            data-tour="teacher-tools-toggle"
            className="flex items-center px-3 py-1.5 bg-role-soft/60 text-role-ink rounded-card hover:bg-role-soft transition-colors font-medium text-sm"
          >
            <Dice5 className="h-4 w-4 mr-1" />
            课堂工具
          </Button>
          {filteredStudents.length > 0 && (
            <Button variant="link" onClick={toggleSelectAll} className="flex items-center text-sm text-fg-2 hover:text-role">
              {selectedStudents.length === filteredStudents.length ? <CheckSquare className="h-5 w-5 mr-1 text-role" /> : <Square className="h-5 w-5 mr-1" />}
              全选
            </Button>
          )}
          {selectedStudents.length > 0 && (
            <Button variant="ghost" onClick={() => openPointsModal('batch')} className="flex items-center px-3 py-1.5 bg-warning-soft text-warning-ink rounded-card hover:bg-warning/20 transition-colors font-medium text-sm">
              <Users className="h-4 w-4 mr-1" />
              批量评分 ({selectedStudents.length})
            </Button>
          )}
          {selectedStudents.length > 0 && (
            <Button variant="ghost" onClick={() => setShowEditModal(true)} className="flex items-center px-3 py-1.5 bg-info-soft text-info-ink rounded-card hover:bg-info/20 transition-colors font-medium text-sm">
              <Edit2 className="h-4 w-4 mr-1" />
              批量修改 ({selectedStudents.length})
            </Button>
          )}
          <Button variant="ghost"
            onClick={() => navigate('/teacher/add-student', { state: { classId: selectedClassId } })}
            data-tour="teacher-add-student"
            className="w-full sm:w-auto flex justify-center items-center px-4 py-2 bg-gradient-to-r from-role to-role-ink text-role-contrast rounded-card shadow-card font-medium"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            添加学生
          </Button>
        </div>
      </div>

      {showTools && (
        <div data-tour="teacher-tools-panel">
          <ClassroomTools students={filteredStudents} />
        </div>
      )}

      {/* Student Grid */}
      {loadingStudents ? (
        <div className="rounded-panel border border-line-1 bg-surface-2 py-12 text-center text-fg-3">正在加载学生名单…</div>
      ) : (
        <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCorners}>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {groupedStudentsWithEmpty.map(({ groupId, groupName, students: groupStudents }) => {
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
                    />
                  ))}
                  {groupStudents.length === 0 && (
                    <div className="col-span-full flex items-center justify-center h-24 border-2 border-dashed border-line-1 rounded-card text-fg-3 text-sm">
                      拖拽学生到这里
                    </div>
                  )}
                </DroppableGroup>
              )
            })}
            {filteredStudents.length === 0 && (
              <div className="col-span-full text-center py-12 text-fg-3 bg-surface-2/80 backdrop-blur-xl rounded-card border border-dashed border-line-1">
                {search ? '没有匹配的学生，请调整搜索词。' : '班级还没有学生，点击“添加学生”开始。'}
              </div>
            )}
          </div>
        </DndContext>
      )}

      {selectedClassId && <details className="rounded-panel border border-line-1 bg-surface-2 p-5 shadow-card">
        <summary className="cursor-pointer font-semibold text-fg-1">班级策略与功能设置</summary>
        <div className="mt-4 space-y-4">
          <IncentivePolicyPanel classId={selectedClassId} />
          <ClassFeaturePanel classId={selectedClassId} compact />
          <Button variant="outline" onClick={() => navigate('/teacher/features')}>进入完整功能控制台</Button>
        </div>
      </details>}

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
        </>
      )}
    </PageScaffold>
  );
}
