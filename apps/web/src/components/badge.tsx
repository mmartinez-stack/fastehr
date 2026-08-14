import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Stub component, folded in from the former `@fastehr/ui` package. App-local
 * components are the convention from here on (shadcn style); a package boundary
 * returns only if a second consumer actually appears.
 */
export type BadgeProps = ComponentProps<'span'>

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium',
        'bg-secondary text-secondary-foreground',
        className,
      )}
      {...props}
    />
  )
}
