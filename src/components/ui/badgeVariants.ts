import { cva } from "class-variance-authority"

/**
 * Badge styles, in Tailwind 3.4 syntax.
 *
 * `rounded-4xl` and `size-3!` are v4 spellings that compile to nothing in v3 -
 * the badges had square corners and unconstrained icons. They are now
 * `rounded-pill` and the v3 important form `!size-3`.
 */
export const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-pill border border-transparent px-2 py-0.5 text-caption font-medium whitespace-nowrap transition-colors focus-visible:border-role focus-visible:ring-[3px] focus-visible:ring-role/25 has-[[data-icon=inline-end]]:pr-1.5 has-[[data-icon=inline-start]]:pl-1.5 aria-invalid:border-danger aria-invalid:ring-danger/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-role text-role-contrast [a]:hover:bg-role/90",
        secondary:
          "bg-surface-3 text-fg-2 [a]:hover:bg-surface-3/80",
        destructive:
          "bg-danger/10 text-danger-ink focus-visible:ring-danger/20 dark:bg-danger/20 [a]:hover:bg-danger/20",
        // Status. Registered as tokens in P1; before that, a page that wanted a
        // "saved" or "pending" badge invented its own emerald/amber utility, which is
        // how the off-brand palette spread.
        success: "bg-success-soft text-success-ink [a]:hover:bg-success-soft/80",
        warning: "bg-warning-soft text-warning-ink [a]:hover:bg-warning-soft/80",
        info: "bg-info-soft text-info-ink [a]:hover:bg-info-soft/80",
        outline:
          "border-line-1 text-fg-2 [a]:hover:bg-surface-3 [a]:hover:text-fg-1",
        ghost:
          "hover:bg-surface-3 hover:text-fg-1",
        link: "text-role-ink underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

