import { Lock } from 'lucide-react';
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

/**
 * Visibility badge that a company_advanced user can click to flip a field between
 * Public and Internal. `locked` fields are required-public by regulation and render
 * a non-interactive "Public · required" badge. Without `canEdit` it is read-only
 * (same look as FieldVisibilityBadge).
 * @param {{
 *   value: 'public' | 'internal',
 *   onChange?: (v: 'public' | 'internal') => void,
 *   locked?: boolean,
 *   canEdit?: boolean
 * }} props
 */
export function EditableVisibilityBadge({ value, onChange, locked, canEdit }) {
  if (locked) {
    return (
      <Badge
        tone="green"
        className="gap-1 font-normal"
        title="Required to be public by regulation — cannot be hidden."
      >
        <Lock className="h-3 w-3" />
        Public · required
      </Badge>
    );
  }

  const isPublic = value === 'public';

  if (!canEdit) return <FieldVisibilityBadge visibility={value} />;

  return (
    <button
      type="button"
      onClick={() => onChange?.(isPublic ? 'internal' : 'public')}
      title={
        isPublic
          ? 'Shown on the public passport — click to make internal'
          : 'Hidden from the public passport — click to make public'
      }
      className={cn(
        'inline-flex cursor-pointer items-center rounded-full px-2.5 py-0.5 text-xs font-normal ring-1 ring-inset transition-colors',
        isPublic
          ? 'bg-brand-100 text-brand-800 ring-brand-200 hover:bg-brand-200'
          : 'bg-gray-100 text-gray-700 ring-gray-200 hover:bg-gray-200'
      )}
    >
      {isPublic ? 'Public' : 'Internal'}
    </button>
  );
}
