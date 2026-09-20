import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, UserPlus, Users, PlusCircle, CheckSquare, Square, Edit2, Dice5 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

import { PointsModal } from '@/pages/Teacher/components/PointsModal';
import { CreateClassModal } from '@/pages/Teacher/components/CreateClassModal';
import { CreateGroupModal } from '@/pages/Teacher/components/CreateGroupModal';
import { PraiseModal } from '@/pages/Teacher/components/PraiseModal';
import { EditStudentsModal } from '@/pages/Teacher/components/EditStudentsModal';
import { AIRadarModal } from '@/pages/Teacher/components/AIRadarModal';
import ClassFeaturePanel from '@/pages/Teacher/components/ClassFeaturePanel';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);

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
    changeClassMutation,
    resetPasswordMutation,
  } = useStudentMutations(selectedClassId);

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
  const classAverage = filteredStudents.length > 0 
    ? (filteredStudents.reduce((sum, student) => sum + student.total_points, 0) / filteredStudents.length).toFixed(1) 
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
    setPointsTarget(target);
    setCurrentTargetId(studentId);
    setShowPointsModal(true);
  };

  const submitPoints = (amount: number, reason: string) => {
    if (amount === 0) return;
    const finalReason = reason || (amount > 0 ? '表现优异加分' : '违规扣分');
    
    if (pointsTarget === 'single' && currentTargetId) {
      addPointsMutation.mutate({ studentId: currentTargetId, amount, reason: finalReason });
      if (amount > 0) triggerConfetti();
    } else if (pointsTarget === 'batch' && selectedStudents.length > 0) {
      addBatchPointsMutation.mutate({ studentIds: selectedStudents, amount, reason: finalReason });
      if (amount > 0) triggerConfetti();
      setSelectedStudents([]);
    }
    setShowPointsModal(false);
  };

  const handleBatchEditSubmit = (action: 'change_class' | 'change_group' | 'reset_password', value: string) => {
    if (selectedStudents.length === 0) return;
    
    const promises = selectedStudents.map(studentId => {
      if (action === 'change_class') return changeClassMutation.mutateAsync({ studentId, newClassId: parseInt(value) });
      if (action === 'change_group') return changeGroupMutation.mutateAsync({ studentId, groupId: value });
      if (action === 'reset_password') return resetPasswordMutation.mutateAsync({ studentId, newPassword: value });
      return Promise.resolve();
    });

    Promise.all(promises).then(() => {
      setSelectedStudents([]);
      setShowEditModal(false);
    });
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

  return (
    <div className="space-y-6">
      {/* Class Tabs */}
      <div className="flex flex-col space-y-3 pb-2">
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
          <span className="text-sm font-bold text-ink-3 mr-2 flex-shrink-0">班级:</span>
          {classes.map((cls) => (
            <Button variant="ghost"
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedClassId === cls.id
                  ? 'bg-gradient-to-r from-primary to-cyan-500 text-white shadow-card'
                  : 'bg-paper/80 backdrop-blur-xl text-ink-2 border border-border hover:bg-muted/60'
              }`}
            >
              {cls.name}
            </Button>
          ))}
          <Button variant="ghost"
            onClick={() => setShowAddClass(true)}
            className="flex-shrink-0 flex items-center px-4 py-2 rounded-full text-sm font-medium bg-paper/80 backdrop-blur-xl text-primary border border-primary/20 hover:bg-primary/5 transition-colors border-dashed"
          >
            <PlusCircle className="h-4 w-4 mr-1" />
            新建班级
          </Button>
        </div>

        {selectedClassId && (
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide pt-1">
            <span className="text-sm font-bold text-ink-3 mr-2 flex-shrink-0">小组:</span>
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex-shrink-0 px-3 py-1.5 rounded-card text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100"
              >
                {group.name}
              </div>
            ))}
            <Button variant="ghost"
              onClick={() => setShowAddGroup(true)}
              className="flex-shrink-0 flex items-center px-3 py-1.5 rounded-card text-sm font-medium bg-paper/80 backdrop-blur-xl text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors border-dashed"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1" />
              新建小组
            </Button>
          </div>
        )}
      </div>

      {selectedClassId && (
        <div className="rounded-card border border-white/60 bg-paper/80 p-5 shadow-card backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink-1">课堂功能控制</h2>
              <p className="text-sm text-ink-3">当前班级的 19 项课堂能力会实时同步到学生端、家长端与接口兜底校验</p>
            </div>
            <Button variant="ghost"
              onClick={() => navigate('/teacher/features')}
              className="rounded-card bg-muted px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-slate-200"
            >
              进入完整控制台
            </Button>
          </div>
          <ClassFeaturePanel classId={selectedClassId} compact />
        </div>
      )}

      {/* Top Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-paper/80 backdrop-blur-xl p-4 rounded-card shadow-card border border-white/60 gap-4 sm:gap-0">
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-ink-3" />
            </div>
            <Input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-input rounded-card leading-5 bg-muted/50 placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring sm:text-sm"
              placeholder="搜索学生姓名或账号..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {selectedClassId && (
            <>
              <div className="hidden sm:flex items-center px-3 py-1.5 bg-primary/5 border border-success/20 rounded-card">
                <span className="text-xs text-primary font-medium mr-2">班级均分:</span>
                <span className="text-sm font-bold text-primary">{classAverage} 分</span>
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <Button variant="ghost"
            onClick={() => setShowTools(!showTools)}
            className="flex items-center px-3 py-1.5 bg-accent/60 text-accent-foreground rounded-card hover:bg-accent transition-colors font-medium text-sm"
          >
            <Dice5 className="h-4 w-4 mr-1" />
            课堂工具
          </Button>
          {filteredStudents.length > 0 && (
            <Button variant="link" onClick={toggleSelectAll} className="flex items-center text-sm text-ink-2 hover:text-primary">
              {selectedStudents.length === filteredStudents.length ? <CheckSquare className="h-5 w-5 mr-1 text-primary" /> : <Square className="h-5 w-5 mr-1" />}
              全选
            </Button>
          )}
          {selectedStudents.length > 0 && (
            <Button variant="ghost" onClick={() => openPointsModal('batch')} className="flex items-center px-3 py-1.5 bg-warning/20 text-orange-700 rounded-card hover:bg-orange-200 transition-colors font-medium text-sm">
              <Users className="h-4 w-4 mr-1" />
              批量评分 ({selectedStudents.length})
            </Button>
          )}
          {selectedStudents.length > 0 && (
            <Button variant="ghost" onClick={() => setShowEditModal(true)} className="flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded-card hover:bg-blue-200 transition-colors font-medium text-sm">
              <Edit2 className="h-4 w-4 mr-1" />
              批量修改 ({selectedStudents.length})
            </Button>
          )}
          <Button variant="ghost"
            onClick={() => navigate('/teacher/add-student', { state: { classId: selectedClassId } })}
            className="w-full sm:w-auto flex justify-center items-center px-4 py-2 bg-gradient-to-r from-primary to-cyan-500 text-white rounded-card shadow-card font-medium"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            添加学生
          </Button>
        </div>
      </div>

      {showTools && <ClassroomTools students={filteredStudents} />}

      {/* Student Grid */}
      {loadingStudents ? (
        <div className="text-center py-12 text-ink-3">加载中...</div>
      ) : (
        <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCorners}>
          <div className="space-y-8">
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
                    <div className="col-span-full flex items-center justify-center h-24 border-2 border-dashed border-border rounded-card text-ink-3 text-sm">
                      拖拽学生到这里
                    </div>
                  )}
                </DroppableGroup>
              )
            })}
            {filteredStudents.length === 0 && (
              <div className="col-span-full text-center py-12 text-ink-3 bg-paper/80 backdrop-blur-xl rounded-card border border-dashed border-input">
                未找到学生信息
              </div>
            )}
          </div>
        </DndContext>
      )}

      {/* Modals */}
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
        submitting={changeClassMutation.isPending || changeGroupMutation.isPending || resetPasswordMutation.isPending}
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
    </div>
  );
}
