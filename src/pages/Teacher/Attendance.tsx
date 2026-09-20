import { useState } from 'react';
import { CalendarCheck, CheckCircle, XCircle, Clock, Search, UserCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      <div className="flex justify-between items-center bg-paper/80 backdrop-blur-xl p-4 rounded-card shadow-card border border-white/60">
        <div className="flex items-center space-x-2">
          <CalendarCheck className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-bold text-ink-1">考勤与请假</h2>
        </div>
        
        <div className="flex space-x-2 bg-muted/50 p-1 rounded-card">
          <Button variant="ghost"
            onClick={() => setActiveTab('take')}
            className={`px-4 py-1.5 text-sm font-medium rounded-card transition-colors ${
              activeTab === 'take' ? 'bg-paper/80 backdrop-blur-xl text-primary shadow-card' : 'text-ink-2 hover:text-ink-1'
            }`}
          >
            考勤打卡
          </Button>
          <Button variant="ghost"
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-1.5 text-sm font-medium rounded-card transition-colors flex items-center ${
              activeTab === 'leaves' ? 'bg-paper/80 backdrop-blur-xl text-primary shadow-card' : 'text-ink-2 hover:text-ink-1'
            }`}
          >
            请假审批
            {leaveRequests.some(r => r.status === 'pending') && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-destructive"></span>
            )}
          </Button>
        </div>
      </div>

      {activeTab === 'take' && (
        <div className="bg-paper/80 backdrop-blur-xl rounded-card shadow-card border border-white/60 p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-ink-2">考勤日期:</label>
              <Input 
                type="date" 
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="border-input rounded-card py-1.5 px-3 border focus:ring-ring focus:border-ring sm:text-sm"
              />
            </div>
            <Button
              onClick={handleSaveAttendance}
              className="px-5 py-2 bg-gradient-to-r from-primary to-cyan-500 text-white rounded-card hover:from-primary/90 hover:to-cyan-600 transition-colors shadow-card font-medium flex items-center"
            >
              <UserCheck className="w-4 h-4 mr-2" />
              保存今日考勤
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {students.map(student => (
              <div key={student.id} className="p-4 border border-white/60 rounded-card hover:shadow-md transition-shadow bg-muted/50">
                <h3 className="font-bold text-ink-1 text-lg mb-3">{student.name}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost"
                    onClick={() => handleStatusChange(student.id, 'present')}
                    className={`flex items-center justify-center py-2 rounded-card text-sm font-medium border ${
                      attendance[student.id] === 'present' 
                        ? 'bg-primary/10 border-primary/20 text-primary' 
                        : 'bg-paper/80 backdrop-blur-xl border-border text-ink-2 hover:bg-muted/60'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    出勤
                  </Button>
                  <Button variant="ghost"
                    onClick={() => handleStatusChange(student.id, 'absent')}
                    className={`flex items-center justify-center py-2 rounded-card text-sm font-medium border ${
                      attendance[student.id] === 'absent' 
                        ? 'bg-destructive/20 border-destructive/30 text-destructive' 
                        : 'bg-paper/80 backdrop-blur-xl border-border text-ink-2 hover:bg-muted/60'
                    }`}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    缺勤
                  </Button>
                  <Button variant="ghost"
                    onClick={() => handleStatusChange(student.id, 'late')}
                    className={`flex items-center justify-center py-2 rounded-card text-sm font-medium border ${
                      attendance[student.id] === 'late' 
                        ? 'bg-warning/20 border-orange-200 text-orange-700' 
                        : 'bg-paper/80 backdrop-blur-xl border-border text-ink-2 hover:bg-muted/60'
                    }`}
                  >
                    <Clock className="w-4 h-4 mr-1" />
                    迟到
                  </Button>
                  <Button variant="ghost"
                    onClick={() => handleStatusChange(student.id, 'leave')}
                    className={`flex items-center justify-center py-2 rounded-card text-sm font-medium border ${
                      attendance[student.id] === 'leave' 
                        ? 'bg-blue-100 border-blue-200 text-blue-700' 
                        : 'bg-paper/80 backdrop-blur-xl border-border text-ink-2 hover:bg-muted/60'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 mr-1" />
                    请假
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <div className="bg-paper/80 backdrop-blur-xl rounded-card shadow-card border border-white/60 p-6">
          <h3 className="text-md font-bold text-ink-1 mb-4">请假审批</h3>
          <div className="space-y-4">
            {leaveRequests.map(req => (
              <div key={req.id} className="p-5 border border-white/60 rounded-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="font-bold text-ink-1 text-lg">{req.studentName}</span>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      req.status === 'pending' ? 'bg-warning/20 text-orange-700' :
                      req.status === 'approved' ? 'bg-primary/10 text-primary' :
                      'bg-destructive/20 text-destructive'
                    }`}>
                      {req.status === 'pending' ? '待审批' : req.status === 'approved' ? '已批准' : '已拒绝'}
                    </span>
                  </div>
                  <div className="text-sm text-ink-2 space-y-1">
                    <p><span className="text-ink-3">请假时间：</span> {req.startDate} 至 {req.endDate}</p>
                    <p><span className="text-ink-3">请假事由：</span> {req.reason}</p>
                  </div>
                </div>
                
                {req.status === 'pending' && (
                  <div className="flex space-x-3 shrink-0">
                    <Button variant="ghost"
                      onClick={() => handleLeaveAction(req.id, 'rejected')}
                      className="px-4 py-2 border border-destructive/30 text-destructive rounded-card hover:bg-destructive/10 text-sm font-medium transition-colors"
                    >
                      拒绝
                    </Button>
                    <Button variant="ghost"
                      onClick={() => handleLeaveAction(req.id, 'approved')}
                      className="px-4 py-2 bg-gradient-to-r from-primary to-cyan-500 text-white rounded-card hover:from-primary/90 hover:to-cyan-600 text-sm font-medium transition-colors shadow-card"
                    >
                      批准
                    </Button>
                  </div>
                )}
              </div>
            ))}
            
            {leaveRequests.length === 0 && (
              <div className="text-center py-12 text-ink-3 border-2 border-dashed border-border rounded-card">
                暂无请假申请
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
