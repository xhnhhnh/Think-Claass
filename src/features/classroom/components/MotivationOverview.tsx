import { Activity, Handshake, Sprout, Trophy } from 'lucide-react';
import type { StudentMotivationSummary } from '../api/studentsApi';

export function MotivationOverview({ summary }: { summary: StudentMotivationSummary }) {
  const dimensions = [
    { label: '成长', value: summary.growth, unit: '成长值', icon: Sprout, tone: 'text-success bg-success-soft' },
    { label: '合作', value: summary.collaboration, unit: '合作分', icon: Handshake, tone: 'text-info bg-info-soft' },
    { label: '竞技', value: summary.competition, unit: '竞技分', icon: Trophy, tone: 'text-warning bg-warning-soft' },
    { label: '参与', value: summary.participation, unit: '次', icon: Activity, tone: 'text-participation bg-participation-soft' },
  ];
  return (
    <section aria-label="四维成长总览" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {dimensions.map(({ label, value, unit, icon: Icon, tone }) => (
        <div key={label} className="rounded-panel border border-line-1 bg-surface-2 p-4 shadow-card sm:p-5">
          <div className={`mb-4 flex size-10 items-center justify-center rounded-card ${tone}`}><Icon className="size-5" aria-hidden="true" /></div>
          <p className="text-sm font-medium text-fg-2">{label}</p>
          <p className="mt-1 flex items-baseline gap-1.5 font-bold tabular-nums text-fg-1"><span className="text-2xl sm:text-3xl">{value}</span><span className="text-xs font-normal text-fg-3">{unit}</span></p>
        </div>
      ))}
    </section>
  );
}
