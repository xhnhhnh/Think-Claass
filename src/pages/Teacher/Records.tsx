import { useState, useEffect } from 'react';
import { Clock, CheckCircle2, ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface Record {
  id: number;
  student_name: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

export default function TeacherRecords() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');

  const fetchRecords = async () => {
    try {
      const res = await fetch('/api/students/records');
      const data = await res.json();
      if (data.success) {
        setRecords(data.records);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const filteredRecords = records.filter(record => filterType === 'ALL' || record.type === filterType);

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 overflow-hidden">
      <div className="px-6 py-5 border-b border-white/60 bg-slate-50/50 flex justify-between items-center">
        <h3 className="text-lg leading-6 font-semibold text-slate-800 flex items-center">
          <Clock className="mr-2 h-5 w-5 text-gray-400" />
          近期积分与兑换记录
        </h3>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-gray-300 rounded-2xl px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">全部记录</option>
          <option value="BUY_ITEM">商城兑换</option>
          <option value="FEED_PET">宠物互动</option>
          <option value="TRAIN">宠物训练</option>
          <option value="SPECIAL_TRAIN">特训</option>
          <option value="BUY_TOY">购买玩具</option>
          <option value="ADD_POINTS">表现加分</option>
          <option value="DEDUCT_POINTS">违规扣分</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-slate-50/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">时间</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">类型</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">描述</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">积分变动</th>
            </tr>
          </thead>
          <tbody className="bg-white/80 backdrop-blur-xl divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">加载中...</td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">暂无记录</td>
              </tr>
            ) : (
              filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {new Date(record.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">{record.student_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      record.type === 'BUY_ITEM' ? 'bg-purple-100 text-purple-800' :
                      ['FEED_PET', 'TRAIN', 'SPECIAL_TRAIN', 'BUY_TOY'].includes(record.type) ? 'bg-blue-100 text-blue-800' :
                      record.type === 'ADD_POINTS' ? 'bg-indigo-100/50 text-indigo-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {record.type === 'BUY_ITEM' ? '商城兑换' :
                       record.type === 'FEED_PET' ? '喂食宠物' :
                       record.type === 'TRAIN' ? '基础训练' :
                       record.type === 'SPECIAL_TRAIN' ? '高阶特训' :
                       record.type === 'BUY_TOY' ? '购买玩具' :
                       record.type === 'ADD_POINTS' ? '表现加分' : '违规扣分'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {record.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className={`flex items-center ${record.amount > 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                      {record.amount > 0 ? <ArrowUpRight className="mr-1 h-4 w-4" /> : <ArrowDownRight className="mr-1 h-4 w-4" />}
                      {Math.abs(record.amount)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
