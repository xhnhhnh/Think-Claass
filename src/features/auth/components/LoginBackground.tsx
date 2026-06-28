import { COLORS } from "./loginStyles";

export default function LoginBackground() {
  return (
    <>
      {/* Subtle dot grid pattern */}
      <div
        className="fixed inset-0 opacity-[0.04] pointer-events-none z-0"
        style={{
          backgroundImage: `radial-gradient(circle, ${COLORS.text} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Top campus accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-700 via-orange-400 to-sky-500 pointer-events-none z-0" />
    </>
  );
}
