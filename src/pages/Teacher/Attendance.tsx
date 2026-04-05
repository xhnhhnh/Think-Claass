import { useState } from 'react';
import { CalendarCheck, CheckCircle, XCircle, Clock, Search, UserCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Student {
  id: number;
  name: string;
}

interface LeaveRequest {
  id: number;
  studentName: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected';
}

export default function TeacherAttendance() {
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  
  const students: Student[] = [
    { id: 1, name: '张三' },
    { id: 2, name: '李四' },
    { id: 3, name: '王五' },
    { id: 4, name: '赵六' },
  ];

  // Attendance states: present, absent, late, leave
  const [attendance, setAttendance] = useState<Record<number, string>>({
    1: 'present',
    2: 'present',
    3: 'late',
    4: 'leave'
  });

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([
    { id: 1, studentName: '赵六', reason: '生病发烧', startDate: '2026-04-05', endDate: '2026-04-06', status: 'approved' },
    { id: 2, studentName: '李四', reason: '家里有事', startDate: '2026-04-07', endDate: '2026-04-07', status: 'pending' }
  ]);

  const [activeTab, setActiveTab] = useState<'take' | 'leaves'>('take');

  const handleStatusChange = (studentId: number, status: string) => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSaveAttendance = () => {
    toast.success(`${currentDate} 考勤保存成功`);
  };

  const handleLeaveAction = (id: number, action: 'approved' | 'rejected') => {
    setLeaveRequests(prev => prev.map(req => 
      req.id === id ? { ...req, status: action } : req
    ));
    toast.success(`已${action === 'approved' ? '批准' : '拒绝'}请假申请`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center space-x-2">
          <CalendarCheck className="h-6 w-6 text-indigo-500" />
          <h2 className="text-lg font-bold text-slate-800">考勤与请假</h2>
        </div>
        
        <div className="flex space-x-2 bg-slate-100/50 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('take')}
            className={`px-4 py-1.5 text-sm font-medium rounded-2xl transition-colors ${
              activeTab === 'take' ? 'bg-white/80 backdrop-blur-xl text-indigo-600 shadow-[0_2px_12px_rgba(0,0,0,0.03)]' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            考勤打卡
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-1.5 text-sm font-medium rounded-2xl transition-colors flex items-center ${
              activeTab === 'leaves' ? 'bg-white/80 backdrop-blur-xl text-indigo-600 shadow-[0_2px_12px_rgba(0,0,0,0.03)]' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            请假审批
            {leaveRequests.some(r => r.status === 'pending') && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-red-500"></span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'take' && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-slate-700">考勤日期:</label>
              <input 
                type="date" 
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="border-gray-300 rounded-2xl py-1.5 px-3 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <button
              onClick={handleSaveAttendance}
              className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl hover:from-indigo-600 hover:to-cyan-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium flex items-center"
            >
              <UserCheck className="w-4 h-4 mr-2" />
              保存今日考勤
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {students.map(student => (
              <div key={student.id} className="p-4 border border-white/60 rounded-2xl hover:shadow-md transition-shadow bg-slate-50/50/30">
                <h3 className="font-bold text-slate-800 text-lg mb-3">{student.name}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleStatusChange(student.id, 'present')}
                    className={`flex items-center justify-center py-2 rounded-2xl text-sm font-medium border ${
                      attendance[student.id] === 'present' 
                        ? 'bg-indigo-100/50 border-indigo-200/50 text-indigo-700' 
                        : 'bg-white/80 backdrop-blur-xl border-gray-200 text-slate-600 hover:bg-slate-50/50'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    出勤
                  </button>
                  <button
                    onClick={() => handleStatusChange(student.id, 'absent')}
                    className={`flex items-center justify-center py-2 rounded-2xl text-sm font-medium border ${
                      attendance[student.id] === 'absent' 
                        ? 'bg-red-100 border-red-200 text-red-700' 
                        : 'bg-white/80 backdrop-blur-xl border-gray-200 text-slate-600 hover:bg-slate-50/50'
                    }`}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    缺勤
                  </button>
                  <button
                    onClick={() => handleStatusChange(student.id, 'late')}
                    className={`flex items-center justify-center py-2 rounded-2xl text-sm font-medium border ${
                      attendance[student.id] === 'late' 
                        ? 'bg-orange-100 border-orange-200 text-orange-700' 
                        : 'bg-white/80 backdrop-blur-xl border-gray-200 text-slate-600 hover:bg-slate-50/50'
                    }`}
                  >
                    <Clock className="w-4 h-4 mr-1" />
                    迟到
                  </button>
                  <button
                    onClick={() => handleStatusChange(student.id, 'leave')}
                    className={`flex items-center justify-center py-2 rounded-2xl text-sm font-medium border ${
                      attendance[student.id] === 'leave' 
                        ? 'bg-blue-100 border-blue-200 text-blue-700' 
                        : 'bg-white/80 backdrop-blur-xl border-gray-200 text-slate-600 hover:bg-slate-50/50'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 mr-1" />
                    请假
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-6">
          <h3 className="text-md font-bold text-slate-800 mb-4">请假审批</h3>
          <div className="space-y-4">
            {leaveRequests.map(req => (
              <div key={req.id} className="p-5 border border-white/60 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="font-bold text-slate-800 text-lg">{req.studentName}</span>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      req.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      req.status === 'approved' ? 'bg-indigo-100/50 text-indigo-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {req.status === 'pending' ? '待审批' : req.status === 'approved' ? '已批准' : '已拒绝'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p><span className="text-gray-400">请假时间：</span> {req.startDate} 至 {req.endDate}</p>
                    <p><span className="text-gray-400">请假事由：</span> {req.reason}</p>
                  </div>
                </div>
                
                {req.status === 'pending' && (
                  <div className="flex space-x-3 shrink-0">
                    <button
                      onClick={() => handleLeaveAction(req.id, 'rejected')}
                      className="px-4 py-2 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 text-sm font-medium transition-colors"
                    >
                      拒绝
                    </button>
                    <button
                      onClick={() => handleLeaveAction(req.id, 'approved')}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl hover:from-indigo-600 hover:to-cyan-600 text-sm font-medium transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                    >
                      批准
                    </button>
                  </div>
                )}
              </div>
            ))}
            
            {leaveRequests.length === 0 && (
              <div className="text-center py-12 text-slate-500 border-2 border-dashed border-gray-200 rounded-2xl">
                暂无请假申请
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
