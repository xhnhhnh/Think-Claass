import { cva } from "class-variance-authority"

/**
 * Button styles.
 *
 * ## The height scale is tokens now, not arbitrary Tailwind steps
 *
 * The previous version sized the control with `h-8` / `h-7` / `h-6`, which meant the
 * button and the input beside it were 32px and 36px tall respectively, and a form row
 * was visibly ragged as a result. Every size below is a `--control-h-*` token, and so is
 * every input, so a row of controls lines up by construction rather than by luck.
 *
 * `default` is 36px, which is also the touch-target floor the mobile dock needs: a
 * control smaller than that is the thing readers miss-tap on a phone.
 *
 * ## The colours are the role accent
 *
 * `default` is `bg-role`, not `bg-brand`: a button that submits a form is "the action
 * here", and which console you are in is exactly what that should look like. The
 * destructive variant is `danger`, which is a product colour - "this deletes something"
 * does not change meaning between the student area and the admin console.
 *
 * ## Tailwind 3.4 only
 *
 * `ring-3`, `not-aria-[…]` and `has-data-[…]` are Tailwind v4 spellings that compile to
 * nothing in 3.4. The v3 forms below are the ones this project can actually render, and
 * `tests/guardrails/ui-token-contract.test.ts` compiles them to prove it.
 */
export const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent",
    "text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-fast ease-soft",
    "outline-none select-none",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-role",
    "active:[&:not([aria-haspopup])]:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-danger aria-invalid:outline-danger",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-role text-role-contrast shadow-card hover:bg-role/90",
        outline:
          "border-line-1 bg-surface-2 text-fg-1 hover:border-role/40 hover:bg-role-soft hover:text-role-ink aria-expanded:bg-role-soft",
        secondary: "bg-surface-3 text-fg-1 hover:bg-surface-steel aria-expanded:bg-surface-steel",
        ghost: "text-fg-2 hover:bg-surface-3 hover:text-fg-1 aria-expanded:bg-surface-3",
        destructive: "bg-danger-soft text-danger-ink hover:bg-danger/20",
        link: "text-role underline-offset-4 hover:underline",
      },
      size: {
        default: "h-control px-3.5",
        xs: "h-control-xs rounded-xs px-2 text-xs",
        sm: "h-control-sm rounded-xs px-2.5 text-[0.8125rem]",
        lg: "h-control-lg px-5 text-[0.9375rem]",
        icon: "size-control",
        "icon-xs": "size-control-xs rounded-xs",
        "icon-sm": "size-control-sm rounded-xs",
        "icon-lg": "size-control-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
