import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Card surface.
 *
 * The console's default card is a **border, not a shadow**: a page full of
 * `shadow-card` boxes reads as a stack of floating widgets, while the workbench
 * language this product is converging on uses one hairline surface and lets spacing
 * do the grouping. Elevation is reserved for things that actually float (dialog,
 * sheet, popover).
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-card border border-line-1 bg-surface-2 py-4 text-sm text-fg-1 has-[[data-slot=card-footer]]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-[[data-slot=card-footer]]:pb-0 [&>img:first-child]:rounded-t-card [&>img:last-child]:rounded-b-card",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header grid auto-rows-min items-start gap-1 rounded-t-card px-4 group-data-[size=sm]/card:px-3 has-[[data-slot=card-action]]:grid-cols-[1fr_auto] has-[[data-slot=card-description]]:grid-rows-[auto_auto] [&.border-b]:pb-4 group-data-[size=sm]/card:[&.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-card-title text-fg-1",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-body-sm text-fg-3", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-card border-t border-line-2 bg-surface-3/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
