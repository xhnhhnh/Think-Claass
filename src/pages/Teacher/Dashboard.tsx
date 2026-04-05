import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Search, UserPlus, Users, PlusCircle, XCircle, CheckSquare, Square, Edit2, Trash2, GripHorizontal, Dice5, Timer, Star, BrainCircuit } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { DndContext, DragEndEvent, closestCorners } from '@dnd-kit/core';
import { DroppableGroup } from './components/DroppableGroup';
import { DraggableStudent } from './components/DraggableStudent';
import { ClassroomTools } from './components/ClassroomTools';

interface Student {
  id: number;
  user_id: number;
  class_id: number;
  username: string;
  name: string;
  total_points: number;
  available_points: number;
}

interface ClassItem {
  id: number;
  name: string;
  invite_code: string;
}

interface Preset {
  id: number;
  label: string;
  amount: number;
}



export default function TeacherDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);

  // Checkbox state for batch operations
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  
  // Points Modal State
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [pointsTarget, setPointsTarget] = useState<'single' | 'batch' | null>(null);
  const [currentTargetId, setCurrentTargetId] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [submittingPoints, setSubmittingPoints] = useState(false);

  // Presets State
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isEditingPresets, setIsEditingPresets] = useState(false);
  const [newPresetLabel, setNewPresetLabel] = useState('');
  const [newPresetAmount, setNewPresetAmount] = useState('');

  // Edit Students Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAction, setEditAction] = useState<'change_class' | 'reset_password' | 'change_group'>('change_class');
  const [editValue, setEditValue] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Groups State
  const [groups, setGroups] = useState<{id: number, name: string}[]>([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Classroom Tools
  const [showTools, setShowTools] = useState(false);

  const triggerConfetti = () => {
    import('canvas-confetti').then((confetti) => {
      confetti.default({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    });
  };

  // Initialize selected class from navigation state if available
  useEffect(() => {
    if (location.state && (location.state as any).classId) {
      setSelectedClassId((location.state as any).classId);
    }
  }, [location]);

  const fetchClasses = async () => {
    try {
      const data = await apiGet<any>('/api/classes');
      setClasses(data.classes);
      if (data.classes.length > 0 && !selectedClassId && !(location.state as any)?.classId) {
        setSelectedClassId(data.classes[0].id);
      }
    } catch (err) {
      // handled by api wrapper
    }
  };

  const fetchStudents = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const data = await apiGet<any>(`/api/students?classId=${selectedClassId}`);
      setStudents(data.students);
      setSelectedStudents([]); // Reset selection when class changes
    } catch (err) {
      // handled by api wrapper
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    if (!selectedClassId) return;
    try {
      const data = await apiGet<any>(`/api/groups?classId=${selectedClassId}`);
      setGroups(data.groups);
    } catch (err) {
      // handled by api wrapper
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const data = await apiGet<any>('/api/presets');
      setPresets(data.presets);
    } catch (err) {
      // handled by api wrapper
    }
  };

  const handleAddPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetLabel.trim() || !newPresetAmount) return;

    try {
      const data = await apiPost<any>('/api/presets', { label: newPresetLabel.trim(), amount: parseInt(newPresetAmount, 10) });
      setPresets([...presets, data.preset]);
      setNewPresetLabel('');
      setNewPresetAmount('');
    } catch (err) {
      // handled by api wrapper
    }
  };

  const handleDeletePreset = async (id: number) => {
    try {
      await apiDelete(`/api/presets/${id}`);
      setPresets(presets.filter(p => p.id !== id));
    } catch (err) {
      // handled by api wrapper
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents();
      fetchGroups();
    }
  }, [selectedClassId]);

  const filteredStudents = students.filter(s => s.name.includes(search) || s.username.includes(search));

  const classAverage = filteredStudents.length > 0 
    ? (filteredStudents.reduce((sum, student) => sum + student.total_points, 0) / filteredStudents.length).toFixed(1) 
    : '0.0';

  const allGroups = [
    ...groups.map(g => ({ id: g.id, name: g.name })),
    { id: 'ungrouped', name: '未分组' }
  ];

  const groupedStudentsWithEmpty = allGroups.map(group => {
    return {
      groupId: group.id,
      groupName: group.name,
      students: filteredStudents.filter(s => {
        if (group.id === 'ungrouped') {
          return !(s as any).group_id && !(s as any).group_name;
        }
        return (s as any).group_id === group.id || (s as any).group_name === group.name;
      })
    };
  });

  const toggleSelectStudent = (id: number) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(studentId => studentId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(s => s.id));
    }
  };

  const openPointsModal = (target: 'single' | 'batch', studentId: number | null = null) => {
    setPointsTarget(target);
    setCurrentTargetId(studentId);
    setCustomAmount('');
    setCustomReason('');
    setShowPointsModal(true);
  };

  const closePointsModal = () => {
    setShowPointsModal(false);
    setPointsTarget(null);
    setCurrentTargetId(null);
    setCustomAmount('');
    setCustomReason('');
  };

  const submitPoints = async (amount: number, reason: string) => {
    if (submittingPoints) return;
    if (amount === 0) return;
    
    setSubmittingPoints(true);
    try {
      if (pointsTarget === 'single' && currentTargetId) {
        await apiPost(`/api/students/${currentTargetId}/points`, { amount, reason: reason || (amount > 0 ? '表现优异加分' : '违规扣分') });
        fetchStudents();
        closePointsModal();
        toast.success(`已为该学生${amount > 0 ? '加' : '扣'} ${Math.abs(amount)} 分`);
      } else if (pointsTarget === 'batch' && selectedStudents.length > 0) {
        await apiPost('/api/students/batch-points', { 
          studentIds: selectedStudents, 
          amount, 
          reason: reason || (amount > 0 ? '表现优异加分' : '违规扣分') 
        });
        fetchStudents();
        setSelectedStudents([]);
        closePointsModal();
        if (amount > 0) triggerConfetti();
        toast.success(`已为 ${selectedStudents.length} 名学生批量${amount > 0 ? '加' : '扣'} ${Math.abs(amount)} 分`);
      }
    } finally {
      setSubmittingPoints(false);
    }
  };

  const handleCustomPointsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(customAmount, 10);
    if (!isNaN(amount) && amount !== 0) {
      submitPoints(amount, customReason);
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditAction('change_class');
    setEditValue('');
  };

  const handleBatchEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudents.length === 0) return;
    
    if (editAction === 'change_class' && !editValue) {
      toast.warning('请选择目标班级');
      return;
    }
    if (editAction === 'change_group' && !editValue) {
      toast.warning('请选择目标小组');
      return;
    }
    
    setSubmittingEdit(true);
    try {
      await apiPost('/api/students/batch-edit', { 
        studentIds: selectedStudents, 
        action: editAction, 
        value: (editAction === 'change_class' || editAction === 'change_group') ? parseInt(editValue, 10) : editValue 
      });
      fetchStudents();
      setSelectedStudents([]);
      closeEditModal();
      toast.success('修改成功！');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !selectedClassId) return;
    
    setCreatingGroup(true);
    try {
      const data = await apiPost<any>('/api/groups', { name: newGroupName.trim(), class_id: selectedClassId });
      setGroups([...groups, data.group]);
      setShowAddGroup(false);
      setNewGroupName('');
      toast.success('小组创建成功');
    } finally {
      setCreatingGroup(false);
    }
  };

  // AI Radar State
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiTargetStudent, setAiTargetStudent] = useState<Student | null>(null);
  const [aiAnalysisStage, setAiAnalysisStage] = useState<number>(0);
  const [aiReport, setAiReport] = useState<any>(null);

  const openAIModal = (studentId: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    setAiTargetStudent(student);
    setShowAIModal(true);
    setAiAnalysisStage(0);
    setAiReport(null);

    // Simulate AI thinking process
    setTimeout(() => setAiAnalysisStage(1), 800); // fetching data
    setTimeout(() => setAiAnalysisStage(2), 1800); // analyzing
    setTimeout(() => {
      setAiAnalysisStage(3); // done
      // Fake AI Report based on student points
      const score = student.total_points;
      let strengths, weaknesses, advice;
      
      if (score > 500) {
        strengths = ['学习积极性极高', '经常参与课堂互动', '作业完成度好'];
        weaknesses = ['可能缺乏同伴互评的参与度'];
        advice = '该魔法师表现优异！建议解锁更高级的盲盒奖励以维持其积极性，或委任其为魔法小队队长。';
      } else if (score > 100) {
        strengths = ['表现稳定', '有持续进步的潜力'];
        weaknesses = ['偶尔会错过一些互动机会', '部分挑战未完成'];
        advice = '该魔法师处于平稳发展期。建议在课堂上多给予一些口头表扬（加分），并鼓励其参与世界 BOSS 挑战。';
      } else {
        strengths = ['具备基础的规则意识'];
        weaknesses = ['近期积分获取缓慢', '参与度偏低'];
        advice = '系统检测到该魔法师近期情绪可能较低落或缺乏动力。建议进行一次简短的私下谈心，或者通过家校联动（家长魔法增益）来激发其学习兴趣。';
      }

      setAiReport({ strengths, weaknesses, advice });
    }, 3500);
  };
  const [showPraiseModal, setShowPraiseModal] = useState(false);
  const [praiseTargetId, setPraiseTargetId] = useState<number | null>(null);
  const [praiseContent, setPraiseContent] = useState('');
  const [praiseColor, setPraiseColor] = useState('bg-yellow-100');
  const [submittingPraise, setSubmittingPraise] = useState(false);

  const openPraiseModal = (studentId: number) => {
    setPraiseTargetId(studentId);
    setPraiseContent('');
    setPraiseColor('bg-yellow-100');
    setShowPraiseModal(true);
  };

  const handlePraiseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!praiseContent.trim() || !praiseTargetId) return;

    setSubmittingPraise(true);
    try {
      await apiPost('/api/praises', {
        teacher_id: 1, // default or context
        student_id: praiseTargetId,
        content: praiseContent.trim(),
        color: praiseColor,
      });
      toast.success('表扬信发送成功！学生已获得经验加成！');
      setShowPraiseModal(false);
      triggerConfetti();
      fetchStudents();
    } finally {
      setSubmittingPraise(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const studentId = parseInt(active.id.toString().replace('student-', ''), 10);
    const targetGroupIdStr = over.id.toString().replace('group-', '');
    const targetGroupId = targetGroupIdStr === 'ungrouped' ? null : parseInt(targetGroupIdStr, 10);

    const student = students.find(s => s.id === studentId);
    if (!student) return;
    
    // Check if the group actually changed
    if ((student as any).group_id === targetGroupId) return;

    // Optimistic Update UI
    const targetGroupName = targetGroupId ? groups.find(g => g.id === targetGroupId)?.name : '未分组';
    setStudents(prev => prev.map(s => 
      s.id === studentId ? { ...s, group_id: targetGroupId, group_name: targetGroupName } : s
    ));

    // Send API request
    try {
      await apiPost('/api/students/batch-edit', { 
        studentIds: [studentId], 
        action: 'change_group', 
        value: targetGroupId 
      });
      toast.success(`成功移动到 ${targetGroupName || '未分组'}`);
    } catch (err) {
      fetchStudents(); // Rollback on failure
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    
    setCreatingClass(true);
    try {
      const data = await apiPost<any>('/api/classes', { name: newClassName });
      setClasses([...classes, data.class]);
      setSelectedClassId(data.class.id);
      setShowAddClass(false);
      setNewClassName('');
      toast.success('班级创建成功');
    } finally {
      setCreatingClass(false);
    }
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

      {/* Create Class Modal */}
      {showAddClass && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">新建班级</h3>
              <button onClick={() => setShowAddClass(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClass} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">班级名称</label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="例如：三年级二班"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddClass(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingClass}
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 disabled:opacity-50"
                >
                  {creatingClass ? '创建中...' : '确认'}
                </button>
              </div>
            </form>
          </div>
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
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-slate-50/50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
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
              <div className="hidden sm:flex items-center px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-2xl">
                <span className="text-xs text-blue-500 font-medium mr-2">班级邀请码:</span>
                <span className="text-sm font-mono font-bold text-blue-700 tracking-wider">
                  {classes.find(c => c.id === selectedClassId)?.invite_code || '无'}
                </span>
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
            <button
              onClick={toggleSelectAll}
              className="flex items-center text-sm text-slate-600 hover:text-indigo-600"
            >
              {selectedStudents.length === filteredStudents.length ? (
                <CheckSquare className="h-5 w-5 mr-1 text-indigo-500" />
              ) : (
                <Square className="h-5 w-5 mr-1" />
              )}
              全选
            </button>
          )}
          
          {selectedStudents.length > 0 && (
            <button
              onClick={() => openPointsModal('batch')}
              className="flex items-center px-3 py-1.5 bg-orange-100 text-orange-700 rounded-2xl hover:bg-orange-200 transition-colors font-medium text-sm"
            >
              <Users className="h-4 w-4 mr-1" />
              批量评分 ({selectedStudents.length})
            </button>
          )}

          {selectedStudents.length > 0 && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded-2xl hover:bg-blue-200 transition-colors font-medium text-sm"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              批量修改 ({selectedStudents.length})
            </button>
          )}

          <button
            onClick={() => navigate('/teacher/add-student', { state: { classId: selectedClassId } })}
            className="w-full sm:w-auto flex justify-center items-center px-4 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl hover:from-indigo-600 hover:to-cyan-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            添加学生
          </button>
        </div>
      </div>

      {/* Classroom Tools Panel */}
      {showTools && (
        <ClassroomTools students={filteredStudents} />
      )}

      {/* Student Grid */}
      {loading ? (
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
                      student={student} 
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

      {/* Points Modal */}
      {showPointsModal && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">
                {pointsTarget === 'batch' ? `批量评分 (${selectedStudents.length}人)` : '积分管理'}
              </h3>
              <button onClick={closePointsModal} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-medium text-slate-700">快捷评分</h4>
                  <button 
                    onClick={() => setIsEditingPresets(!isEditingPresets)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    {isEditingPresets ? '完成' : <><Edit2 className="w-3 h-3 mr-1" /> 编辑预设</>}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {presets.map((preset) => (
                    <div key={preset.id} className="relative group">
                      <button
                        onClick={() => !isEditingPresets && submitPoints(preset.amount, preset.label)}
                        disabled={submittingPoints}
                        className={`w-full flex justify-between items-center px-3 py-2 border rounded-xl text-sm transition-colors ${
                          preset.amount > 0 
                            ? 'border-indigo-200/50 bg-indigo-50/50 hover:bg-indigo-100/50 text-indigo-700' 
                            : 'border-red-200 bg-red-50 hover:bg-red-100 text-red-700'
                        } ${submittingPoints ? 'opacity-50 cursor-not-allowed' : ''} ${isEditingPresets ? 'cursor-default' : ''}`}
                      >
                        <span className="font-medium">{preset.label}</span>
                        <span className="font-bold">{preset.amount > 0 ? `+${preset.amount}` : preset.amount}</span>
                      </button>
                      {isEditingPresets && (
                        <button
                          onClick={() => handleDeletePreset(preset.id)}
                          className="absolute -top-2 -right-2 bg-white/80 backdrop-blur-xl rounded-full text-red-500 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-red-100 hover:bg-red-50 p-1 z-10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                {isEditingPresets && (
                  <form onSubmit={handleAddPreset} className="mt-4 p-3 bg-slate-50/50 rounded-xl border border-gray-200 border-dashed">
                    <h5 className="text-xs font-medium text-slate-600 mb-2">添加新预设</h5>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="理由"
                        value={newPresetLabel}
                        onChange={(e) => setNewPresetLabel(e.target.value)}
                        className="flex-1 min-w-0 border-gray-300 rounded-2xl py-1 px-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <input
                        type="number"
                        placeholder="分数"
                        value={newPresetAmount}
                        onChange={(e) => setNewPresetAmount(e.target.value)}
                        className="w-16 border-gray-300 rounded-2xl py-1 px-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={!newPresetLabel || !newPresetAmount}
                        className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-2xl text-sm hover:from-indigo-600 hover:to-cyan-600 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="border-t border-white/60 pt-6">
                <h4 className="text-sm font-medium text-slate-700 mb-3">自定义评分</h4>
                <form onSubmit={handleCustomPointsSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">分数 (正数加分，负数扣分)</label>
                    <input
                      type="number"
                      required
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="例如：10 或 -5"
                      className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">理由</label>
                    <input
                      type="text"
                      required
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="请输入评分理由"
                      className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingPoints || !customAmount || !customReason}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {submittingPoints ? '提交中...' : '确认自定义评分'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">批量修改 ({selectedStudents.length}人)</h3>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleBatchEditSubmit} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">修改项</label>
                <div className="flex space-x-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="editAction"
                      className="text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300"
                      checked={editAction === 'change_class'}
                      onChange={() => { setEditAction('change_class'); setEditValue(''); }}
                    />
                    <span className="ml-2 text-sm text-slate-700">转移班级</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="editAction"
                      className="text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300"
                      checked={editAction === 'change_group'}
                      onChange={() => { setEditAction('change_group'); setEditValue(''); }}
                    />
                    <span className="ml-2 text-sm text-slate-700">分配小组</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="editAction"
                      className="text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300"
                      checked={editAction === 'reset_password'}
                      onChange={() => { setEditAction('reset_password'); setEditValue(''); }}
                    />
                    <span className="ml-2 text-sm text-slate-700">重置密码</span>
                  </label>
                </div>
              </div>

              {editAction === 'change_class' ? (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-1">目标班级</label>
                  <select
                    required
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="" disabled>请选择班级...</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              ) : editAction === 'change_group' ? (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-1">目标小组</label>
                  <select
                    required
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="" disabled>请选择小组...</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-slate-500">
                    如果没有可用的小组，请先在上方班级标签栏旁新建小组。
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
                  <input
                    type="text"
                    required
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="输入新密码，默认 123456"
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit || (editAction === 'change_class' && !editValue)}
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {submittingEdit ? '提交中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Group Modal */}
      {showAddGroup && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">新建小组</h3>
              <button onClick={() => setShowAddGroup(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">小组名称</label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="例如：第一组 / 火箭队"
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddGroup(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup || !newGroupName.trim()}
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingGroup ? '创建中...' : '确认新建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Radar Modal */}
      <AnimatePresence>
        {showAIModal && aiTargetStudent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-indigo-100 relative"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-indigo-50 flex justify-between items-center bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                    <BrainCircuit className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">AI 学情雷达</h3>
                    <p className="text-xs text-slate-500">目标法师：{aiTargetStudent.name}</p>
                  </div>
                </div>
                <button onClick={() => setShowAIModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 min-h-[300px] flex flex-col justify-center">
                {aiAnalysisStage < 3 ? (
                  <div className="flex flex-col items-center justify-center space-y-6 py-8">
                    <div className="relative">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                        className="w-24 h-24 rounded-full border-2 border-indigo-100 border-t-indigo-500 border-r-purple-500"
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-indigo-500">
                        <BrainCircuit className="w-8 h-8 animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <motion.p 
                        key={aiAnalysisStage}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600"
                      >
                        {aiAnalysisStage === 0 && "正在初始化神经雷达..."}
                        {aiAnalysisStage === 1 && "正在抓取课堂行为数据..."}
                        {aiAnalysisStage === 2 && "正在生成多维能力画像..."}
                      </motion.p>
                      <p className="text-sm text-slate-400">请勿关闭窗口，AI 正在深度思考</p>
                    </div>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    {/* Strengths & Weaknesses */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4">
                        <h4 className="text-sm font-bold text-emerald-800 mb-3 flex items-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2" />
                          突出优势
                        </h4>
                        <ul className="space-y-2">
                          {aiReport?.strengths?.map((item: string, i: number) => (
                            <li key={i} className="text-xs text-emerald-700 flex items-start">
                              <span className="mr-1.5 mt-0.5 opacity-60">✦</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4">
                        <h4 className="text-sm font-bold text-rose-800 mb-3 flex items-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-2" />
                          待提升项
                        </h4>
                        <ul className="space-y-2">
                          {aiReport?.weaknesses?.map((item: string, i: number) => (
                            <li key={i} className="text-xs text-rose-700 flex items-start">
                              <span className="mr-1.5 mt-0.5 opacity-60">✧</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* AI Advice */}
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-5 border border-indigo-100/50 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/40 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                      <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center">
                        <BrainCircuit className="w-4 h-4 mr-2 text-indigo-500" />
                        AI 导师建议
                      </h4>
                      <p className="text-sm text-indigo-800 leading-relaxed relative z-10">
                        {aiReport?.advice}
                      </p>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => setShowAIModal(false)}
                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all"
                      >
                        完成阅览
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Praise Modal */}
      <AnimatePresence>
        {showPraiseModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-amber-100"
            >
              <div className="px-6 py-5 border-b border-amber-50 flex justify-between items-center bg-gradient-to-r from-amber-50/50 to-orange-50/50">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                    <Star className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">发送表扬信</h3>
                </div>
                <button onClick={() => setShowPraiseModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handlePraiseSubmit} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">选择信纸颜色</label>
                  <div className="flex space-x-3">
                    {[
                      { bg: 'bg-yellow-100', border: 'border-yellow-200' },
                      { bg: 'bg-blue-100', border: 'border-blue-200' },
                      { bg: 'bg-pink-100', border: 'border-pink-200' },
                      { bg: 'bg-emerald-100', border: 'border-emerald-200' }
                    ].map(c => (
                      <button
                        key={c.bg}
                        type="button"
                        onClick={() => setPraiseColor(c.bg)}
                        className={`w-8 h-8 rounded-full ${c.bg} border-2 ${praiseColor === c.bg ? 'ring-2 ring-offset-2 ring-slate-400 border-transparent' : c.border} transition-all`}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">寄语内容</label>
                  <textarea
                    required
                    rows={4}
                    value={praiseContent}
                    onChange={(e) => setPraiseContent(e.target.value)}
                    placeholder="写下对该法师的鼓励..."
                    className={`block w-full rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors resize-none ${praiseColor} border-transparent`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingPraise || !praiseContent.trim()}
                  className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:shadow-orange-300 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {submittingPraise ? '发送中...' : '发送魔法寄语'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
