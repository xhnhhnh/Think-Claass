import { type ReactNode } from "react";
import { motion } from "framer-motion";

import { Card } from "@/components/ui/card";

/**
 * The card every login surface sits in (student/parent/teacher and the admin
 * console). Built on the kit's `Card` so its border, radius and surface come from
 * the tokens instead of a copy of them.
 */
export default function LoginCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-md"
    >
      <Card className="gap-0 border-border bg-paper px-6 py-10 sm:px-12">{children}</Card>
    </motion.div>
  );
}
