import { memo } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The three roles a public login can be made as. */
export type RoleType = "student" | "parent" | "teacher";

/**
 * The role scope, as an attribute.
 *
 * This replaced `ROLE_THEME_CLASS`, which returned `theme-student` and friends: those
 * classes swapped the entire palette, so choosing "I am a parent" on the login screen
 * repainted the brand green orange. The role is now a single accent (`data-role` ->
 * `--role*` in `index.css`), so the page keeps the product's green for meaning and only
 * its accent moves.
 */
export const ROLE_SCOPE_ATTR: Record<RoleType, { 'data-role': RoleType }> = {
  student: { 'data-role': 'student' },
  parent: { 'data-role': 'parent' },
  teacher: { 'data-role': 'teacher' },
};

const ROLES: Array<{ key: RoleType; label: string }> = [
  { key: "student", label: "学生" },
  { key: "parent", label: "家长" },
  { key: "teacher", label: "老师" },
];

interface RoleSelectorProps {
  value: RoleType;
  onChange: (role: RoleType) => void;
}

/** Segmented role picker. The active segment uses the role accent, not a second palette. */
function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="登录身份"
      className="grid grid-cols-3 gap-1 rounded-lg border border-line-1 bg-surface-3/60 p-1"
    >
      {ROLES.map((role) => {
        const active = role.key === value;
        return (
          <Button
            key={role.key}
            type="button"
            role="tab"
            aria-selected={active}
            variant={active ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              if (!active) onChange(role.key);
            }}
            className={cn(
              "h-9 rounded-md text-body-sm font-semibold",
              active ? "bg-surface-2 text-role-ink shadow-sm" : "text-fg-3 hover:text-fg-1",
            )}
          >
            {role.label}
          </Button>
        );
      })}
    </div>
  );
}

export default memo(RoleSelector);
