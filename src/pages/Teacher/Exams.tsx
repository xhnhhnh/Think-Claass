import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, FileSpreadsheet, LoaderCircle, PlusCircle, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { examsApi, type Exam } from '@/api/exams';
import { useExamGrades, useExams } from '@/hooks/queries/useExams';
import { useStore } from '@/store/useStore';

export default function TeacherExams() {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const classId = user?.class_id ?? 1;
  const teacherId = user?.id ?? 1;

  const { data: exams = [], isLoading, error } = useExams(classId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTotalScore, setNewTotalScore] = useState('100');
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [editingGrades, setEditingGrades] = useState<Record<number, string>>({});

  const { data: examGradesData, isLoading: isGradesLoading } = useExamGrades(currentExam?.id ?? null, showGradeModal);

  useEffect(() => {
    if (!examGradesData?.grades) return;
    const nextState: Record<number, string> = {};
    for (const grade of examGradesData.grades) {
      nextState[grade.student_id] = grade.score === null ? '' : grade.score.toString();
    }
    setEditingGrades(nextState);
  }, [examGradesData]);

  const createMutation = useMutation({
    mutationFn: examsApi.createExam,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exams', classId] });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewDate('');
      setNewTotalScore('100');
      toast.success('考试创建成功');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: examsApi.deleteExam,
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ['exams', classId] });
      if (currentExam?.id === deletedId) {
        setCurrentExam(null);
        setShowGradeModal(false);
      }
      toast.success('考试已删除');
    },
  });

  const saveGradesMutation = useMutation({
    mutationFn: async () => {
      if (!currentExam || !examGradesData?.grades) {
        throw new Error('当前没有可保存的成绩')
      }

      await examsApi.saveExamGrades(
        currentExam.id,
        examGradesData.grades.map((grade) => ({
          student_id: grade.student_id,
          score: editingGrades[grade.student_id] === '' ? null : Number(editingGrades[grade.student_id] ?? ''),
        })),
      );
    },
    onSuccess: async () => {
      if (currentExam) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['exam-grades', currentExam.id] }),
          queryClient.invalidateQueries({ queryKey: ['exams', classId] }),
        ]);
      }
      setShowGradeModal(false);
      toast.success('成绩录入成功');
    },
  });

  const handleCreateExam = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newTotalScore) return;

    await createMutation.mutateAsync({
      class_id: classId,
      teacher_id: teacherId,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      exam_date: newDate || null,
      total_score: parseInt(newTotalScore, 10),
    });
  };

  const handleDeleteExam = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const openGradeModal = (exam: Exam) => {
    setCurrentExam(exam);
    setShowGradeModal(true);
  };

  const handleSaveGrades = async () => {
    try {
      await saveGradesMutation.mutateAsync();
    } catch (mutationError: any) {
      toast.error(mutationError.message || '保存失败，请重试');
    }
  };

  const hasRecordedGrades = (examId: number) => {
    if (currentExam?.id !== examId || !examGradesData?.grades) return false;
    return examGradesData.grades.some((grade) => grade.score !== null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center space-x-2">
          <Award className="h-6 w-6 text-purple-500" />
          <h2 className="text-lg font-bold text-slate-800">考试与成绩</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          新建考试
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center rounded-2xl border border-white/60 bg-white/80 py-16 text-slate-500">
          <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
          正在加载考试列表...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-10 text-center text-red-600">
          考试列表加载失败，请稍后重试
        </div>
      )}

      {!isLoading && !error && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
              <div key={exam.id} className="p-5 border border-white/60 rounded-2xl hover:shadow-md transition-shadow relative bg-white/80 backdrop-blur-xl flex flex-col h-full">
                <div className="flex justify-between items-start mb-3 gap-3">
                  <div>
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-2xl">
                      总分 {exam.total_score}
                    </span>
                    <h3 className="font-bold text-slate-800 text-lg mt-3 break-words">{exam.title}</h3>
                  </div>
                  <button
                    onClick={() => handleDeleteExam(exam.id)}
                    disabled={deleteMutation.isPending}
                    className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="text-sm text-slate-500 mb-4 flex-grow space-y-2">
                  <p>考试日期: {exam.exam_date || '未定'}</p>
                  <p>说明: {exam.description || '暂无说明'}</p>
                  <p>
                    状态:
                    <span className={`ml-2 font-medium ${hasRecordedGrades(exam.id) ? 'text-indigo-600' : 'text-orange-500'}`}>
                      {hasRecordedGrades(exam.id) ? '已录入部分成绩' : '待录入成绩'}
                    </span>
                  </p>
                </div>

                <button
                  onClick={() => openGradeModal(exam)}
                  className="w-full flex items-center justify-center px-4 py-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 font-medium transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  录入成绩
                </button>
              </div>
            ))}
            {exams.length === 0 && (
              <div className="col-span-full text-center py-12 text-slate-500 border-2 border-dashed border-gray-200 rounded-2xl">
                还没有安排任何考试
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">新建考试</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateExam} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">考试名称</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                  placeholder="例如：期中考试"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">考试说明</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                  placeholder="可填写考试范围、注意事项等"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">考试日期</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">总分</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newTotalScore}
                    onChange={(e) => setNewTotalScore(e.target.value)}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-50"
                >
                  {createMutation.isPending ? '创建中...' : '确认新建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGradeModal && currentExam && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">成绩录入</h3>
                <p className="text-sm text-slate-500">{currentExam.title}</p>
              </div>
              <button onClick={() => setShowGradeModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {isGradesLoading && (
                <div className="flex items-center justify-center py-10 text-slate-500">
                  <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
                  正在加载成绩数据...
                </div>
              )}

              {!isGradesLoading && (
                <div className="space-y-3">
                  <div className="flex justify-between px-4 py-2 bg-slate-100/50 rounded-2xl text-sm font-bold text-slate-700">
                    <span>学生姓名</span>
                    <span>分数</span>
                  </div>
                  {(examGradesData?.grades ?? []).map((grade) => (
                    <div key={grade.student_id} className="flex justify-between items-center gap-4 px-4 py-2 border-b border-gray-50">
                      <span className="font-medium text-slate-800">{grade.student_name}</span>
                      <input
                        type="number"
                        min="0"
                        max={currentExam.total_score}
                        value={editingGrades[grade.student_id] || ''}
                        onChange={(e) => setEditingGrades((prev) => ({ ...prev, [grade.student_id]: e.target.value }))}
                        className="w-24 text-center border-gray-300 rounded-2xl py-1 px-2 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        placeholder="未录入"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/60 flex justify-end space-x-3 shrink-0 bg-slate-50/50">
              <button
                onClick={() => setShowGradeModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
              >
                取消
              </button>
              <button
                onClick={handleSaveGrades}
                disabled={saveGradesMutation.isPending || isGradesLoading}
                className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-50"
              >
                {saveGradesMutation.isPending ? '保存中...' : '保存成绩'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
