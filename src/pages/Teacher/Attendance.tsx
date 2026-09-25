import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CalendarCheck, CheckCircle, Clock, UserCheck, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Toolbar } from '@/components/ui/toolbar';
import { useRegisterPageCommands } from '@/app/commands/registry';
import type { SaveAttendanceRecordPayload } from '@/features/classroom/api/attendanceApi';
import { useAttendance, useSaveAttendanceMutation } from '@/features/classroom/hooks/useAttendance';
import { useLeaves, useUpdateLeaveMutation } from '@/features/classroom/hooks/useLeaves';
import { useClasses } from '@/hooks/queries/useClasses';
import { useStudents } from '@/hooks/queries/useStudents';
import { cn } from '@/lib/utils';

interface AttendanceOption {
  value: string;
  label: string;
  icon: LucideIcon;
  activeClassName: string;
}

/** The states this page records; the value is stored verbatim in `attendance_records.status`. */
const ATTENDANCE_OPTIONS: AttendanceOption[] = [
  { value: 'present', label: '出勤', icon: CheckCircle, activeClassName: 'border-role/20 bg-role/10 text-role' },
  { value: 'absent', label: '缺勤', icon: XCircle, activeClassName: 'border-danger/30 bg-danger/20 text-danger' },
  { value: 'late', label: '迟到', icon: Clock, activeClassName: 'border-warning/30 bg-warning/20 text-warning-ink' },
  { value: 'leave', label: '请假', icon: AlertCircle, activeClassName: 'border-info/30 bg-info-soft text-info-ink' },
];

const INACTIVE_STATUS_CLASS =
  'border-line-1 bg-surface-2/80 text-fg-2 backdrop-blur-xl hover:bg-surface-3/60';

/** Status labels; an unknown status keeps its own text instead of a guessed one. */
const LEAVE_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '待审批', className: 'bg-warning/20 text-warning-ink' },
  approved: { label: '已批准', className: 'bg-role/10 text-role' },
  rejected: { label: '已拒绝', className: 'bg-danger/20 text-danger' },
};

/** Today as `YYYY-MM-DD` in local time, the format `attendance_records.date` stores. */
function localDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 考勤与请假.
 *
 * Both tabs read and write the real endpoints: the roster comes from
 * `GET /api/students?classId=`, the day's marks from `GET /api/attendance?class_id=&date=`
 * and are saved with `POST /api/attendance`; leave requests come from `GET /api/leaves`
 * and are decided with `PUT /api/leaves/:id`. A student with no saved row for the chosen
 * day starts unmarked - nothing is pre-filled with an invented status, and a student left
 * unmarked is not written on save.
 */
