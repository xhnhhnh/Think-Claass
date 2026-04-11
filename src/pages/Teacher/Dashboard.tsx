import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, UserPlus, Users, PlusCircle, CheckSquare, Square, Edit2, Dice5 } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, closestCorners } from '@dnd-kit/core';
import { DroppableGroup } from './components/DroppableGroup';
import { DraggableStudent } from './components/DraggableStudent';
import { ClassroomTools } from './components/ClassroomTools';

import { useClasses } from '@/hooks/queries/useClasses';
import { useStudents } from '@/hooks/queries/useStudents';
import { useGroups } from '@/hooks/queries/useGroups';
import { usePresets } from '@/hooks/queries/usePresets';
import { useStudentMutations } from '@/hooks/queries/useStudentMutations';
import { useSettings } from '@/hooks/queries/useSettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherApi } from '@/api/teacher';
import { analyticsApi } from '@/api/analytics';
import { useStore } from '@/store/useStore';

import { PointsModal } from './components/PointsModal';
import { CreateClassModal } from './components/CreateClassModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { PraiseModal } from './components/PraiseModal';
import { EditStudentsModal } from './components/EditStudentsModal';
import { AIRadarModal } from './components/AIRadarModal';
import ClassFeaturePanel from './components/ClassFeaturePanel';

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
    import('canvas-confetti').then((confetti) => {
      confetti.default({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    });
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
          <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">班级:</span>
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedClassId === cls.id
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                  : 'bg-white/80 backdrop-blur-xl text-slate-600 border border-gray-200 hover:bg-slate-50/50'
              }`}
            >
              {cls.name}
            </button>
          ))}
          <button
            onClick={() => setShowAddClass(true)}
            className="flex-shrink-0 flex items-center px-4 py-2 rounded-full text-sm font-medium bg-white/80 backdrop-blur-xl text-indigo-600 border border-indigo-200/50 hover:bg-indigo-50/50 transition-colors border-dashed"
          >
            <PlusCircle className="h-4 w-4 mr-1" />
            新建班级
          </button>
        </div>

        {selectedClassId && (
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide pt-1">
            <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">小组:</span>
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex-shrink-0 px-3 py-1.5 rounded-2xl text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100"
              >
                {group.name}
              </div>
            ))}
            <button
              onClick={() => setShowAddGroup(true)}
              className="flex-shrink-0 flex items-center px-3 py-1.5 rounded-2xl text-sm font-medium bg-white/80 backdrop-blur-xl text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors border-dashed"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1" />
              新建小组
            </button>
          </div>
        )}
      </div>

      {selectedClassId && (
        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">课堂功能控制</h2>
              <p className="text-sm text-slate-500">当前班级的 19 项课堂能力会实时同步到学生端、家长端与接口兜底校验</p>
            </div>
            <button
              onClick={() => navigate('/teacher/features')}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              进入完整控制台
            </button>
          </div>
          <ClassFeaturePanel classId={selectedClassId} compact />
        </div>
      )}

      {/* Top Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 gap-4 sm:gap-0">
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-slate-50/50 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
              placeholder="搜索学生姓名或账号..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {selectedClassId && (
            <>
              <div className="hidden sm:flex items-center px-3 py-1.5 bg-indigo-50/50 border border-green-100 rounded-2xl">
                <span className="text-xs text-indigo-500 font-medium mr-2">班级均分:</span>
                <span className="text-sm font-bold text-indigo-700">{classAverage} 分</span>
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={() => setShowTools(!showTools)}
            className="flex items-center px-3 py-1.5 bg-purple-100 text-purple-700 rounded-2xl hover:bg-purple-200 transition-colors font-medium text-sm"
          >
            <Dice5 className="h-4 w-4 mr-1" />
            课堂工具
          </button>
          {filteredStudents.length > 0 && (
            <button onClick={toggleSelectAll} className="flex items-center text-sm text-slate-600 hover:text-indigo-600">
              {selectedStudents.length === filteredStudents.length ? <CheckSquare className="h-5 w-5 mr-1 text-indigo-500" /> : <Square className="h-5 w-5 mr-1" />}
              全选
            </button>
          )}
          {selectedStudents.length > 0 && (
            <button onClick={() => openPointsModal('batch')} className="flex items-center px-3 py-1.5 bg-orange-100 text-orange-700 rounded-2xl hover:bg-orange-200 transition-colors font-medium text-sm">
              <Users className="h-4 w-4 mr-1" />
              批量评分 ({selectedStudents.length})
            </button>
          )}
          {selectedStudents.length > 0 && (
            <button onClick={() => setShowEditModal(true)} className="flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded-2xl hover:bg-blue-200 transition-colors font-medium text-sm">
              <Edit2 className="h-4 w-4 mr-1" />
              批量修改 ({selectedStudents.length})
            </button>
          )}
          <button
            onClick={() => navigate('/teacher/add-student', { state: { classId: selectedClassId } })}
            className="w-full sm:w-auto flex justify-center items-center px-4 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            添加学生
          </button>
        </div>
      </div>

      {showTools && <ClassroomTools students={filteredStudents} />}

      {/* Student Grid */}
      {loadingStudents ? (
        <div className="text-center py-12 text-slate-500">加载中...</div>
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
                    <div className="col-span-full flex items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm">
                      拖拽学生到这里
                    </div>
                  )}
                </DroppableGroup>
              )
            })}
            {filteredStudents.length === 0 && (
              <div className="col-span-full text-center py-12 text-slate-500 bg-white/80 backdrop-blur-xl rounded-2xl border border-dashed border-gray-300">
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
