import { ArrowRight, ClipboardList } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type {
  HomeworkGradeRow,
  HomeworkSubmissionStatus,
} from '@thinkclass/contracts/domains/homework';

/** The four submission states, in the words the product uses for them. */
export const SUBMISSION_STATUS_LABEL: Record<HomeworkSubmissionStatus, string> = {
  draft: '未提交',
  submitted: '待批改',
  graded: '已批改',
  returned: '已退回',
};

/** A `YYYY-MM-DD HH:mm` in local time, or a dash when the row has no timestamp. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The badge tone for a submission state: what is waiting on a human is the loud one. */
export function submissionStatusVariant(
  status: HomeworkSubmissionStatus,
): 'success' | 'warning' | 'info' | 'secondary' {
  if (status === 'graded') return 'success';
  if (status === 'submitted') return 'warning';
  if (status === 'returned') return 'info';
  return 'secondary';
}

/**
 * 批改表（成绩单）.
 *
 * The backend already expanded the class into a grade sheet and decrypted the names
 * (`HomeworkGradeRow.student_name`), so this is a presentation component with no requests of
 * its own - the teacher's page owns the query. That split is deliberate: the same table is
 * rendered while the per-submission panel beside it loads, so a row click must not unmount the
 * table and lose the teacher's scroll position.
 *
 * `DataTable` owns the loading and empty states, and every cell is a token-coloured element.
 */
export interface GradeSheetTableProps {
  rows: HomeworkGradeRow[];
  isLoading?: boolean;
  selectedSubmissionId?: number | null;
  onSelect?: (row: HomeworkGradeRow) => void;
  /** A bridged `legacy` homework cannot be graded: the rows are shown, the action is not. */
  readOnly?: boolean;
  className?: string;
}

export function GradeSheetTable({
  rows,
  isLoading = false,
  selectedSubmissionId = null,
  onSelect,
  readOnly = false,
  className,
}: GradeSheetTableProps) {
  const columns: Array<DataTableColumn<HomeworkGradeRow>> = [
    {
      key: 'student_name',
      header: '学生',
      render: (row) => <span className="font-medium text-fg-1">{row.student_name || `学生 #${row.submission.student_id}`}</span>,
    },
    {
      key: 'status',
      header: '状态',
      render: (row) => (
        <Badge variant={submissionStatusVariant(row.submission.status)}>
          {SUBMISSION_STATUS_LABEL[row.submission.status]}
        </Badge>
      ),
    },
    {
      key: 'score',
      header: '得分',
      align: 'right',
      render: (row) => {
        const { score, total_points: total } = row.submission;
        if (score === null) return <span className="text-fg-3">— / {total}</span>;
        return (
          <span className="font-semibold text-fg-1">
            {score}
            <span className="font-normal text-fg-3"> / {total}</span>
          </span>
        );
      },
    },
    {
      key: 'submitted_at',
      header: '提交时间',
      render: (row) => <span className="text-fg-2">{formatDateTime(row.submission.submitted_at)}</span>,
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (row) => {
        if (readOnly) return <span className="text-xs text-fg-3">迁移前数据，只读</span>;
        return (
          <Button
            type="button"
            variant={row.submission.id === selectedSubmissionId ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSelect?.(row)}
          >
            {row.submission.status === 'submitted' || row.submission.status === 'draft' ? '批改' : '查看'}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        );
      },
    },
  ];

  return (
    <div data-slot="grade-sheet-table" className={cn(className)}>
      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowKey={(row) => row.submission.id}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="还没有学生"
            description="这个班级还没有可显示的学生，或者作业尚未发布。"
          />
        }
      />
    </div>
  );
}

export default GradeSheetTable;
