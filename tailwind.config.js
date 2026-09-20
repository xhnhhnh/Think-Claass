import typography from '@tailwindcss/typography';

/**
 * Tailwind configuration.
 *
 * Everything a page needs is a token: the palette below maps `src/index.css`
 * custom properties into utility names, and a page that needs a colour, a radius,
 * an elevation or an animation picks one of those instead of writing a value.
 * `docs/design-system.md` is the contract; G20 is what enforces it.
 *
 * Two things are deliberately explicit here rather than left to Tailwind's defaults:
 *
 *   - **`fontFamily.heading`.** `card.tsx` and `dialog.tsx` have always written
 *     `font-heading`, which resolved to nothing because this key did not exist. It is
 *     the same Geist stack as the body, so making it real changes no pixels - it
 *     makes the class mean what it says.
 *   - **The animation set.** The pages were written against `tw-animate-css`, a
 *     Tailwind **v4** package: `animate-in fade-in slide-in-from-top-2` and friends
 *     compile to nothing in v3, so the modal and menu entrances have never once
 *     played. The keyframes below are the v3 implementation of the animations that
 *     are actually referenced, named after the intent (`animate-slide-in-top`)
 *     rather than after the v4 composition.
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', 'sans-serif'],
        heading: ['"Geist Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
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
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        // Status. `--success` is the brand green by design: a saved record is not a
        // different colour from a saved record in the student area.
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        /*
         * Surfaces. `--card` / `--card-foreground` / `--popover` /
         * `--popover-foreground` were declared in the stylesheet but never registered
         * here, so `bg-card`, `text-card-foreground`, `bg-popover` and
         * `text-popover-foreground` compiled to nothing: the kit's Card and Dialog
         * rendered with no background at all (G20's `unresolvedTokenUtilities`).
         */
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
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
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
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
      },
      boxShadow: {
        card: 'var(--elev-1)',
        raised: 'var(--elev-2)',
        floating: 'var(--elev-3)',
        'glow-primary': '0 0 20px 2px hsl(var(--glow-primary) / 0.5)',
        'glow-secondary': '0 0 20px 2px hsl(var(--glow-secondary) / 0.5)',
        glass: '0 4px 30px rgba(0, 0, 0, 0.1)',
      },
      backdropBlur: {
        glass: '10px',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        // The campus radius scale. `rounded-card`/`rounded-panel` are the values the
        // shell-wide overrides in `index.css` force onto `rounded-2xl`/`rounded-3xl`;
        // a page that uses the named utility looks the same with the override gone.
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        pill: 'var(--radius-pill)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        soft: 'var(--ease-out-soft)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
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
        /*
         * `animate-blob` is written in six student pages and was defined nowhere - the
         * keyframes now live in index.css and this is what makes the utility compile.
         * Its `animation-delay-*` partners are plain classes in the same file.
         */
        blob: 'blob 7s infinite',
      },
    },
  },
  plugins: [typography],
};
