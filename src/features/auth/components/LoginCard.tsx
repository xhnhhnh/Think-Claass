import { type ReactNode } from "react";
import { motion } from "framer-motion";

interface LoginCardProps {
  children: ReactNode;
}

export default function LoginCard({ children }: LoginCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10"
    >
      <div className="border border-[var(--campus-border)] bg-white px-6 py-10 shadow-sm sm:rounded-lg sm:px-12">
        {children}
      </div>
    </motion.div>
  );
}
