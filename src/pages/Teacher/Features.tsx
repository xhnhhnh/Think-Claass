import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { apiPut } from "@/lib/api";

interface ClassItem {
  id: number;
  name: string;
  settings: string | null;
}

export default function TeacherFeatures() {
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState<number | null>(null);
  const [features, setFeatures] = useState({
    enableShop: true,
    enablePets: true,
    enableRecords: true,
  });

  useEffect(() => {
    fetch('/api/classes')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.classes && data.classes.length > 0) {
          setClasses(data.classes);
          setClassId(data.classes[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Update features when selected class changes
  useEffect(() => {
    if (!classId) return;
    const selectedClass = classes.find(c => c.id === classId);
    if (selectedClass && selectedClass.settings) {
      try {
        const parsed = JSON.parse(selectedClass.settings);
        setFeatures((prev) => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('解析设置失败:', e);
      }
    } else {
      // Default features if no settings
      setFeatures({
        enableShop: true,
        enablePets: true,
        enableRecords: true,
      });
    }
  }, [classId, classes]);

  const handleToggle = (key: keyof typeof features) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!classId) return;
    try {
      const data = await apiPut(`/api/classes/${classId}/settings`, { settings: JSON.stringify(features) });
      if (data.success) {
        toast.success('设置已保存');
        // Update local class settings
        setClasses(classes.map(c => c.id === classId ? { ...c, settings: JSON.stringify(features) } : c));
      } else {
        toast.error('保存失败: ' + (data.message || '未知错误'));
      }
    } catch (e) {
      toast.error('网络错误，保存失败');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-500">加载中...</div>;
  }

  if (classes.length === 0) {
    return <div className="text-center py-12 text-slate-500">请先在主控台创建班级</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Class Tabs */}
      <div className="flex flex-col space-y-3 pb-2">
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
          <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">班级:</span>
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setClassId(cls.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                classId === cls.id
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                  : 'bg-white/80 backdrop-blur-xl text-slate-600 border border-gray-200 hover:bg-slate-50/50'
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <h2 className="text-xl font-bold text-slate-800 mb-6">功能开关</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50/50 transition-colors">
            <div>
              <h3 className="font-bold text-slate-800">商品兑换</h3>
              <p className="text-sm text-slate-500">开启后学生可以使用积分兑换商品</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={features.enableShop} onChange={() => handleToggle('enableShop')} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 backdrop-blur-xl after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50/50 transition-colors">
            <div>
              <h3 className="font-bold text-slate-800">宠物系统</h3>
              <p className="text-sm text-slate-500">开启后学生可以喂养和升级宠物</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={features.enablePets} onChange={() => handleToggle('enablePets')} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 backdrop-blur-xl after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-xl hover:bg-slate-50/50 transition-colors">
            <div>
              <h3 className="font-bold text-slate-800">兑换记录</h3>
              <p className="text-sm text-slate-500">开启后学生可以查看自己的兑换记录</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={features.enableRecords} onChange={() => handleToggle('enableRecords')} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 backdrop-blur-xl after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
            </label>
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <button 
            onClick={handleSave} 
            className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-cyan-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
