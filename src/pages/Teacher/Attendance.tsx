import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CalendarCheck, CheckCircle, Clock, UserCheck, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
  'border-line-1 bg-surface-2 text-fg-2 hover:bg-surface-3';

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
  const { data: classes = [], isLoading: isClassesLoading, isError: isClassesError, refetch: refetchClasses } = useClasses();
  const [preferredClassId, setPreferredClassId] = useState<number | null>(null);
  const [currentDate, setCurrentDate] = useState(localDateString);
  const [activeTab, setActiveTab] = useState<'take' | 'leaves'>('take');
  /** Unsaved picks for the selected day, keyed by student id. */
  const [draftStatus, setDraftStatus] = useState<Record<number, string>>({});

  // The teacher's own first class is the default; no request fires until one is known.
  const selectedClassId = preferredClassId ?? classes[0]?.id ?? null;

  const { data: students = [], isLoading: isStudentsLoading, isError: isStudentsError, refetch: refetchStudents } = useStudents(selectedClassId);
  const {
    data: attendanceRows = [],
    isLoading: isAttendanceLoading,
    isError: isAttendanceError,
    refetch: refetchAttendance,
  } = useAttendance(
    { classId: selectedClassId, date: currentDate },
    !!selectedClassId,
  );
  const { data: leaveRows = [], isLoading: isLeavesLoading, isError: isLeavesError, refetch: refetchLeaves } = useLeaves({}, !!selectedClassId);
  const saveAttendanceMutation = useSaveAttendanceMutation();
  const updateLeaveMutation = useUpdateLeaveMutation();

  const savedStatusByStudent = new Map<number, string>();
  for (const row of attendanceRows) {
    if (row.student_id !== null) savedStatusByStudent.set(row.student_id, row.status);
  }
  const statusOf = (studentId: number): string | null =>
    draftStatus[studentId] ?? savedStatusByStudent.get(studentId) ?? null;
  const studentNames = new Map(students.map((student) => [student.id, student.name]));
  /**
   * Leave rows for the class currently selected.
   *
   * `GET /api/leaves` is scoped to the *teacher*, not to a class (the route has no class filter),
   * so it answers with pupils from every class the teacher owns. The page shows one class at a
   * time, and its name map is that class's roster - an unfiltered list rendered other-class rows as
   * 「学生 #17」 and let 批准/拒绝 act on a pupil from a class the tabs say is not selected.
   */
  const rosterStudentIds = new Set(students.map((student) => student.id));
  const classLeaveRows = leaveRows.filter(
    (row) => row.student_id !== null && rosterStudentIds.has(row.student_id),
  );
  const leaveStudentName = (studentId: number): string =>
    studentNames.get(studentId) ?? '该班学生';
  const hasPendingLeave = classLeaveRows.some((row) => row.status === 'pending');

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

  const markAllPresent = () => {
    setDraftStatus(Object.fromEntries(students.map((student) => [student.id, 'present'])));
  };

  const markedCount = students.filter((student) => statusOf(student.id)).length;
  const presentCount = students.filter((student) => statusOf(student.id) === 'present').length;

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
      description={`${currentDate} · 共 ${students.length} 人`}
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-line-1 bg-surface-3/60 p-1">
          <Button
            variant={activeTab === 'take' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => setActiveTab('take')}
          >
            考勤打卡
          </Button>
          <Button
            variant={activeTab === 'leaves' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => setActiveTab('leaves')}
          >
            请假审批
            {hasPendingLeave ? <span className="ml-0.5 size-1.5 rounded-pill bg-danger" aria-hidden="true" /> : null}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {activeTab === 'take' ? (
          <div className="overflow-hidden rounded-card border border-line-1 bg-surface-2">
            <div className="flex flex-col gap-3 border-b border-line-1 p-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-caption text-fg-3">
                  班级
                  <Select
                    value={selectedClassId ?? ''}
                    onChange={(event) => handleClassChange(Number(event.target.value))}
                    disabled={isClassesLoading || classes.length === 0}
                    className="h-9 w-44"
                  >
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1 text-caption text-fg-3">
                  考勤日期
                  <Input
                    id="attendance-date"
                    type="date"
                    value={currentDate}
                    onChange={(event) => handleDateChange(event.target.value)}
                    className="h-9 w-40"
                  />
                </label>
                <p className="pb-2 text-caption text-fg-3">
                  已标记 <span className="font-semibold text-fg-1 tabular-nums">{markedCount}</span> / {students.length} 人
                  {markedCount > 0 ? ` · 出勤 ${presentCount} 人` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllPresent}
                  disabled={students.length === 0 || saveAttendanceMutation.isPending}
                >
                  全部出勤
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraftStatus({})}
                  disabled={markedCount === 0 || saveAttendanceMutation.isPending}
                >
                  清除标记
                </Button>
                <Button
                  onClick={handleSaveAttendance}
                  disabled={saveAttendanceMutation.isPending || markedCount === 0}
                >
                  <UserCheck aria-hidden="true" />
                  {saveAttendanceMutation.isPending ? '保存中…' : '保存今日考勤'}
                </Button>
              </div>
            </div>

            {isClassesLoading || (classes.length > 0 && (isStudentsLoading || isAttendanceLoading)) ? (
              <div className="space-y-2 p-4" aria-busy="true" aria-label="正在加载考勤">
                {[0, 1, 2, 3, 4, 5].map((row) => <Skeleton key={row} className="h-11 w-full" />)}
              </div>
            ) : isClassesError || isStudentsError || isAttendanceError ? (
              <div className="px-6 py-10 text-center">
                <p className="font-semibold text-danger">考勤数据加载失败</p>
                <p className="mt-1 text-body-sm text-fg-3">这不代表没有学生或当天没有记录，请重试。</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    void refetchClasses();
                    void refetchStudents();
                    void refetchAttendance();
                  }}
                >
                  重新加载
                </Button>
              </div>
            ) : classes.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={Users} title="暂无班级数据" description="请先在班级管理中创建班级。" />
              </div>
            ) : students.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={UserCheck} title="班级暂无学生" description="请先在班级管理中添加学生。" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-line-2 bg-surface-3/40 px-4 py-2 text-caption text-fg-3">
                  <span className="flex-1">学生</span>
                  <span>考勤状态</span>
                </div>
                <div className="divide-y divide-line-2">
                  {students.map((student) => {
                    const currentStatus = statusOf(student.id);
                    return (
                      <div key={student.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                        <Avatar name={student.name} size="sm" className="hidden shrink-0 sm:flex" />
                        <span className="min-w-24 flex-1 truncate text-body font-medium text-fg-1">
                          {student.name}
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {ATTENDANCE_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const isActive = currentStatus === option.value;
                            return (
                              <Button
                                key={option.value}
                                variant="outline"
                                size="xs"
                                onClick={() => handleStatusChange(student.id, option.value)}
                                aria-pressed={isActive}
                                className={cn(
                                  'h-7 gap-1 px-2.5',
                                  isActive ? option.activeClassName : INACTIVE_STATUS_CLASS,
                                )}
                              >
                                <Icon aria-hidden="true" className="size-3.5" />
                                {option.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line-1 bg-surface-2">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-1 p-4">
              <div>
                <h2 className="text-section-title text-fg-1">请假审批</h2>
                <p className="mt-0.5 text-body-sm text-fg-3">批准或拒绝本班学生的请假申请。</p>
              </div>
              <label className="flex flex-col gap-1 text-caption text-fg-3">
                班级
                <Select
                  value={selectedClassId ?? ''}
                  onChange={(event) => handleClassChange(Number(event.target.value))}
                  disabled={isClassesLoading || classes.length === 0}
                  className="h-9 w-40"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </Select>
              </label>
            </div>
            {isStudentsLoading || isLeavesLoading ? (
              <div className="space-y-2 p-4" aria-busy="true" aria-label="正在加载请假申请">
                {[0, 1, 2].map((row) => <Skeleton key={row} className="h-20 w-full" />)}
              </div>
            ) : isStudentsError || isLeavesError ? (
              <div className="px-6 py-10 text-center">
                <p className="font-semibold text-danger">请假记录加载失败</p>
                <p className="mt-1 text-body-sm text-fg-3">这不代表没有请假申请，请重试。</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    void refetchStudents();
                    void refetchLeaves();
                  }}
                >
                  重新加载
                </Button>
              </div>
            ) : classLeaveRows.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={CalendarCheck} title="暂无请假申请" />
              </div>
            ) : (
              <div className="divide-y divide-line-2">
                {classLeaveRows.map((req) => {
                  const statusMeta = LEAVE_STATUS_META[req.status];
                  return (
                    <div key={req.id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-center gap-2.5">
                          <span className="text-body font-semibold text-fg-1">{leaveStudentName(req.student_id)}</span>
                          <span className={cn('rounded-pill px-2 py-0.5 text-caption font-medium', statusMeta?.className ?? 'bg-surface-3 text-fg-2')}>
                            {statusMeta?.label ?? req.status}
                          </span>
                        </div>
                        <div className="space-y-0.5 text-body-sm text-fg-2">
                          <p><span className="text-fg-3">请假时间：</span>{req.start_date} 至 {req.end_date}</p>
                          <p><span className="text-fg-3">请假事由：</span>{req.reason}</p>
                          {req.review_comment ? (
                            <p><span className="text-fg-3">审批意见：</span>{req.review_comment}</p>
                          ) : null}
                        </div>
                      </div>
                      {req.status === 'pending' ? (
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLeaveAction(req.id, 'rejected')}
                            disabled={updateLeaveMutation.isPending}
                            className="text-danger"
                          >
                            拒绝
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleLeaveAction(req.id, 'approved')}
                            disabled={updateLeaveMutation.isPending}
                          >
                            批准
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </PageScaffold>
  );
}
