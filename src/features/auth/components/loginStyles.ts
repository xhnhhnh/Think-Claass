// ---- Shared login page style tokens (Campus Journey) ----

export const COLORS = {
  bg:       "#fbfaf6",
  surface:  "#ffffff",
  border:   "#e9e1d3",
  ring:     "focus:ring-emerald-700/20 focus:border-emerald-700",
  text:     "#1e293b",
  textSecondary: "#64748b",
  textMuted:     "#94a3b8",
  headline:      "#0f172a",
  errorBg:       "#fef2f2",
  successBg:     "#f0fdf4",
  white:         "#ffffff",
} as const;

export const ROLE_THEME = {
  student: {
    primary:     "#166534",
    primaryHover:"#15803d",
    ring:        "focus:ring-emerald-700/20 focus:border-emerald-700",
    shadow:      "shadow-emerald-700/10",
    text:        "text-emerald-700",
    textHover:   "hover:text-emerald-800",
    gradient:    "from-emerald-700 to-amber-500",
  },
  parent: {
    primary:     "#ea580c",
    primaryHover:"#c2410c",
    ring:        "focus:ring-orange-600/20 focus:border-orange-600",
    shadow:      "shadow-orange-600/10",
    text:        "text-orange-600",
    textHover:   "hover:text-orange-700",
    gradient:    "from-orange-500 to-emerald-600",
  },
  teacher: {
    primary:     "#0f766e",
    primaryHover:"#115e59",
    ring:        "focus:ring-teal-700/20 focus:border-teal-700",
    shadow:      "shadow-teal-700/10",
    text:        "text-teal-700",
    textHover:   "hover:text-teal-800",
    gradient:    "from-teal-700 to-sky-500",
  },
} as const;

export type RoleType = keyof typeof ROLE_THEME;

export const INPUT_BASE =
  "block w-full pl-12 pr-4 py-3 rounded-lg bg-white border border-[var(--campus-border)] focus:ring-2 focus:outline-none transition-all text-slate-800 placeholder:text-slate-400";

export const CARD_BASE =
  "bg-white py-10 px-6 shadow-sm sm:rounded-lg sm:px-12 border border-[var(--campus-border)]";
