import type { ComponentProps, ReactNode } from 'react';
import { cn } from './utils';

/** A labelled control with room for a hint, used by every form in the app. */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <small className="text-[11px] text-muted-foreground/80">{hint}</small>}
    </label>
  );
}

export function SectionHeading({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 text-sm font-semibold', className)} {...props} />;
}
