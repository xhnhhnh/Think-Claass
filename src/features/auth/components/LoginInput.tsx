import { type InputHTMLAttributes, type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Text field with a leading icon and an optional trailing control.
 *
 * The trailing slot exists for the password's show/hide button; it stays in the field
 * rather than beside the label because that is where a reader looks for it.
 */
interface LoginInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: LucideIcon;
  trailing?: ReactNode;
}

export default function LoginInput({ icon: Icon, trailing, className = "", ...props }: LoginInputProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
        <Icon aria-hidden="true" className="size-4 text-fg-3" />
      </div>
      <Input
        {...props}
        className={cn("h-11 rounded-lg bg-surface-2 pl-11 text-body", trailing && "pr-11", className)}
      />
      {trailing ? (
        <div className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</div>
      ) : null}
    </div>
  );
}
