import typography from '@tailwindcss/typography';

/**
 * Tailwind configuration - the UI-R layer.
 *
 * Every colour a page is allowed to name comes from `src/index.css` and is
 * registered here; `docs/design-system.md` is the contract, `ui:audit` is what
 * measures drift. The tiers are the same three the stylesheet declares:
 *
 *   product (`brand-*`, `fg-*`, `surface-*`, `line-*`, status, `chart-*`)
 *   role accent (`role`, `role-soft`, `role-ink`, `role-contrast`)
 *   system (`radius-*`, `elev-*`, `control-h-*`, `motion-*` durations)
 *
 * Two constraints are deliberate rather than incidental:
 *
 *   - **Tailwind stays at 3.4.** No v4-only syntax (`ring-3`, `data-open:`,
 *     `animate-in`, `max-h-(--x)`) appears anywhere in the kit. The previous
 *     round of this project shipped a component layer generated for v4 and the
 *     focus rings, dialog entrances and card titles silently compiled to
 *     nothing for months; `ui:audit`'s `undefinedUtilities` is what makes that
 *     class of defect visible, and G20 compiles its list to prove it is real.
 *   - **`--role*` is not remapped per component.** A page that wants an accent
 *     asks for `bg-role`; it never branches on which role is looking.
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        lg: '2rem',
      },
    },
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', 'sans-serif'],
        heading: ['"Geist Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* --- product palette ------------------------------------------------ */
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          strong: 'hsl(var(--brand-strong))',
          soft: 'hsl(var(--brand-soft))',
          contrast: 'hsl(var(--brand-contrast))',
        },
        fg: {
          1: 'hsl(var(--fg-1))',
          2: 'hsl(var(--fg-2))',
          3: 'hsl(var(--fg-3))',
          inverse: 'hsl(var(--fg-inverse))',
        },
        surface: {
          1: 'hsl(var(--surface-1))',
          2: 'hsl(var(--surface-2))',
          3: 'hsl(var(--surface-3))',
          4: 'hsl(var(--surface-4))',
          steel: 'hsl(var(--surface-steel))',
        },
        line: {
          1: 'hsl(var(--line-1))',
          2: 'hsl(var(--line-2))',
          strong: 'hsl(var(--line-strong))',
        },

        /* --- role accent ---------------------------------------------------- */
        role: {
          DEFAULT: 'hsl(var(--role))',
          soft: 'hsl(var(--role-soft))',
          ink: 'hsl(var(--role-ink))',
          contrast: 'hsl(var(--role-contrast))',
        },

        /* --- status -------------------------------------------------------- */
        /* Three steps per status rather than one colour: a badge needs a soft
           fill and an ink that stays legible on it, and asking callers to
           build that from opacity produced the same chip in nine shades. */
        success: {
          DEFAULT: 'hsl(var(--success))',
          soft: 'hsl(var(--success-soft))',
          ink: 'hsl(var(--success-ink))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          soft: 'hsl(var(--warning-soft))',
          ink: 'hsl(var(--warning-ink))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          soft: 'hsl(var(--info-soft))',
          ink: 'hsl(var(--info-ink))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          soft: 'hsl(var(--danger-soft))',
          ink: 'hsl(var(--danger-ink))',
        },
        participation: {
          DEFAULT: 'hsl(var(--participation))',
          soft: 'hsl(var(--participation-soft))',
        },

        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },

        /* --- pre-UI-R aliases ----------------------------------------------- */
        /* These exist only so pages that have not been migrated yet keep
           rendering; they resolve to the tiers above, so a stale `bg-ink-1` and
           the new `text-fg-1` are the same colour. Deleted once `ui:audit`
           reports the last call site gone. */
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          glow: 'hsl(var(--glow-primary))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          glow: 'hsl(var(--glow-secondary))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        mutedForeground: 'hsl(var(--muted-foreground))',
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        canvas: 'hsl(var(--canvas))',
        paper: {
          DEFAULT: 'hsl(var(--paper))',
          warm: 'hsl(var(--paper-warm))',
        },
        ink: {
          1: 'hsl(var(--ink-1))',
          2: 'hsl(var(--ink-2))',
          3: 'hsl(var(--ink-3))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: {
            DEFAULT: 'hsl(var(--sidebar-primary))',
            foreground: 'hsl(var(--sidebar-primary-foreground))',
          },
          accent: {
            DEFAULT: 'hsl(var(--sidebar-accent))',
            foreground: 'hsl(var(--sidebar-accent-foreground))',
          },
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      boxShadow: {
        card: 'var(--elev-1)',
        raised: 'var(--elev-2)',
        floating: 'var(--elev-3)',
        inset: 'var(--elev-inset)',
        /* The rail and the context bar sit on the content rather than under it;
           a one-pixel directional shadow says that without a full elevation. */
        'rail-right': '1px 0 0 0 hsl(var(--line-1))',
        'bar-bottom': '0 1px 0 0 hsl(var(--line-1))',
        'dock-top': '0 -1px 0 0 hsl(var(--line-1))',
        'glow-role': '0 0 20px 2px hsl(var(--role) / 0.45)',
        'glow-primary': '0 0 20px 2px hsl(var(--glow-primary) / 0.5)',
        'glow-secondary': '0 0 20px 2px hsl(var(--glow-secondary) / 0.5)',
        glass: '0 4px 30px rgba(0, 0, 0, 0.1)',
      },
      backdropBlur: {
        glass: '10px',
      },
      borderRadius: {
        xs: 'var(--radius-sm)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        sheet: 'var(--radius-sheet)',
        pill: 'var(--radius-pill)',
      },
      /*
       * `spacing` here *extends* Tailwind's scale rather than replacing it, and that is a
       * correctness fix rather than a preference.
       *
       * `h-control` and its siblings are spacing keys, so they generate `h-*`, `min-h-*`, `w-*`
       * and `size-*` utilities. When this block replaced `theme.spacing`, Tailwind emitted the
       * project's `h-*` rules **after** its own (`h-12`, `h-auto`, `h-14`), so `.h-control` won
       * every conflict: a `Button` given `h-auto py-5` for a large padded call to action stayed
       * 36px tall, and `h-12` on a button did nothing. `tailwind-merge` cannot help either - it
       * only drops classes it knows conflict, and it does not know `h-control` is a height.
       *
       * Because this is inside `theme.extend`, the project's keys are appended after the
       * defaults: a page that names a height explicitly now gets it, and `h-control` is the
       * default rather than a ceiling.
       */
      spacing: {
        bar: 'var(--bar-h)',
        rail: 'var(--rail-w)',
        'rail-collapsed': 'var(--rail-w-collapsed)',
        dock: 'var(--dock-h)',
        'control-xs': 'var(--control-h-xs)',
        'control-sm': 'var(--control-h-sm)',
        control: 'var(--control-h)',
        'control-lg': 'var(--control-h-lg)',
      },
      maxWidth: {
        page: 'var(--page-max)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        soft: 'var(--ease-out-soft)',
        'in-soft': 'var(--ease-in-soft)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'zoom-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'zoom-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.96)' },
        },
        'slide-in-top': {
          from: { opacity: '0', transform: 'translateY(-0.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-bottom': {
          from: { opacity: '0', transform: 'translateY(0.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-0.5rem)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(0.5rem)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        /* The UI-R set, named for the intent rather than the direction of
           travel so a caller says what is arriving, not where from. */
        'enter-up': {
          from: { opacity: '0', transform: 'translateY(0.75rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'enter-down': {
          from: { opacity: '0', transform: 'translateY(-0.75rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'enter-scale': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'exit-down': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(0.5rem)' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'rail-in': {
          from: { opacity: '0', transform: 'translateX(-100%)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        /*
         * `blob` is deliberately NOT declared here.
         *
         * Its keyframes live in `index.css`, outside `@layer`, and are emitted whenever
         * the stylesheet is - which is what several student pages need, because they
         * drive decorative blobs with a plain `animate-blob` class. Declaring the
         * keyframes here as well made Tailwind emit a second, empty
         * `@keyframes blob;` rule (a string value for a `keyframes` entry produces that),
         * which esbuild then reported as a syntax error on every build.
         */
      },
      animation: {
        'fade-in': 'fade-in var(--motion-base) var(--ease-out-soft) both',
        'fade-out': 'fade-out var(--motion-fast) var(--ease-out-soft) both',
        'zoom-in': 'zoom-in var(--motion-fast) var(--ease-out-soft) both',
        'zoom-out': 'zoom-out var(--motion-fast) var(--ease-out-soft) both',
        'slide-in-top': 'slide-in-top var(--motion-base) var(--ease-out-soft) both',
        'slide-in-bottom': 'slide-in-bottom var(--motion-base) var(--ease-out-soft) both',
        'slide-in-left': 'slide-in-left var(--motion-base) var(--ease-out-soft) both',
        'slide-in-right': 'slide-in-right var(--motion-base) var(--ease-out-soft) both',
        'enter-up': 'enter-up var(--motion-base) var(--ease-out-soft) both',
        'enter-down': 'enter-down var(--motion-base) var(--ease-out-soft) both',
        'enter-scale': 'enter-scale var(--motion-fast) var(--ease-out-soft) both',
        'exit-down': 'exit-down var(--motion-fast) var(--ease-in-soft) both',
        'sheet-in': 'sheet-in var(--motion-base) var(--ease-out-soft) both',
        'rail-in': 'rail-in var(--motion-base) var(--ease-out-soft) both',
        'pop-in': 'pop-in var(--motion-fast) var(--ease-out-soft) both',
        /*
         * `animate-bar-indeterminate` is gone: it was declared for a context-bar loading
         * strip that the shell does not render (the shell version polls nothing - each
         * page owns its own query state), and a declared animation with no consumer is
         * exactly the "written and never used" debt this design system grades itself on.
         * The `Progress` component covers determinate bars, and `Skeleton` covers a
         * pending one.
         */
        blob: 'blob 7s infinite',
      },
    },
  },
  plugins: [typography],
};
