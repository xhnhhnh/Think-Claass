import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { apiGet, apiPut } from '@/lib/api';
import { Sparkles, Users, Upload, ImageIcon, XCircle, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const ELEMENTS = [
  { id: 'fire', name: '火系', color: 'bg-red-500', bg: 'bg-red-50', icon: '🔥' },
  { id: 'water', name: '水系', color: 'bg-blue-500', bg: 'bg-blue-50', icon: '💧' },
  { id: 'grass', name: '草系', color: 'bg-green-500', bg: 'bg-green-50', icon: '🌿' },
  { id: 'electric', name: '电系', color: 'bg-yellow-400', bg: 'bg-yellow-50', icon: '⚡' },
  { id: 'ice', name: '冰系', color: 'bg-cyan-300', bg: 'bg-cyan-50', icon: '❄️' },
  { id: 'dragon', name: '龙系', color: 'bg-purple-500', bg: 'bg-purple-50', icon: '🐉' },
];

const getEvolutionStage = (level: number) => {
  if (level === 1) return '萌蛋期';
  if (level === 2) return '幼年期';
  if (level === 3) return '成长期';
  if (level === 4) return '成熟期';
  if (level === 5) return '完全体';
  return '究极体';
};

const getPetIcon = (level: number) => {
  if (level === 1) return '🥚';
  if (level === 2) return '🐣';
  if (level === 3) return '🐥';
  if (level === 4) return '🦅';
  if (level === 5) return '🐉';
  return '👑';
};

export default function TeacherPets() {
  const user = useStore((state) => state.user);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [editingImages, setEditingImages] = useState<any>({});
  const [savingImages, setSavingImages] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudentsPets();
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    try {
      const data = await apiGet<{ classes: any[] }>('/api/classes');
      setClasses(data.classes);
      if (data.classes.length > 0) {
        setSelectedClassId(data.classes[0].id.toString());
      }
    } catch (error) {
      setLoading(false);
    }
  };

  const fetchStudentsPets = async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ students: any[] }>(`/api/pets/admin/class/${selectedClassId}`);
      setStudents(data.students);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (student: any) => {
    setEditingStudent(student);
    if (student.has_pet) {
      setEditingImages({ ...student.pet });
    } else {
      setEditingImages({ element_type: 'fire', level: 1, experience: 0, attack_power: 10 }); // default
    }
    setIsModalOpen(true);
  };

  const handleStageImageUpload = (e: React.ChangeEvent<HTMLInputElement>, stage: number) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 5) {
        toast.error('图片/动图大小不能超过 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingImages((prev: any) => ({
          ...prev,
          [`image_stage${stage}`]: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!editingImages.element_type) {
      toast.error('请选择精灵属性');
      return;
    }
    setSavingImages(true);
    try {
      await apiPut(`/api/pets/${editingStudent.student_id}`, editingImages);
      toast.success(editingStudent.has_pet ? '外观修改成功！' : '精灵分配成功！');
      setIsModalOpen(false);
      fetchStudentsPets();
    } finally {
      setSavingImages(false);
    }
  };

  const renderPetImage = (pet: any) => {
    if (!pet) return null;
    const stageKey = `image_stage${pet.level}`;
    const imgUrl = pet[stageKey] || pet.custom_image;
    if (imgUrl) {
      return <img src={imgUrl} alt="Pet" className="w-16 h-16 object-cover rounded-full shadow-sm border-2 border-white" />;
    }
    return <div className="text-5xl">{getPetIcon(pet.level)}</div>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-indigo-100/50 rounded-2xl flex items-center justify-center mr-4">
            <Sparkles className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">班级精灵管理</h1>
            <p className="text-sm text-slate-500 mt-1">查看、分配或管理学生的学习精灵及进化外观</p>
          </div>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <Users className="w-5 h-5 text-slate-400" />
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full sm:w-auto pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {students.map((student) => {
            const pet = student.pet;
            const element = pet ? ELEMENTS.find(e => e.id === pet.element_type) || ELEMENTS[0] : null;

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={student.student_id}
                className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all group flex flex-col"
              >
                <div className="flex justify-between items-center mb-4">
                  <span className="font-bold text-slate-800">{student.student_name}</span>
                  {!student.has_pet && (
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-500 rounded-lg">
                      未领养
                    </span>
                  )}
                  {student.has_pet && element && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${element.color} text-white shadow-sm`}>
                      {element.name}
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-4 relative">
                  {student.has_pet ? (
                    <>
                      <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-3 shadow-inner ${element?.bg || 'bg-slate-50'}`}>
                        {renderPetImage(pet)}
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-slate-700">Lv.{pet.level} {getEvolutionStage(pet.level)}</div>
                        <div className="text-xs text-slate-400 mt-1">攻击力: {pet.attack_power} | 经验: {pet.experience}</div>
                      </div>
                    </>
                  ) : (
                    <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 mb-3 bg-slate-50">
                      <Sparkles className="w-6 h-6 mb-1 opacity-50" />
                      <span className="text-xs font-medium">无精灵</span>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => openModal(student)}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center shadow-sm ${
                      student.has_pet 
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' 
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100/50'
                    }`}
                  >
                    {student.has_pet ? (
                      <>
                        <ImageIcon className="w-4 h-4 mr-2" /> 管理外观与属性
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" /> 为其分配精灵
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {isModalOpen && editingStudent && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                  <Sparkles className="w-6 h-6 mr-3 text-indigo-500" />
                  {editingStudent.has_pet ? `管理 ${editingStudent.student_name} 的精灵` : `为 ${editingStudent.student_name} 分配精灵`}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-8">
                {/* Element Selection */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center">
                    1. 选择精灵属性 (Element Type)
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {ELEMENTS.map((el) => (
                      <div
                        key={el.id}
                        onClick={() => setEditingImages({ ...editingImages, element_type: el.id })}
                        className={`cursor-pointer rounded-xl border-2 p-3 flex flex-col items-center transition-all ${
                          editingImages.element_type === el.id
                            ? `border-${el.color.split('-')[1]}-500 ${el.bg} shadow-md`
                            : 'border-slate-100 hover:border-slate-300 bg-slate-50'
                        }`}
                      >
                        <div className="text-2xl mb-1">{el.icon}</div>
                        <div className="text-xs font-bold text-slate-700">{el.name}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Base Stats Setting */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center">
                    2. 基础数值设置 (Base Stats)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">等级 (Level 1-6)</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="6" 
                        value={editingImages.level || 1} 
                        onChange={(e) => setEditingImages({ ...editingImages, level: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">经验值 (Experience)</label>
                      <input 
                        type="number" 
                        min="0" 
                        value={editingImages.experience || 0} 
                        onChange={(e) => setEditingImages({ ...editingImages, experience: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">攻击力 (Attack Power)</label>
                      <input 
                        type="number" 
                        min="0" 
                        value={editingImages.attack_power || 10} 
                        onChange={(e) => setEditingImages({ ...editingImages, attack_power: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Stages Selection */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center">
                    3. 配置阶段外观 (可选，支持 JPG/PNG/GIF，最高 5MB)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((level) => {
                      const stageKey = `image_stage${level}`;
                      const currentImage = editingImages[stageKey] || (level === 1 ? null : editingImages.custom_image);

                      return (
                        <div key={level} className="flex flex-col items-center">
                          <div className="text-xs font-bold text-indigo-700 mb-2 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                            Lv.{level} {getEvolutionStage(level)}
                          </div>

                          <label className="cursor-pointer group relative w-full aspect-square max-w-[160px]">
                            <div className={`w-full h-full rounded-2xl border-2 flex flex-col items-center justify-center overflow-hidden transition-all ${currentImage ? 'border-indigo-400 shadow-sm bg-white' : 'border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50'}`}>
                              {currentImage ? (
                                <img src={currentImage} alt={`Lv.${level}`} className="w-full h-full object-cover" />
                              ) : (
                                <>
                                  <Upload className="h-6 w-6 text-slate-300 group-hover:text-indigo-400 mb-2" />
                                  <span className="text-xs text-slate-400 group-hover:text-indigo-500 font-medium">点击上传</span>
                                </>
                              )}
                            </div>

                            <div className="absolute inset-0 bg-slate-900/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs font-bold flex flex-col items-center">
                                <Upload className="w-5 h-5 mb-1" />
                                更换图片
                              </span>
                            </div>

                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleStageImageUpload(e, level)}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end space-x-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={savingImages}
                  className="px-6 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  {savingImages ? '保存中...' : '确认保存'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}