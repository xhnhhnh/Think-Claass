import { Activity, Handshake, Sprout, Trophy } from 'lucide-react';

import type { StudentMotivationSummary } from '../api/studentsApi';

/**
 * The four growth dimensions.
 *
 * They are one figure band, not four floating cards: the old version added `shadow-card` and
 * a 3xl number to each tile, which made the numbers the loudest thing on the page while the
 * thing a pupil actually needs - what is due - sat below the fold.
 */
export function MotivationOverview({ summary }: { summary: StudentMotivationSummary }) {
  const dimensions = [
    { label: '成长', value: summary.growth, unit: '成长值', icon: Sprout, tone: 'bg-success-soft text-success-ink' },
    { label: '合作', value: summary.collaboration, unit: '合作分', icon: Handshake, tone: 'bg-info-soft text-info-ink' },
    { label: '竞技', value: summary.competition, unit: '竞技分', icon: Trophy, tone: 'bg-warning-soft text-warning-ink' },
    { label: '参与', value: summary.participation, unit: '次', icon: Activity, tone: 'bg-role-soft text-role-ink' },
  ];

  return (
    <section aria-label="四维成长总览" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {dimensions.map(({ label, value, unit, icon: Icon, tone }) => (
        <div key={label} className="rounded-card border border-line-1 bg-surface-2 p-4">
          <div className={`flex size-9 items-center justify-center rounded-card ${tone}`}>
            <Icon aria-hidden="true" className="size-4" />
          </div>
          <p className="mt-3 text-caption font-medium text-fg-3">{label}</p>
          <p className="mt-0.5 flex items-baseline gap-1.5 text-fg-1">
            <span className="text-metric tabular-nums">{value}</span>
            <span className="text-caption font-normal text-fg-3">{unit}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