export default function TeacherAttendance() {
  const { data: classes = [], isLoading: isClassesLoading } = useClasses();
  const [preferredClassId, setPreferredClassId] = useState<number | null>(null);
  const [currentDate, setCurrentDate] = useState(localDateString);
  const [activeTab, setActiveTab] = useState<'take' | 'leaves'>('take');
  /** Unsaved picks for the selected day, keyed by student id. */
  const [draftStatus, setDraftStatus] = useState<Record<number, string>>({});

  // The teacher's own first class is the default; no request fires until one is known.
  const selectedClassId = preferredClassId ?? classes[0]?.id ?? null;

  const { data: students = [], isLoading: isStudentsLoading } = useStudents(selectedClassId);
  const { data: attendanceRows = [], isLoading: isAttendanceLoading } = useAttendance(
    { classId: selectedClassId, date: currentDate },
    !!selectedClassId,
  );
  const { data: leaveRows = [], isLoading: isLeavesLoading } = useLeaves({}, !!selectedClassId);
  const saveAttendanceMutation = useSaveAttendanceMutation();
  const updateLeaveMutation = useUpdateLeaveMutation();

  const savedStatusByStudent = new Map<number, string>();
  for (const row of attendanceRows) {
    if (row.student_id !== null) savedStatusByStudent.set(row.student_id, row.status);
  }
  const statusOf = (studentId: number): string | null =>
    draftStatus[studentId] ?? savedStatusByStudent.get(studentId) ?? null;
  const studentNames = new Map(students.map((student) => [student.id, student.name]));
  const hasPendingLeave = leaveRows.some((row) => row.status === 'pending');

  const handleClassChange = (classId: number) => {
    setPreferredClassId(classId);
    setDraftStatus({});
  };

  const handleDateChange = (date: string) => {
    setCurrentDate(date);
    setDraftStatus({});
  };

  const handleStatusChange = (studentId: number, status: string) => {
    setDraftStatus((previous) => ({ ...previous, [studentId]: status }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedClassId) return;

    const records: SaveAttendanceRecordPayload[] = [];
    for (const student of students) {
      const status = statusOf(student.id);
      if (status) records.push({ student_id: student.id, date: currentDate, status });
    }

    if (records.length === 0) {
      toast.error('请先为学生选择考勤状态');
      return;
    }

    try {
      await saveAttendanceMutation.mutateAsync({ class_id: selectedClassId, records });
    } catch {
      // The api layer already surfaced the failure; the draft stays for a retry.
      return;
    }
    toast.success(`${currentDate} 考勤保存成功`);
  };

  const handleLeaveAction = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await updateLeaveMutation.mutateAsync({ id, payload: { status } });
    } catch {
      return;
    }
    toast.success(status === 'approved' ? '已批准请假申请' : '已拒绝请假申请');
  };

  // The page's primary action, reachable from the command palette as well as the card header.
  useRegisterPageCommands([
    {
      id: 'teacher-attendance:save',
      label: '保存今日考勤',
      icon: UserCheck,
      keywords: ['考勤', '打卡', '保存'],
      disabled: saveAttendanceMutation.isPending,
      run: () => void handleSaveAttendance(),
    },
  ]);

  return (
    <PageScaffold
      variant="list"
      title="考勤与请假"
      description={currentDate}
      actions={
        <div className="flex space-x-2 rounded-card bg-surface-3/50 p-1">
          <Button variant="ghost"
            onClick={() => setActiveTab('take')}
            className={`rounded-card px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'take' ? 'bg-surface-2/80 text-role shadow-card backdrop-blur-xl' : 'text-fg-2 hover:text-fg-1'
            }`}
          >
            考勤打卡
          </Button>
          <Button variant="ghost"
            onClick={() => setActiveTab('leaves')}
            className={`flex items-center rounded-card px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'leaves' ? 'bg-surface-2/80 text-role shadow-card backdrop-blur-xl' : 'text-fg-2 hover:text-fg-1'
            }`}
          >
            请假审批
            {hasPendingLeave && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-danger"></span>
            )}
          </Button>
        </div>
      }
      toolbar={
        classes.length > 0 ? (
          <Toolbar
            filters={
              <>
                <span className="mr-2 shrink-0 text-sm font-bold text-fg-3">选择班级:</span>
                {classes.map((cls) => (
                  <Button variant="ghost"
                    key={cls.id}
                    onClick={() => handleClassChange(cls.id)}
                    className={cn(
                      'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                      selectedClassId === cls.id
                        ? 'bg-gradient-to-r from-role to-role-ink text-role-contrast shadow-card'
                        : 'border border-line-1 bg-surface-3/50 text-fg-2 hover:bg-surface-3/60',
                    )}
                  >
                    {cls.name}
                  </Button>
                ))}
              </>
            }
          />
        ) : undefined
      }
    >

      {activeTab === 'take' && (
        <SectionCard
          title="考勤打卡"
          description="选择每个学生的状态后保存；未选择的学生不会写入考勤记录。"
          actions={
            <div className="flex items-center gap-3">
              <label htmlFor="attendance-date" className="text-sm font-medium text-fg-2">考勤日期:</label>
              <Input
                id="attendance-date"
                type="date"
                value={currentDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="rounded-card border border-line-1 px-3 py-1.5 sm:text-sm"
              />
              <Button
                onClick={handleSaveAttendance}
                disabled={saveAttendanceMutation.isPending}
                className="flex items-center rounded-card bg-gradient-to-r from-role to-role-ink px-5 py-2 font-medium text-role-contrast shadow-card transition-colors hover:from-role/90 hover:to-role-ink/90"
              >
                <UserCheck className="mr-2 h-4 w-4" />
                保存今日考勤
              </Button>
            </div>
          }
        >
          {isClassesLoading || (classes.length > 0 && (isStudentsLoading || isAttendanceLoading)) ? (
            <p className="py-8 text-center text-sm text-fg-3">加载中...</p>
          ) : classes.length === 0 ? (
            <EmptyState icon={Users} title="暂无班级数据" description="请先在班级管理中创建班级。" />
          ) : students.length === 0 ? (
            <EmptyState icon={UserCheck} title="班级暂无学生" description="请先在班级管理中添加学生。" />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {students.map(student => {
                const currentStatus = statusOf(student.id);
                return (
                  <div key={student.id} className="rounded-card border border-line-1 bg-surface-3/50 p-4 transition-shadow hover:shadow-md">
                    <h3 className="mb-3 text-lg font-bold text-fg-1">{student.name}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {ATTENDANCE_OPTIONS.map(option => {
                        const Icon = option.icon;
                        const isActive = currentStatus === option.value;
                        return (
                          <Button variant="ghost"
                            key={option.value}
                            onClick={() => handleStatusChange(student.id, option.value)}
                            aria-pressed={isActive}
                            className={cn(
                              'flex items-center justify-center rounded-card border py-2 text-sm font-medium',
                              isActive ? option.activeClassName : INACTIVE_STATUS_CLASS,
                            )}
                          >
                            <Icon className="mr-1 h-4 w-4" />
                            {option.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'leaves' && (
        <SectionCard title="请假审批">
          {isLeavesLoading ? (
            <p className="py-8 text-center text-sm text-fg-3">加载中...</p>
          ) : leaveRows.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="暂无请假申请" />
          ) : (
            <div className="space-y-4">
              {leaveRows.map(req => {
                const statusMeta = LEAVE_STATUS_META[req.status];
                return (
                  <div key={req.id} className="flex flex-col justify-between gap-4 rounded-card border border-line-1 p-5 md:flex-row md:items-center">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center space-x-3">
                        <span className="text-lg font-bold text-fg-1">
                          {studentNames.get(req.student_id) ?? `学生 #${req.student_id}`}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusMeta?.className ?? 'bg-surface-3 text-fg-2'}`}>
                          {statusMeta?.label ?? req.status}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-fg-2">
                        <p><span className="text-fg-3">请假时间：</span> {req.start_date} 至 {req.end_date}</p>
                        <p><span className="text-fg-3">请假事由：</span> {req.reason}</p>
                        {req.review_comment && (
                          <p><span className="text-fg-3">审批意见：</span> {req.review_comment}</p>
                        )}
                      </div>
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex shrink-0 space-x-3">
                        <Button variant="ghost"
                          onClick={() => handleLeaveAction(req.id, 'rejected')}
                          disabled={updateLeaveMutation.isPending}
                          className="rounded-card border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                        >
                          拒绝
                        </Button>
                        <Button variant="ghost"
                          onClick={() => handleLeaveAction(req.id, 'approved')}
                          disabled={updateLeaveMutation.isPending}
                          className="rounded-card bg-gradient-to-r from-role to-role-ink px-4 py-2 text-sm font-medium text-role-contrast shadow-card transition-colors hover:from-role/90 hover:to-role-ink/90"
                        >
                          批准
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </PageScaffold>
  );
}
