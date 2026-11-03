import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const palette = {
  // Ethiopian Orthodox brand: deep liturgical green, gold, and parchment.
  ink: { DEFAULT: '#12201c', soft: '#26433a', muted: '#5c7268' },
  gold: { DEFAULT: '#c4933f', soft: '#e5c88a', deep: '#8f6820' },
  leaf: { DEFAULT: '#1f6b4f', deep: '#124531' },
  parchment: '#fbf7ef',
};

/**
 * Theme tokens are HSL triples in `src/index.css`, so every colour below can take
 * an opacity modifier (`bg-acc-blue/15`) and flips automatically between the ERP
 * light canvas (`.erp-light`) and the near-black ERP canvas (`.erp-dark`).
 */
const themed = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        ...palette,
        border: themed('border'),
        input: themed('input'),
        ring: themed('ring'),
        background: themed('background'),
        foreground: themed('foreground'),
        primary: { DEFAULT: themed('primary'), foreground: themed('primary-foreground') },
        secondary: { DEFAULT: themed('secondary'), foreground: themed('secondary-foreground') },
        destructive: { DEFAULT: themed('destructive'), foreground: themed('destructive-foreground') },
        muted: { DEFAULT: themed('muted'), foreground: themed('muted-foreground') },
        accent: { DEFAULT: themed('accent'), foreground: themed('accent-foreground') },
        card: { DEFAULT: themed('card'), foreground: themed('card-foreground') },
        popover: { DEFAULT: themed('popover'), foreground: themed('popover-foreground') },

        // The shell chrome: sidebar, its hover surface and its hairline border.
        sidebar: {
          DEFAULT: themed('sidebar'),
          foreground: themed('sidebar-foreground'),
          hover: themed('sidebar-hover'),
          muted: themed('sidebar-muted'),
          border: themed('sidebar-border'),
        },

        // Saturated accents — one per navigation family, used on icons, chips,
        // badges and the active-item bar. Brighter on the black canvas.
        acc: {
          blue: themed('acc-blue'),
          violet: themed('acc-violet'),
          emerald: themed('acc-emerald'),
          amber: themed('acc-amber'),
          rose: themed('acc-rose'),
          cyan: themed('acc-cyan'),
          gold: themed('acc-gold'),
        },
      },
      fontFamily: {
        // Noto Serif/Sans Ethiopic (webfont) render Ge'ez script on machines without Abyssinica SIL installed.
        ethiopic: ['"Noto Serif Ethiopic"', '"Abyssinica SIL"', 'serif'],
        sans: ['Inter', '"Noto Sans Ethiopic"', 'system-ui', 'sans-serif'],
        display: ['"Noto Serif Ethiopic"', '"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 10px)',
      },
      // Extra steps so a nav chip can be translucent without bracket syntax.
      opacity: { 3: '0.03', 6: '0.06', 8: '0.08', 12: '0.12', 18: '0.18', 35: '0.35', 45: '0.45' },
      boxShadow: {
        // Chrome: header, sidebar edge, floating panels.
        chrome: '0 1px 2px hsl(215 35% 20% / 0.05), 0 10px 30px -18px hsl(215 35% 20% / 0.22)',
        panel: '0 18px 48px -24px hsl(215 40% 12% / 0.35)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        'drawer-in': { from: { opacity: '0', transform: 'translateX(-100%)' }, to: { opacity: '1', transform: 'none' } },
        'veil-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'group-in': { from: { opacity: '0', transform: 'translateY(-4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.5s ease-out both',
        'drawer-in': 'drawer-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both',
        'veil-in': 'veil-in 0.18s ease-out both',
        'group-in': 'group-in 0.18s ease-out both',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
