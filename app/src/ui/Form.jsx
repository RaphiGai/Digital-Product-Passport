import { cn } from '@/lib/cn';
import { FieldVisibilityBadge, EditableVisibilityBadge } from './Badge';
import { COUNTRIES } from '@/lib/countries';
import { SIZE_GROUPS } from '@/lib/sizeCatalogue';

/**
 * Section wrapper with a title + description, matching the create-form mockups.
 * @param {{ title: string, description?: string, children: React.ReactNode }} props
 */
export function FormSection({ title, description, children }) {
  return (
    <section className="border-t border-black/5 py-6 first:border-t-0 first:pt-0">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * Label row with optional mandatory marker, Public/Internal badge and hint.
 *
 * Pass `visibilityControl` to make the badge an interactive Public/Internal toggle
 * (company_advanced edit mode); pass `visibility` for a static read-only badge.
 * @param {{
 *   label: string, htmlFor?: string, required?: boolean,
 *   visibility?: 'public' | 'internal',
 *   visibilityControl?: { value: 'public'|'internal', onChange?: (v: 'public'|'internal') => void, locked?: boolean, canEdit?: boolean },
 *   hint?: string, className?: string, children: React.ReactNode
 * }} props
 */
export function FieldRow({ label, htmlFor, required, visibility, visibilityControl, hint, className, children }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-medium text-ink">
        <span>
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
        {visibilityControl ? (
          <EditableVisibilityBadge {...visibilityControl} />
        ) : (
          visibility && <FieldVisibilityBadge visibility={visibility} />
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

const inputBase =
  'w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/8 px-3 py-2 text-sm text-ink placeholder:text-gray-400 dark:placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

/** @param {React.InputHTMLAttributes<HTMLInputElement>} props */
export function Input({ className, ...props }) {
  return <input className={cn(inputBase, className)} {...props} />;
}

/** @param {React.TextareaHTMLAttributes<HTMLTextAreaElement>} props */
export function Textarea({ className, rows = 3, ...props }) {
  return <textarea rows={rows} className={cn(inputBase, 'resize-y', className)} {...props} />;
}

/**
 * @param {{ options: { value: string, label: string }[] }
 *   & React.SelectHTMLAttributes<HTMLSelectElement>} props
 */
export function Select({ options, className, ...props }) {
  return (
    <select className={cn(inputBase, className)} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Country picker backed by the shared ISO-3166 list. Stores the ISO-2 code as value,
 * so it is a drop-in replacement for any country `<select>`/`<Input>`.
 * @param {{ placeholder?: string }
 *   & React.SelectHTMLAttributes<HTMLSelectElement>} props
 */
export function CountrySelect({ className, placeholder = 'Select country', ...props }) {
  return (
    <select className={cn(inputBase, className)} {...props}>
      <option value="">{placeholder}</option>
      {COUNTRIES.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name} ({country.code})
        </option>
      ))}
    </select>
  );
}

/**
 * Size picker backed by the shared size catalogue (grouped by Women / Men / One size).
 * Stores the full label string as its value, so it is a drop-in replacement for the old
 * free-text size `<Input>`.
 * @param {{ placeholder?: string }
 *   & React.SelectHTMLAttributes<HTMLSelectElement>} props
 */
export function SizeSelect({ className, placeholder = 'Select a size', ...props }) {
  return (
    <select className={cn(inputBase, className)} {...props}>
      <option value="">{placeholder}</option>
      {SIZE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Checkbox card used for the multi-select supply-chain roles in the mockup.
 * @param {{ checked: boolean, onChange: (v: boolean) => void, title: string, hint?: string }} props
 */
export function CheckboxCard({ checked, onChange, title, hint }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        checked ? 'border-brand-500 bg-brand-50' : 'border-gray-300 dark:border-white/15 bg-white dark:bg-white/8 hover:bg-gray-50'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand-600"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Radio-card group (product type / status / ESPR status in the mockup).
 * @template T
 * @param {{
 *   value: T, onChange: (v: T) => void,
 *   options: { value: T, label: string, hint?: string }[],
 *   columns?: number
 * }} props
 */
export function RadioCards({ value, onChange, options, columns = 2 }) {
  return (
    <div className={cn('grid gap-3', columns === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-2')}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              active ? 'border-brand-500 bg-brand-50' : 'border-gray-300 dark:border-white/15 bg-white dark:bg-white/8 hover:bg-gray-50'
            )}
          >
            <span className="block text-sm font-medium text-ink">{o.label}</span>
            {o.hint && <span className="mt-0.5 block text-xs text-ink-muted">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
