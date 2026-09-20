import { memo } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The three roles a public login can be made as. */
export type RoleType = "student" | "parent" | "teacher";

/** Role class for the wrapper that scopes the palette - see `LoginPage`. */
export const ROLE_THEME_CLASS: Record<RoleType, string> = {
  student: "theme-student",
  parent: "theme-parent",
  teacher: "theme-teacher",
};

const ROLES: Array<{ key: RoleType; label: string }> = [
  { key: "student", label: "我是学生" },
  { key: "parent", label: "我是家长" },
  { key: "teacher", label: "我是老师" },
];

interface RoleSelectorProps {
  value: RoleType;
  onChange: (role: RoleType) => void;
}

/**
 * Segmented role picker.
 *
 * The active segment used to carry `style={{ backgroundColor: theme.primary }}`;
 * it is now the kit's Button with `bg-primary`, which resolves to the role palette
 * the page wrapper sets. Three raw `<button>` elements and one inline style gone,
 * with the same visual result for all three roles.
 */
function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="mb-8 flex justify-center gap-1.5 rounded-lg border border-border bg-muted/50 p-1.5">
      {ROLES.map((role) => {
        const active = role.key === value;
        return (
          <Button
            key={role.key}
            type="button"
            variant={active ? "default" : "ghost"}
            onClick={() => {
              if (!active) onChange(role.key);
            }}
            aria-pressed={active}
            className={cn("h-10 flex-1 rounded-md text-sm", !active && "text-ink-3 hover:bg-paper/70")}
          >
            {role.label}
          </Button>
        );
      })}
    </div>
  );
}

export default memo(RoleSelector);
