import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { BarChart2, Users, Target, TrendingUp } from 'lucide-react';

interface Student {
  id: number;
  name: string;
  total_points: number;
  available_points: number;
}

interface ClassItem {
  id: number;
  name: string;
}

export default function TeacherAnalysis() {
  const user = useStore((state) => state.user);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      if (data.success) {
        setClasses(data.classes);
        if (data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents();
    }
  }, [selectedClassId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/students?classId=${selectedClassId}`);
      const data = await res.json();
      if (data.success) {
        setStudents(data.students);
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStats = () => {
    if (students.length === 0) return { avg: 0, max: 0, min: 0, total: 0 };
    const points = students.map(s => s.total_points);
    return {
      avg: (points.reduce((a, b) => a + b, 0) / points.length).toFixed(1),
      max: Math.max(...points),
      min: Math.min(...points),
      total: points.reduce((a, b) => a + b, 0)
    };
  };

  const stats = getStats();

  const getDistribution = () => {
    const dist = [
      { range: '0-50', count: 0, max: 50 },
      { range: '51-100', count: 0, max: 100 },
      { range: '101-200', count: 0, max: 200 },
      { range: '201-500', count: 0, max: 500 },
      { range: '500+', count: 0, max: Infinity }
    ];
    
    students.forEach(s => {
      const p = s.total_points;
      if (p <= 50) dist[0].count++;
      else if (p <= 100) dist[1].count++;
      else if (p <= 200) dist[2].count++;
      else if (p <= 500) dist[3].count++;
      else dist[4].count++;
    });

    return dist;
  };

  const distribution = getDistribution();
  const maxCount = Math.max(...distribution.map(d => d.count), 1);

  if (!classes.length) {
    return <div className="p-8 text-center text-slate-500">暂无班级数据，请先创建班级。</div>;
  }

  return (
    <div className="space-y-6">
      {/* Class Selector */}
      <div className="flex items-center space-x-2 overflow-x-auto bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">选择班级:</span>
        {classes.map((cls) => (
          <button
            key={cls.id}
            onClick={() => setSelectedClassId(cls.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedClassId === cls.id
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                : 'bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50'
            }`}
          >
            {cls.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">数据加载中...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center">
              <div className="p-3 bg-blue-100 rounded-xl mr-4">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-slate-500 text-sm font-medium">班级总人数</div>
                <div className="text-2xl font-bold text-slate-800">{students.length} <span className="text-sm font-normal text-slate-500">人</span></div>
              </div>
            </div>
            
            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center">
              <div className="p-3 bg-indigo-100/50 rounded-xl mr-4">
                <BarChart2 className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <div className="text-slate-500 text-sm font-medium">班级平均分</div>
                <div className="text-2xl font-bold text-slate-800">{stats.avg} <span className="text-sm font-normal text-slate-500">分</span></div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center">
              <div className="p-3 bg-purple-100 rounded-xl mr-4">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <div className="text-slate-500 text-sm font-medium">最高积分</div>
                <div className="text-2xl font-bold text-slate-800">{stats.max} <span className="text-sm font-normal text-slate-500">分</span></div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center">
              <div className="p-3 bg-orange-100 rounded-xl mr-4">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <div className="text-slate-500 text-sm font-medium">发放总积分</div>
                <div className="text-2xl font-bold text-slate-800">{stats.total} <span className="text-sm font-normal text-slate-500">分</span></div>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
              <BarChart2 className="w-5 h-5 mr-2 text-indigo-500" />
              积分分布图
            </h2>
            <div className="space-y-4">
              {distribution.map((d, i) => (
                <div key={i} className="flex items-center">
                  <div className="w-24 text-right pr-4 text-sm font-medium text-slate-600">
                    {d.range} 分
                  </div>
                  <div className="flex-1 flex items-center">
                    <div 
                      className="h-6 bg-gradient-to-r from-green-400 to-green-500 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-500 ease-out"
                      style={{ width: `${(d.count / maxCount) * 100}%`, minWidth: d.count > 0 ? '2rem' : '0' }}
                    ></div>
                    <span className="ml-3 text-sm font-bold text-slate-700">{d.count} 人</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
