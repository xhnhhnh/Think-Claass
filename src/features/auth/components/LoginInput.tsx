import { type InputHTMLAttributes } from "react";
import { type LucideIcon } from "lucide-react";
import { type RoleType, ROLE_THEME, INPUT_BASE } from "./loginStyles";

interface LoginInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: LucideIcon;
  role?: RoleType;
}

export default function LoginInput({ icon: Icon, role = "student", className = "", ...props }: LoginInputProps) {
  const theme = ROLE_THEME[role];

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <input
        {...props}
        className={`${INPUT_BASE} ${theme.ring} ${className}`}
      />
    </div>
  );
}
