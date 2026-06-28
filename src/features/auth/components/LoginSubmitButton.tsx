import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { type RoleType, ROLE_THEME } from "./loginStyles";

interface LoginSubmitButtonProps {
  loading: boolean;
  disabled?: boolean;
  role?: RoleType;
  children: ReactNode;
}

export default function LoginSubmitButton({
  loading,
  disabled,
  role = "student",
  children,
}: LoginSubmitButtonProps) {
  const theme = ROLE_THEME[role];

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      type="submit"
      disabled={disabled || loading}
      className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl shadow-sm text-[15px] font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        backgroundColor: theme.primary,
        boxShadow: `0 4px 14px -3px ${theme.primary}44`,
      }}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        children
      )}
    </motion.button>
  );
}
