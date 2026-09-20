import { cva } from "class-variance-authority"

/**
 * Badge styles, in Tailwind 3.4 syntax.
 *
 * `rounded-4xl` and `size-3!` are v4 spellings that compile to nothing in v3 -
 * the badges had square corners and unconstrained icons. They are now
 * `rounded-pill` and the v3 important form `!size-3`.
 */
export const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-pill border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-[[data-icon=inline-end]]:pr-1.5 has-[[data-icon=inline-start]]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:!size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        // Status. Registered as tokens in P1; before that, a page that wanted a
        // "saved" or "pending" badge invented its own emerald/amber utility, which is
        // how the off-brand palette spread.
        success: "bg-success/10 text-success [a]:hover:bg-success/20",
        warning: "bg-warning/10 text-warning [a]:hover:bg-warning/20",
        info: "bg-info/10 text-info [a]:hover:bg-info/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

