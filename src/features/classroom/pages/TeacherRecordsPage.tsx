import { useState, useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock } from 'lucide-react';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { Select } from '@/components/ui/select';

interface ScoreRecord {
  id: number;
  student_name: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

/** Filter labels and the values they filter by - the copy is unchanged from the `<select>`. */
const FILTER_OPTIONS = [
  { value: 'ALL', label: '全部记录' },
  { value: 'BUY_ITEM', label: '商城兑换' },
  { value: 'FEED_PET', label: '宠物互动' },
  { value: 'TRAIN', label: '宠物训练' },
  { value: 'SPECIAL_TRAIN', label: '特训' },
  { value: 'BUY_TOY', label: '购买玩具' },
  { value: 'ADD_POINTS', label: '表现加分' },
  { value: 'DEDUCT_POINTS', label: '违规扣分' },
];

/**
 * Type → chip. The table used to pick its colours with a nested ternary of four
 * `bg-*-100 text-*-800` pairs, which is where the page's purple/blue/indigo came from.
 * The tone now comes from `Badge`'s enum, and the label from one lookup instead of two
 * parallel chains that had to be kept in the same order by hand.
 */
const TYPE_META: Record<string, { label: string; variant: 'info' | 'success' | 'warning' | 'destructive' }> = {
  BUY_ITEM: { label: '商城兑换', variant: 'info' },
  FEED_PET: { label: '喂食宠物', variant: 'success' },
  TRAIN: { label: '基础训练', variant: 'success' },
  SPECIAL_TRAIN: { label: '高阶特训', variant: 'success' },
  BUY_TOY: { label: '购买玩具', variant: 'success' },
  ADD_POINTS: { label: '表现加分', variant: 'success' },
  DEDUCT_POINTS: { label: '违规扣分', variant: 'destructive' },
};

/**
 * 积分与兑换记录.
 *
 * `ScoreRecord`, not `Record`: the row interface used to shadow the built-in
 * utility type, which the generic `DataTableColumn<Record>` cannot tolerate.
 */
export default function TeacherRecords() {
  const [records, setRecords] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');

  const fetchRecords = async () => {
    try {
      const data = await studentsApi.getRecords({});
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

  const columns: Array<DataTableColumn<ScoreRecord>> = [
    {
      key: 'created_at',
      header: '时间',
      className: 'text-ink-3',
      render: (record) => new Date(record.created_at).toLocaleString(),
    },
    {
      key: 'student_name',
      header: '学生',
      className: 'font-medium text-ink-1',
    },
    {
      key: 'type',
      header: '类型',
      render: (record) => {
        const meta = TYPE_META[record.type];
        return <Badge variant={meta?.variant ?? 'warning'}>{meta?.label ?? record.type}</Badge>;
      },
    },
    {
      key: 'description',
      header: '描述',
      className: 'text-ink-3',
    },
    {
      key: 'amount',
      header: '积分变动',
      render: (record) => (
        <div className={`flex items-center font-medium ${record.amount > 0 ? 'text-primary' : 'text-destructive'}`}>
          {record.amount > 0 ? (
            <ArrowUpRight aria-hidden="true" className="mr-1 h-4 w-4" />
          ) : (
            <ArrowDownRight aria-hidden="true" className="mr-1 h-4 w-4" />
          )}
          {Math.abs(record.amount)}
        </div>
      ),
    },
  ];

  return (
    <SectionCard
      title={
        <span className="flex items-center">
          <Clock aria-hidden="true" className="mr-2 h-5 w-5 text-ink-3" />
          近期积分与兑换记录
        </span>
      }
      actions={
        <Select
          aria-label="筛选记录类型"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          wrapperClassName="w-40"
        >
          {FILTER_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      }
    >
      <DataTable<ScoreRecord>
        columns={columns}
        rows={filteredRecords}
        getRowKey={(record) => record.id}
        isLoading={loading}
        rowClassName={() => 'hover:bg-muted/50'}
        empty={
          <EmptyState
            icon={Clock}
            title="暂无记录"
            description="当前筛选条件下没有积分或兑换记录"
            className="bg-paper"
          />
        }
      />
    </SectionCard>
  );
}
