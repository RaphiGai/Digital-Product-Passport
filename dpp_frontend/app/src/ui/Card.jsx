import { cn } from '@/lib/cn';

/** @param {React.HTMLAttributes<HTMLDivElement>} props */
export function Card({ className, ...props }) {
  return (
    <div
      className={cn('rounded-2xl border border-black/5 bg-card p-5 shadow-sm', className)}
      {...props}
    />
  );
}

/** @param {React.HTMLAttributes<HTMLHeadingElement>} props */
export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-base font-semibold text-ink', className)} {...props} />;
}

/** @param {React.HTMLAttributes<HTMLParagraphElement>} props */
export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-ink-muted', className)} {...props} />;
}
