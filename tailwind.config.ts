import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'oklch(var(--paper-ch) / <alpha-value>)',
  			foreground: 'oklch(var(--ink-ch) / <alpha-value>)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'oklch(var(--signal-ch) / <alpha-value>)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'oklch(var(--surface-sunken-ch) / <alpha-value>)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			muted: {
  				DEFAULT: 'oklch(var(--surface-sunken-ch) / <alpha-value>)',
  				foreground: 'oklch(var(--ink-muted-ch) / <alpha-value>)'
  			},
  			accent: {
  				DEFAULT: 'oklch(var(--signal-subtle-ch) / <alpha-value>)',
  				foreground: 'var(--accent-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'oklch(var(--danger-ch) / <alpha-value>)',
  				foreground: 'var(--destructive-foreground)'
  			},
  			border: 'oklch(var(--line-ch) / <alpha-value>)',
  			input: 'oklch(var(--line-ch) / <alpha-value>)',
  			ring: 'oklch(var(--signal-ch) / <alpha-value>)',
  			paper: 'oklch(var(--paper-ch) / <alpha-value>)',
  			surface: {
  				DEFAULT: 'oklch(var(--surface-ch) / <alpha-value>)',
  				sunken: 'oklch(var(--surface-sunken-ch) / <alpha-value>)'
  			},
  			ink: {
  				DEFAULT: 'oklch(var(--ink-ch) / <alpha-value>)',
  				muted: 'oklch(var(--ink-muted-ch) / <alpha-value>)',
  				faint: 'oklch(var(--ink-faint-ch) / <alpha-value>)'
  			},
  			line: {
  				DEFAULT: 'oklch(var(--line-ch) / <alpha-value>)',
  				strong: 'oklch(var(--ink-faint-ch) / <alpha-value>)'
  			},
  			signal: {
  				DEFAULT: 'oklch(var(--signal-ch) / <alpha-value>)',
  				ink: 'oklch(var(--signal-ink-ch) / <alpha-value>)',
  				subtle: 'oklch(var(--signal-subtle-ch) / <alpha-value>)'
  			},
  			positive: 'oklch(var(--positive-ch) / <alpha-value>)',
  			caution: 'oklch(var(--caution-ch) / <alpha-value>)',
  			danger: 'oklch(var(--danger-ch) / <alpha-value>)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		/* T083: the theme's stacks. `--font-sans` / `--font-mono` compose the
  		 * next/font families with a documented system fallback in globals.css;
  		 * `--font-serif` is Georgia, a SYSTEM font (never a next/font import). */
  		fontFamily: {
  			sans: ['var(--font-sans)'],
  			mono: ['var(--font-mono)'],
  			serif: ['var(--font-serif)']
  		},
  		/* T083: the supplied theme's elevation scale, normalised. The values live
  		 * in `:root` / `.dark` so the scale can differ per theme block from one
  		 * source - the same single-source rule the colour channels follow. */
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			DEFAULT: 'var(--shadow)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
};
export default config;
