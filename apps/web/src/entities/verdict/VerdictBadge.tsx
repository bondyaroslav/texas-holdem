import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
// Mirrors the protocol's verdict/severity unions; entities stay independent of the protocol layer.
export type Verdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
export type LeakSeverity = 'minor' | 'moderate' | 'major';

type Status = 'good' | 'warning' | 'serious' | 'critical';

const VERDICT_STATUS: Readonly<Record<Verdict, Status>> = {
  best: 'good',
  good: 'good',
  inaccuracy: 'warning',
  mistake: 'serious',
  blunder: 'critical',
};

// Chess-style annotation marks: the verdict never rests on colour alone.
const VERDICT_ICON: Readonly<Record<Verdict, string>> = {
  best: '★',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

const SEVERITY_STATUS: Readonly<Record<LeakSeverity, Status>> = {
  minor: 'warning',
  moderate: 'serious',
  major: 'critical',
};

const SEVERITY_ICON: Readonly<Record<LeakSeverity, string>> = {
  minor: '!',
  moderate: '!!',
  major: '!!!',
};

function StatusChip({
  status,
  icon,
  label,
}: {
  status: Status;
  icon: string;
  label: string;
}): JSX.Element {
  return (
    <span className="chip status-chip" style={{ borderLeftColor: `var(--status-${status})` }}>
      <span aria-hidden="true" className="font-black" style={{ color: `var(--status-${status})` }}>
        {icon}
      </span>
      {label}
    </span>
  );
}

export function VerdictBadge({ verdict }: { readonly verdict: Verdict }): JSX.Element {
  const { t } = useTranslation();
  return (
    <StatusChip
      status={VERDICT_STATUS[verdict]}
      icon={VERDICT_ICON[verdict]}
      label={t(`verdict.${verdict}`)}
    />
  );
}

export function SeverityBadge({ severity }: { readonly severity: LeakSeverity }): JSX.Element {
  const { t } = useTranslation();
  return (
    <StatusChip
      status={SEVERITY_STATUS[severity]}
      icon={SEVERITY_ICON[severity]}
      label={t(`severity.${severity}`)}
    />
  );
}
