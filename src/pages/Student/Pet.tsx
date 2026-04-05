import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { ShieldAlert, Zap, Cookie, Play, Star, Plus, Upload, Image as ImageIcon, Heart, List, ArrowUpRight, ArrowDownRight, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import DanmakuOverlay from '@/components/DanmakuOverlay';

interface Pet {
  id: number;
  element_type: string;
  custom_image?: string;
  image_stage1?: string;
  image_stage2?: string;
  image_stage3?: string;
  image_stage4?: string;
  image_stage5?: string;
  image_stage6?: string;
  level: number;
  experience: number;
  attack_power: number;
  has_parent_buff?: boolean;
}

const ELEMENTS = [
  { id: 'fire', name: '火系', color: 'bg-red-500', bg: 'bg-red-50', icon: '🔥' },
  { id: 'water', name: '水系', color: 'bg-blue-500', bg: 'bg-blue-50', icon: '💧' },
  { id: 'grass', name: '草系', color: 'bg-green-500', bg: 'bg-green-50', icon: '🌿' },
  { id: 'electric', name: '电系', color: 'bg-yellow-400', bg: 'bg-yellow-50', icon: '⚡' },
  { id: 'ice', name: '冰系', color: 'bg-cyan-300', bg: 'bg-cyan-50', icon: '❄️' },
  { id: 'dragon', name: '龙系', color: 'bg-purple-500', bg: 'bg-purple-50', icon: '🐉' },
];

export default function StudentPet() {
  const user = useStore((state) => state.user);
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [selectedElement, setSelectedElement] = useState('');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [praises, setPraises] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [showRecords, setShowRecords] = useState(false);
  const [showEditImages, setShowEditImages] = useState(false);
  const [editingImages, setEditingImages] = useState<Record<string, string>>({});
  const [savingImages, setSavingImages] = useState(false);

  const fetchPetData = async () => {
    if (!user?.studentId) return;
    try {
      const res = await fetch(`/api/pets/${user.studentId}`);
      const data = await res.json();
      if (data.success && data.pet) {
        setPet(data.pet);
      }
      
      // Fetch user's current points
      const resStudents = await fetch('/api/students');
      const dataStudents = await resStudents.json();
      if (dataStudents.success) {
        const student = dataStudents.students.find((s: any) => s.id === user.studentId);
        if (student) setAvailablePoints(student.available_points);
      }
      
      const praiseRes = await fetch(`/api/praises/student/${user.studentId}`);
      const praiseData = await praiseRes.json();
      if (praiseData.success) {
        setPraises(praiseData.praises);
      }

      const recordsRes = await fetch(`/api/students/records?studentId=${user.studentId}`);
      const recordsData = await recordsRes.json();
      if (recordsData.success) {
        setRecords(recordsData.records);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPetData();
  }, [user]);

  const handleStageImageUpload = (e: React.ChangeEvent<HTMLInputElement>, stage: number) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 5) {
        toast.error('图片/动图大小不能超过 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingImages(prev => ({
          ...prev,
          [`image_stage${stage}`]: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 5) {
        toast.error('图片/动图大小不能超过 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveImages = async () => {
    setSavingImages(true);
    try {
      const res = await fetch(`/api/pets/${user?.studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingImages),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('外观保存成功！');
        setShowEditImages(false);
        fetchPetData();
      } else {
        toast.error(data.message || '保存失败');
      }
    } catch (err) {
      toast.error('网络错误');
    } finally {
      setSavingImages(false);
    }
  };

  const handleAdopt = async () => {
    if (!selectedElement) return;
    setAdopting(true);
    try {
      const res = await fetch('/api/pets/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentId: user?.studentId, 
          elementType: selectedElement,
          customImage: customImage 
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('领养成功！开启你的学习之旅吧');
        fetchPetData();
      } else {
        toast.error('领养失败：' + data.message);
      }
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
    } finally {
      setAdopting(false);
    }
  };

  const handleInteract = async (actionType: string, cost: number, expGain: number, type: string = 'FEED_PET') => {
    if (availablePoints < cost) {
      toast.warning('可用积分不足！快去赚取更多积分吧');
      return;
    }
    
    try {
      const oldLevel = pet?.level || 1;
      
      const res = await fetch('/api/pets/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user?.studentId, actionType, cost, expGain, type }),
      });
      const data = await res.json();
      if (data.success) {
        setPet(data.pet);
        setAvailablePoints(data.points);
        toast.success(`交互成功！经验 +${expGain}`);
        
        // Evolution check
        if (data.pet.level > oldLevel) {
          triggerEvolutionEffect();
          toast.success(`🎉 恭喜！你的精灵进化到了【${getEvolutionStage(data.pet.level)}】！`, {
            duration: 5000,
            icon: '🌟'
          });
        }
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
    }
  };

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

  const triggerEvolutionEffect = () => {
    import('canvas-confetti').then((confetti) => {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti.default({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti.default({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    });
  };

  const [petMessage, setPetMessage] = useState<string | null>(null);
  
  const handlePetClick = () => {
    const messages = [
      "主人，今天也要努力学习哦！",
      "我饿啦，能给我喂点好吃的吗？",
      "我们一起变得更强吧！",
      "你真棒，我为你骄傲！",
      "特训能让我获得更多经验呢！"
    ];
    setPetMessage(messages[Math.floor(Math.random() * messages.length)]);
    setTimeout(() => setPetMessage(null), 3000);
  };

  if (loading) return <div className="text-center py-20">加载中...</div>;

  if (!pet) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2rem] shadow-2xl overflow-hidden max-w-4xl mx-auto border-8 border-orange-200"
      >
        <div className="bg-orange-400 p-8 text-center text-white border-b-8 border-orange-500">
          <h2 className="text-4xl font-black mb-2 drop-shadow-md">欢迎来到 Think-Class</h2>
          <p className="text-orange-100 text-xl font-bold">领养你的专属精灵伙伴，开启学习冒险之旅！</p>
        </div>
        <div className="p-8">
          <h3 className="text-2xl font-black text-gray-800 mb-6 text-center">选择精灵属性</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {ELEMENTS.map((el) => (
              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                key={el.id}
                onClick={() => setSelectedElement(el.id)}
                role="button" 
                className={`cursor-pointer rounded-[2rem] border-b-8 border-r-4 border-l-4 border-t-4 p-6 flex flex-col items-center transition-all ${
                  selectedElement === el.id 
                    ? `border-${el.color.split('-')[1]}-600 ${el.bg} shadow-xl ring-4 ring-${el.color.split('-')[1]}-300 ring-offset-4` 
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                <div className="text-6xl mb-4 drop-shadow-md">{el.icon}</div>
                <div className="font-black text-xl text-gray-800">{el.name}</div>
              </motion.div>
            ))}
          </div>

          {/* Custom Image Upload */}
          <div className="mt-10 pt-8 border-t-4 border-gray-100 border-dashed">
            <h4 className="text-xl font-black text-gray-800 mb-4 text-center">或者：上传你自己的精灵图片 (可选)</h4>
            <div className="flex justify-center">
              <label role="button" className="cursor-pointer group relative">
                <div className={`w-32 h-32 rounded-[2rem] border-8 flex flex-col items-center justify-center overflow-hidden transition-all ${customImage ? 'border-orange-500 shadow-xl' : 'border-dashed border-gray-300 hover:border-orange-400 bg-gray-50'}`}>
                  {customImage ? (
                    <img src={customImage} alt="自定义精灵" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400 group-hover:text-orange-500 mb-2" />
                      <span className="text-sm text-gray-500 group-hover:text-orange-500 font-bold">点击上传</span>
                    </>
                  )}
                </div>
                {customImage && (
                  <div className="absolute inset-0 bg-black/40 rounded-[2rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-bold flex items-center"><ImageIcon className="w-4 h-4 mr-1" /> 更换图片</span>
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleImageUpload}
                />
              </label>
            </div>
            <p className="text-center text-sm font-bold text-gray-400 mt-3">支持 JPG/PNG 格式，不超过 2MB</p>
          </div>

          <div className="mt-10 text-center">
            <motion.button
              whileHover={selectedElement && !adopting ? { scale: 1.05, y: -5 } : {}}
              whileTap={selectedElement && !adopting ? { scale: 0.95, y: 0 } : {}}
              onClick={handleAdopt}
              disabled={!selectedElement || adopting}
              className={`px-12 py-5 rounded-[2rem] text-2xl font-black text-white shadow-xl border-b-8 transition-all ${
                selectedElement && !adopting 
                  ? 'bg-orange-500 border-orange-700 hover:bg-orange-400' 
                  : 'bg-gray-300 border-gray-400 cursor-not-allowed'
              }`}
            >
              {adopting ? '领养中...' : '确认领养'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  const element = ELEMENTS.find(e => e.id === pet.element_type) || ELEMENTS[0];
  const progressPercent = ((pet.experience % 100) / 100) * 100;

  const getPetImage = () => {
    const stageKey = `image_stage${pet.level}` as keyof Pet;
    if (pet[stageKey]) return pet[stageKey] as string;
    if (pet.custom_image) return pet.custom_image;
    return null;
  };

  const currentPetImage = getPetImage();

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {user?.class_id && <DanmakuOverlay classId={user.class_id} />}
      {/* Top Status */}
      <div className="bg-white rounded-[2rem] p-6 shadow-xl border-b-8 border-gray-200 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="bg-orange-100 p-4 rounded-[1.5rem] border-b-4 border-orange-200">
            <Star className="h-8 w-8 text-orange-500 fill-current" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500">当前可用积分</p>
            <p className="text-3xl font-black text-orange-600">{availablePoints} <span className="text-lg font-bold">币</span></p>
          </div>
        </div>
        <div className="flex space-x-4">
          <motion.button 
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowRecords(true)}
            className="flex items-center px-5 py-3 bg-blue-100 text-blue-700 rounded-[1.5rem] font-bold border-b-4 border-blue-300 hover:bg-blue-200 transition-colors"
          >
            <List className="mr-2 h-5 w-5" /> 积分明细
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center px-5 py-3 bg-orange-100 text-orange-700 rounded-[1.5rem] font-bold border-b-4 border-orange-300 hover:bg-orange-200 transition-colors"
          >
            <Plus className="mr-2 h-5 w-5" /> 去赚积分
          </motion.button>
        </div>
      </div>

      {/* Pet Main Area */}
      <motion.div 
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className={`rounded-[2.5rem] shadow-2xl overflow-hidden border-8 border-white ${element.bg} relative min-h-[500px] flex flex-col justify-between`}
      >
        {/* Environment Background decorative */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #000 3px, transparent 3px)', backgroundSize: '40px 40px' }}></div>
        
        {/* Parent Buff Effect */}
        {pet.has_parent_buff && (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-[2.5rem]">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-amber-400/20 to-transparent animate-pulse"></div>
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-yellow-300 rounded-full mix-blend-screen filter blur-[80px] opacity-60 animate-[pulse_4s_ease-in-out_infinite]"></div>
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-orange-400 rounded-full mix-blend-screen filter blur-[80px] opacity-60 animate-[pulse_5s_ease-in-out_infinite]"></div>
          </div>
        )}

        {/* Status Bar */}
        <div className="relative z-10 p-6 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-[2rem] shadow-lg inline-block border-b-4 border-gray-200">
            <h2 className="text-3xl font-black text-gray-800 flex items-center drop-shadow-sm">
              <span className="text-4xl mr-3">{element.icon}</span> {element.name}精灵
            </h2>
            <div className="flex items-center mt-3 space-x-4 text-sm font-bold text-gray-600">
              <span className="bg-white px-4 py-2 rounded-full shadow-sm border-b-4 border-gray-100 flex items-center">
                Lv.{pet.level} {getEvolutionStage(pet.level)}
              </span>
              <span className="bg-white px-4 py-2 rounded-full shadow-sm border-b-4 border-gray-100 flex items-center">
                <ShieldAlert className="h-5 w-5 text-red-500 mr-2" /> 攻击力: {pet.attack_power}
              </span>
            </div>
          </div>
          
          {pet.has_parent_buff && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-4 rounded-[2rem] shadow-[0_10px_30px_rgba(245,158,11,0.4)] border-4 border-white text-white font-black flex items-center shrink-0 animate-bounce"
              style={{ animationDuration: '3s' }}
            >
              <Heart className="w-6 h-6 mr-2 fill-white" />
              <div>
                <div className="text-sm text-orange-100 opacity-90">母爱的祝福</div>
                <div className="text-lg">今日全天积分 +20%</div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Character Center */}
        <div className="relative z-10 flex-1 flex justify-center items-center cursor-pointer group" onClick={handlePetClick}>
          {petMessage && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute top-4 bg-white px-6 py-3 rounded-[2rem] shadow-xl text-orange-600 font-black text-lg z-30 whitespace-nowrap border-4 border-orange-100"
            >
              {petMessage}
              <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-t-[12px] border-t-white border-r-[8px] border-r-transparent drop-shadow-md"></div>
            </motion.div>
          )}

          <motion.div 
            animate={{ y: [0, -15, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="w-72 h-72 bg-white rounded-full shadow-2xl flex items-center justify-center border-8 border-white relative group-hover:scale-105 transition-transform duration-300"
          >
            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center relative">
              {currentPetImage ? (
                <img src={currentPetImage} alt="我的精灵" className="w-full h-full object-cover" />
              ) : (
                <div className="text-[10rem] relative drop-shadow-xl">
                  {getPetIcon(pet.level)}
                </div>
              )}
            </div>
            
            {pet.level > 1 && (
              <div className="absolute -bottom-6 bg-orange-500 text-white text-xl px-6 py-2 rounded-full font-black shadow-xl border-4 border-white z-20">
                Lv.{pet.level}
              </div>
            )}

            {/* Edit Appearance Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); setEditingImages(pet as any); setShowEditImages(true); }}
              className="absolute -top-4 -right-4 bg-purple-500 text-white p-3 rounded-full shadow-xl border-4 border-white z-30 hover:bg-purple-600 transition-colors"
              title="编辑外观"
            >
              <ImageIcon className="w-6 h-6" />
            </motion.button>

            {/* Mood Badge */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-white rounded-full flex items-center justify-center text-3xl shadow-xl z-20 border-4 border-gray-100">
              {(pet as any).mood === 'excited' ? '🤩' : (pet as any).mood === 'sad' ? '😢' : (pet as any).mood === 'dizzy' ? '😵' : '😊'}
            </div>
          </motion.div>
        </div>

        {/* Experience Bar & Actions */}
        <div className="relative z-10 bg-white/95 backdrop-blur-md p-8 border-t-4 border-white">
          <div className="mb-8">
            <div className="flex justify-between text-base font-black text-gray-700 mb-3">
              <span>经验值 ({pet.experience} / {pet.level * 100})</span>
              <span>距下一级 {pet.level * 100 - pet.experience}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden shadow-inner border-2 border-gray-100">
              <div 
                className={`${element.color} h-full rounded-full transition-all duration-500 ease-out relative`}
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full h-1/2"></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <motion.button 
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleInteract('喂食普通食物', 10, 10, 'FEED_PET')}
              className="flex flex-col items-center justify-center bg-white border-b-8 border-r-4 border-l-4 border-t-4 border-orange-200 rounded-[2rem] p-6 hover:border-orange-500 hover:bg-orange-50 shadow-lg group"
            >
              <div className="bg-orange-100 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform shadow-inner">
                <Cookie className="h-8 w-8 text-orange-500" />
              </div>
              <span className="font-black text-lg text-gray-800">喂食</span>
              <span className="text-sm font-bold text-gray-500 mt-1">(10币)</span>
              <span className="text-sm text-orange-500 font-black mt-2 bg-orange-100 px-3 py-1 rounded-full">+10 EXP</span>
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleInteract('买玩具', 30, 35, 'BUY_TOY')}
              className="flex flex-col items-center justify-center bg-white border-b-8 border-r-4 border-l-4 border-t-4 border-blue-200 rounded-[2rem] p-6 hover:border-blue-500 hover:bg-blue-50 shadow-lg group"
            >
              <div className="bg-blue-100 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform shadow-inner">
                <Play className="h-8 w-8 text-blue-500" />
              </div>
              <span className="font-black text-lg text-gray-800">玩具</span>
              <span className="text-sm font-bold text-gray-500 mt-1">(30币)</span>
              <span className="text-sm text-blue-500 font-black mt-2 bg-blue-100 px-3 py-1 rounded-full">+35 EXP</span>
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleInteract('基础训练', 60, 80, 'TRAIN')}
              className="flex flex-col items-center justify-center bg-white border-b-8 border-r-4 border-l-4 border-t-4 border-green-200 rounded-[2rem] p-6 hover:border-green-500 hover:bg-green-50 shadow-lg group"
            >
              <div className="bg-green-100 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform shadow-inner">
                <Zap className="h-8 w-8 text-green-500" />
              </div>
              <span className="font-black text-lg text-gray-800">训练</span>
              <span className="text-sm font-bold text-gray-500 mt-1">(60币)</span>
              <span className="text-sm text-green-500 font-black mt-2 bg-green-100 px-3 py-1 rounded-full">+80 EXP</span>
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleInteract('高阶特训', 150, 220, 'SPECIAL_TRAIN')}
              className="flex flex-col items-center justify-center bg-white border-b-8 border-r-4 border-l-4 border-t-4 border-purple-200 rounded-[2rem] p-6 hover:border-purple-500 hover:bg-purple-50 shadow-lg group"
            >
              <div className="bg-purple-100 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform shadow-inner">
                <Star className="h-8 w-8 text-purple-500" />
              </div>
              <span className="font-black text-lg text-gray-800">特训</span>
              <span className="text-sm font-bold text-gray-500 mt-1">(150币)</span>
              <span className="text-sm text-purple-500 font-black mt-2 bg-purple-100 px-3 py-1 rounded-full">+220 EXP</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
      {/* Praise Wall Area */}
      {praises.length > 0 && (
        <div className="bg-white rounded-[2rem] p-8 shadow-xl border-b-8 border-gray-200 mt-8">
          <h3 className="text-2xl font-black text-gray-800 mb-8 flex items-center">
            <Heart className="text-red-500 mr-3 h-8 w-8 fill-current" /> 
            心里话墙 (老师的表扬)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {praises.map((praise) => (
              <motion.div 
                whileHover={{ scale: 1.05, rotate: 2 }}
                key={praise.id} 
                className={`${praise.color || 'bg-yellow-100'} p-6 rounded-[2rem] shadow-lg border-b-8 border-black/10 transform transition-transform duration-200 relative`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-4 bg-red-400/40 rounded-full shadow-inner"></div>
                <p className="text-gray-800 font-bold leading-relaxed whitespace-pre-wrap text-base pt-3">
                  {praise.content}
                </p>
                <div className="mt-4 text-right text-sm text-gray-600 font-black">
                  — {new Date(praise.created_at).toLocaleDateString()}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Points Detail Modal */}
      {showRecords && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden border-8 border-gray-100"
          >
            <div className="px-8 py-6 border-b-4 border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-2xl font-black text-gray-900 flex items-center">
                <List className="h-8 w-8 mr-3 text-blue-500" /> 
                积分明细
              </h3>
              <button onClick={() => setShowRecords(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                <XCircle className="h-8 w-8" />
              </button>
            </div>
            <div className="overflow-y-auto p-8">
              {records.length === 0 ? (
                <div className="text-center text-gray-500 py-12 font-bold text-lg">暂无积分记录</div>
              ) : (
                <div className="space-y-4">
                  {records.map((record) => (
                    <div key={record.id} className="flex justify-between items-center p-5 bg-white rounded-[1.5rem] border-b-4 border-gray-100 shadow-sm">
                      <div>
                        <div className="font-black text-lg text-gray-800 mb-1">{record.description}</div>
                        <div className="text-sm font-bold text-gray-500">{new Date(record.created_at).toLocaleString()}</div>
                      </div>
                      <div className={`text-2xl font-black flex items-center px-4 py-2 rounded-xl ${record.amount > 0 ? 'text-green-600 bg-green-50' : 'text-orange-600 bg-orange-50'}`}>
                        {record.amount > 0 ? <ArrowUpRight className="h-6 w-6 mr-1" /> : <ArrowDownRight className="h-6 w-6 mr-1" />}
                        {Math.abs(record.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
      {/* Evolution Images Editor Modal */}
      {showEditImages && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border-8 border-purple-200"
          >
            <div className="p-6 border-b-4 border-purple-100 flex justify-between items-center bg-purple-50">
              <h2 className="text-2xl font-black text-purple-800 flex items-center">
                <ImageIcon className="w-8 h-8 mr-3 text-purple-500" />
                编辑进化外观
              </h2>
              <button 
                onClick={() => setShowEditImages(false)}
                className="p-2 hover:bg-purple-200 rounded-full transition-colors text-purple-400 hover:text-purple-600"
              >
                <XCircle className="w-8 h-8" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1">
              <p className="text-gray-500 font-bold mb-8 text-center text-lg bg-purple-50 py-3 rounded-2xl">
                为你的精灵在不同的成长阶段上传专属形象（支持 JPG/PNG/GIF 动图）
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                {[1, 2, 3, 4, 5, 6].map((level) => {
                  const stageKey = `image_stage${level}`;
                  const currentImage = editingImages[stageKey] || (level === 1 ? null : editingImages.custom_image);
                  
                  return (
                    <div key={level} className="flex flex-col items-center">
                      <div className="text-lg font-black text-purple-700 mb-3 bg-purple-100 px-4 py-1 rounded-full">
                        Lv.{level} {getEvolutionStage(level)}
                      </div>
                      
                      <label className="cursor-pointer group relative w-full aspect-square max-w-[200px]">
                        <div className={`w-full h-full rounded-[2rem] border-8 flex flex-col items-center justify-center overflow-hidden transition-all ${currentImage ? 'border-purple-500 shadow-xl bg-white' : 'border-dashed border-gray-300 hover:border-purple-400 bg-gray-50'}`}>
                          {currentImage ? (
                            <img src={currentImage} alt={`Lv.${level}`} className="w-full h-full object-cover" />
                          ) : (
                            <>
                              <Upload className="h-10 w-10 text-gray-400 group-hover:text-purple-500 mb-3" />
                              <span className="text-sm text-gray-500 group-hover:text-purple-500 font-bold">点击上传</span>
                            </>
                          )}
                        </div>
                        
                        <div className="absolute inset-0 bg-black/40 rounded-[2rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white font-bold flex flex-col items-center">
                            <Upload className="w-8 h-8 mb-2" />
                            更换图片/GIF
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

            <div className="p-6 border-t-4 border-purple-100 bg-gray-50 flex justify-end space-x-4">
              <button 
                onClick={() => setShowEditImages(false)}
                className="px-8 py-3 rounded-[1.5rem] font-bold text-gray-600 hover:bg-gray-200 transition-colors border-4 border-transparent"
              >
                取消
              </button>
              <button 
                onClick={handleSaveImages}
                disabled={savingImages}
                className="px-8 py-3 rounded-[1.5rem] font-black text-white bg-purple-500 hover:bg-purple-600 transition-colors border-b-4 border-purple-700 shadow-lg disabled:opacity-50"
              >
                {savingImages ? '保存中...' : '保存外观'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
