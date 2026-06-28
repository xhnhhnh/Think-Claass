import { memo } from "react";
import { type RoleType, ROLE_THEME } from "./loginStyles";

interface RoleConfig {
  key: RoleType;
  label: string;
}

const ROLES: RoleConfig[] = [
  { key: "student", label: "我是学生" },
  { key: "parent", label: "我是家长" },
  { key: "teacher", label: "我是老师" },
];

interface RoleSelectorProps {
  value: RoleType;
  onChange: (role: RoleType) => void;
}

function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="mb-8 flex justify-center space-x-1.5 rounded-lg border border-[var(--campus-border)] bg-slate-50/80 p-1.5">
      {ROLES.map((r) => {
        const theme = ROLE_THEME[r.key];
        const active = r.key === value;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => { if (r.key !== value) onChange(r.key); }}
            className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
              active
                ? "text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
            }`}
            style={active ? { backgroundColor: theme.primary } : undefined}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export default memo(RoleSelector);
