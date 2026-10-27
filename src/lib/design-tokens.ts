// Design tokens for Vault: Your Personal Command Center
// Command center inspired color palette and design system

export const designTokens = {
  // Color System - Command Center Theme
  colors: {
    // Primary - Command Blue (inspired by mission control)
    primary: {
      50: '#eff6ff',
      100: '#dbeafe', 
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6', // Main brand color
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554'
    },
    
    // Secondary - Command Green (success, active states)
    secondary: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
      950: '#052e16'
    },
    
    // Accent - Command Orange (warnings, highlights)
    accent: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#ea580c',
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
      950: '#431407'
    },
    
    // Neutral - Command Gray (backgrounds, text)
    neutral: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617'
    },
    
    // Semantic Colors
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    
    // Status Colors for different states
    status: {
      draft: '#94a3b8',
      active: '#22c55e',
      pending: '#f59e0b',
      completed: '#3b82f6',
      cancelled: '#ef4444',
      archived: '#6b7280'
    }
  },
  
  // Typography Scale
  typography: {
    fontFamily: {
      sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      mono: ['var(--font-geist-mono)', 'Menlo', 'Monaco', 'monospace'],
      display: ['var(--font-geist-sans)', 'system-ui', 'sans-serif']
    },
    
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem' }],
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      '5xl': ['3rem', { lineHeight: '1' }],
      '6xl': ['3.75rem', { lineHeight: '1' }]
    },
    
    fontWeight: {
      thin: '100',
      extralight: '200',
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
      black: '900'
    }
  },
  
  // Spacing Scale (based on 4px grid)
  spacing: {
    px: '1px',
    0: '0',
    0.5: '0.125rem', // 2px
    1: '0.25rem',    // 4px
    1.5: '0.375rem', // 6px
    2: '0.5rem',     // 8px
    2.5: '0.625rem', // 10px
    3: '0.75rem',    // 12px
    3.5: '0.875rem', // 14px
    4: '1rem',       // 16px
    5: '1.25rem',    // 20px
    6: '1.5rem',     // 24px
    7: '1.75rem',    // 28px
    8: '2rem',       // 32px
    9: '2.25rem',    // 36px
    10: '2.5rem',    // 40px
    11: '2.75rem',   // 44px
    12: '3rem',      // 48px
    14: '3.5rem',    // 56px
    16: '4rem',      // 64px
    20: '5rem',      // 80px
    24: '6rem',      // 96px
    28: '7rem',      // 112px
    32: '8rem',      // 128px
    36: '9rem',      // 144px
    40: '10rem',     // 160px
    44: '11rem',     // 176px
    48: '12rem',     // 192px
    52: '13rem',     // 208px
    56: '14rem',     // 224px
    60: '15rem',     // 240px
    64: '16rem',     // 256px
    72: '18rem',     // 288px
    80: '20rem',     // 320px
    96: '24rem'      // 384px
  },
  
  // Border Radius
  borderRadius: {
    none: '0',
    sm: '0.125rem',   // 2px
    DEFAULT: '0.25rem', // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    '3xl': '1.5rem',  // 24px
    full: '9999px'
  },
  
  // Shadows - Command Center inspired
  boxShadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    
    // Command center specific shadows
    command: '0 4px 20px -2px rgb(59 130 246 / 0.15)', // Blue glow
    active: '0 0 20px rgb(34 197 94 / 0.3)', // Green glow for active states
    warning: '0 0 20px rgb(245 158 11 / 0.3)', // Orange glow for warnings
    error: '0 0 20px rgb(239 68 68 / 0.3)' // Red glow for errors
  },
  
  // Animation and Transitions
  animation: {
    duration: {
      fast: '150ms',
      normal: '250ms',
      slow: '350ms',
      slower: '500ms'
    },
    
    easing: {
      linear: 'linear',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      
      // Command center specific easing
      command: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Bouncy for interactions
      smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // Smooth for transitions
    }
  },
  
  // Z-Index Scale
  zIndex: {
    hide: -1,
    auto: 'auto',
    base: 0,
    docked: 10,
    dropdown: 1000,
    sticky: 1020,
    banner: 1030,
    overlay: 1040,
    modal: 1050,
    popover: 1060,
    skipLink: 1070,
    toast: 1080,
    tooltip: 1090
  },
  
  // Breakpoints
  screens: {
    xs: '475px',
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px'
  }
} as const

// Component-specific design tokens
export const componentTokens = {
  // Button variants
  button: {
    sizes: {
      xs: {
        height: '1.5rem',
        padding: '0 0.5rem',
        fontSize: '0.75rem'
      },
      sm: {
        height: '2rem',
        padding: '0 0.75rem',
        fontSize: '0.875rem'
      },
      md: {
        height: '2.5rem',
        padding: '0 1rem',
        fontSize: '0.875rem'
      },
      lg: {
        height: '3rem',
        padding: '0 1.5rem',
        fontSize: '1rem'
      },
      xl: {
        height: '3.5rem',
        padding: '0 2rem',
        fontSize: '1.125rem'
      }
    }
  },
  
  // Card variants
  card: {
    variants: {
      default: {
        background: 'white',
        border: designTokens.colors.neutral[200],
        shadow: designTokens.boxShadow.sm
      },
      elevated: {
        background: 'white',
        border: 'transparent',
        shadow: designTokens.boxShadow.lg
      },
      command: {
        background: 'white',
        border: designTokens.colors.primary[200],
        shadow: designTokens.boxShadow.command
      }
    }
  },
  
  // Input variants
  input: {
    states: {
      default: {
        border: designTokens.colors.neutral[300],
        background: 'white',
        text: designTokens.colors.neutral[900]
      },
      focus: {
        border: designTokens.colors.primary[500],
        background: 'white',
        shadow: designTokens.boxShadow.command
      },
      error: {
        border: designTokens.colors.error,
        background: 'white',
        shadow: designTokens.boxShadow.error
      },
      disabled: {
        border: designTokens.colors.neutral[200],
        background: designTokens.colors.neutral[50],
        text: designTokens.colors.neutral[400]
      }
    }
  }
}

export type DesignTokens = typeof designTokens
export type ComponentTokens = typeof componentTokens