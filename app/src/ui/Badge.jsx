import { cn } from '@/lib/cn';

const TONE_CLASSES = {
  green: 'bg-brand-100 text-brand-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  gray: 'bg-gray-100 text-gray-700',
  red: 'bg-red-100 text-red-700'
};

/**
 * @param {{ tone?: keyof typeof TONE_CLASSES, className?: string }
 *   & React.HTMLAttributes<HTMLSpanElement>} props
 */
export function Badge({ tone = 'gray', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  );
}

/**
 * Maps a lifecycle/status string to a colored badge.
 * Covers DPPStatus, ProductStatus, ESPRComplianceStatus, etc.
 */
const STATUS_TONE = {
  published: 'green',
  compliant: 'green',
  active: 'green',
  approved: 'green',
  in_review: 'blue',
  'in review': 'blue',
  draft: 'gray',
  internal: 'gray',
  archived: 'gray',
  inactive: 'gray',
  pending: 'amber',
  non_compliant: 'red',
  invalid: 'red'
};

/** @param {{ status?: string | null }} props */
export function StatusBadge({ status }) {
  if (!status) return null;
  const key = status.toLowerCase();
  const tone = STATUS_TONE[key] ?? 'gray';
  const label = status.replace(/_/g, ' ');
  return (
    <Badge tone={tone}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  );
}

/**
 * Public / Internal visibility badge — mirrors the consumer-DTO field filtering.
 * @param {{ visibility: 'public' | 'internal' }} props
 */
export function FieldVisibilityBadge({ visibility }) {
  return (
    <Badge tone={visibility === 'public' ? 'green' : 'gray'} className="font-normal">
      {visibility === 'public' ? 'Public' : 'Internal'}
    </Badge>
  );
}
