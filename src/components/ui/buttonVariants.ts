import { cva } from "class-variance-authority"

/**
 * Button styles.
 *
 * Written in Tailwind **3.4** syntax. This file, and every other file in
 * `src/components/ui`, was generated for v4, where the focus ring, the press
 * feedback and the icon adjustments below compiled to nothing:
 *
 *   - `ring-3`            -> `ring-[3px]` (v3 has no width-3 ring)
 *   - `not-aria-[…]`      -> an arbitrary variant, `[&:not([aria-haspopup])]`
 *   - `has-data-[…]`      -> `has-[[data-icon=…]]`, the v3 arbitrary `has-` variant
 *   - `in-data-[…]`       -> the ancestor form `[[data-slot=…]_&]`
 *
 * G20 (`tests/guardrails/ui-design-system.test.ts`) compiles these through the
 * project's own Tailwind config, so the next v4-ism fails a test instead of
 * silently rendering nothing.
 */
export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 active:[&:not([aria-haspopup])]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm shadow-primary/10 hover:bg-primary/90 [a]:hover:bg-primary/90",
        outline:
          "border-border bg-background hover:border-primary/30 hover:bg-primary/5 hover:text-primary aria-expanded:bg-primary/5 aria-expanded:text-primary dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-[[data-icon=inline-end]]:pr-2 has-[[data-icon=inline-start]]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs [[data-slot=button-group]_&]:rounded-lg has-[[data-icon=inline-end]]:pr-1.5 has-[[data-icon=inline-start]]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [[data-slot=button-group]_&]:rounded-lg has-[[data-icon=inline-end]]:pr-1.5 has-[[data-icon=inline-start]]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-[[data-icon=inline-end]]:pr-2 has-[[data-icon=inline-start]]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] [[data-slot=button-group]_&]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] [[data-slot=button-group]_&]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

