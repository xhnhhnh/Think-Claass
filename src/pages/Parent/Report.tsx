import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { PieChart, TrendingUp, TrendingDown, Calendar, Award, AlertCircle, Heart, Star } from 'lucide-react';
import { toast } from 'sonner';

interface Record {
  id: number;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

export default function ParentReport() {
  const user = useStore(state => state.user);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.studentId) return;

    const fetchRecords = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/student/records?studentId=${user.studentId}`);
        const data = await res.json();
        if (data.success) {
          setRecords(data.records);
        }
      } catch (error) {
        toast.error('翻阅日记失败');
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [user?.studentId]);

  if (!user?.studentId) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100/50 p-8 text-center max-w-5xl mx-auto">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <Heart className="w-10 h-10 text-coral-400" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-3">等待宝贝加入</h2>
        <p className="text-stone-500 max-w-md">
          您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。
        </p>
      </div>
    );
  }

  // Calculate statistics
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const weeklyRecords = records.filter(r => new Date(r.created_at) >= oneWeekAgo);
  const weeklyEarned = weeklyRecords.filter(r => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const weeklySpent = weeklyRecords.filter(r => r.amount < 0).reduce((sum, r) => sum + Math.abs(r.amount), 0);
  
  const totalEarned = records.filter(r => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const totalSpent = records.filter(r => r.amount < 0).reduce((sum, r) => sum + Math.abs(r.amount), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">成长足迹</h1>
          <p className="text-stone-500 mt-2">记录宝贝每一次闪光的瞬间</p>
        </div>
        <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shadow-inner">
          <PieChart className="w-7 h-7" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center shadow-inner">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">本周收获</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-green-500">+{weeklyEarned}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-coral-50 text-coral-500 rounded-2xl flex items-center justify-center shadow-inner">
              <TrendingDown className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">本周兑换</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-coral-500">-{weeklySpent}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shadow-inner">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">累计获得</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-indigo-500">{totalEarned}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shadow-inner">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">累计使用</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-amber-500">{totalSpent}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>
      </div>

      <div className="bg-[#fffdfa] rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 overflow-hidden">
        <div className="px-8 py-6 border-b border-amber-50 bg-white/50 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-stone-800 tracking-wide flex items-center">
            <div className="w-8 h-8 bg-coral-50 text-coral-400 rounded-xl flex items-center justify-center mr-3">
              <Heart className="w-4 h-4" />
            </div>
            红花手账
          </h2>
        </div>
        <div className="p-8 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] relative">
          <div className="absolute inset-0 bg-gradient-to-b from-[#fffdfa]/80 to-[#fffdfa]/40 pointer-events-none"></div>
          <div className="relative z-10">
            {loading ? (
              <div className="text-center py-16 text-stone-400 font-medium tracking-widest">翻阅日记中...</div>
            ) : records.length === 0 ? (
              <div className="text-center py-16 text-stone-400">
                <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Star className="w-10 h-10 opacity-20" />
                </div>
                <p className="font-medium tracking-wide">还没有新的记录哦，期待宝贝的第一个闪光时刻</p>
              </div>
            ) : (
              <div className="space-y-4">
                {records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-5 rounded-2xl bg-white/80 backdrop-blur-sm hover:bg-white hover:shadow-md transition-all duration-300 border border-amber-50 hover:-translate-y-0.5">
                    <div className="flex items-center">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mr-5 shadow-inner ${record.amount > 0 ? 'bg-green-50 text-green-500' : 'bg-coral-50 text-coral-500'}`}>
                        {record.amount > 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="font-bold text-stone-800 text-[15px]">{record.description}</p>
                        <p className="text-xs text-stone-400 mt-1.5 font-medium tracking-wider">
                          {new Date(record.created_at).toLocaleString([], {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className={`text-2xl font-bold flex items-center ${record.amount > 0 ? 'text-green-500' : 'text-coral-500'}`}>
                      {record.amount > 0 ? '+' : ''}{record.amount}
                      <span className="text-sm font-medium ml-1.5 opacity-80">朵</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
