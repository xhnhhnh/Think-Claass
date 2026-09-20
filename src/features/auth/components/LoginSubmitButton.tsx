import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The primary action on a login surface.
 *
 * Was a `motion.button` with `style={{ backgroundColor: theme.primary, boxShadow:
 * ... }}` - an inline style as the *only* thing making the button the right colour
 * for the chosen role. It is now the kit's Button, so `bg-primary` resolves through
 * the role theme like every other control, and the hover lift is a transform rather
 * than a motion prop (`transition` is cheaper and does not need a mock in tests).
 */
export default function LoginSubmitButton({
  loading,
  disabled,
  children,
}: {
  loading: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      disabled={disabled || loading}
      className="h-12 w-full rounded-lg text-[15px] shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
    >
      {loading ? <Spinner label="正在登录" className="text-primary-foreground" /> : children}
    </Button>
  );
}
