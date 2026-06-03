import { cn } from '@/lib/cn';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  outline: 'border border-gray-300 bg-white text-ink hover:bg-gray-50',
  danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  ghost: 'text-ink hover:bg-gray-100'
};

const SIZES = {
  sm: 'h-8 px-3',
  md: 'h-10 px-4',
  lg: 'h-11 px-5'
};

/**
 * @param {{ variant?: keyof typeof VARIANTS, size?: keyof typeof SIZES, className?: string }
 *   & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({ variant = 'primary', size = 'md', className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}
