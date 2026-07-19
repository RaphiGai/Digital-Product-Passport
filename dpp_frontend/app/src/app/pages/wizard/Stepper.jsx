import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

const WIZARD_STEPS = ['Product model', 'Add variants', 'Bill of materials'];

/**
 * @param {{ current: number }} props  current is 1-based; lower steps render as completed.
 */
export function Stepper({ current }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {WIZARD_STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                active && 'bg-brand-600 text-white',
                done && 'bg-brand-100 text-brand-700',
                !active && !done && 'bg-gray-200 text-ink-muted'
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={active ? 'font-medium text-ink' : 'text-ink-muted'}>{s}</span>
            {n < WIZARD_STEPS.length && <span className="mx-1 h-px w-6 bg-gray-300" />}
          </li>
        );
      })}
    </ol>
  );
}
