import { type InputHTMLAttributes } from "react";
import { type LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Text field with a leading icon.
 *
 * No `role` prop any more: the role's palette comes from the `theme-<role>` class on
 * the page wrapper, so `border-ring`/`ring-ring` below resolve to the chosen role's
 * colour without this component knowing what a role is. That prop was one of the
 * three places `ROLE_THEME` was copied into.
 */
interface LoginInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: LucideIcon;
}

export default function LoginInput({ icon: Icon, className = "", ...props }: LoginInputProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
        <Icon aria-hidden="true" className="size-4 text-ink-3" />
      </div>
      <Input {...props} className={cn("h-12 rounded-lg bg-paper pl-11 text-base", className)} />
    </div>
  );
}
