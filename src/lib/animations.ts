import { designTokens } from './design-tokens'
import { EASE_SMOOTH, EASE_BOUNCE } from './motion'

// Animation presets for consistent motion design
export const animations = {
  // Fade animations
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { 
      duration: 0.25,
      ease: EASE_SMOOTH
    }
  },
  
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { 
      duration: 0.35,
      ease: EASE_BOUNCE
    }
  },
  
  fadeInDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { 
      duration: 0.35,
      ease: EASE_BOUNCE
    }
  },
  
  // Scale animations
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { 
      duration: 0.25,
      ease: EASE_SMOOTH
    }
  },
  
  scaleInBounce: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
    transition: { 
      duration: 0.4,
      ease: EASE_BOUNCE
    }
  },
  
  // Slide animations
  slideInLeft: {
    initial: { opacity: 0, x: -30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 30 },
    transition: { 
      duration: 0.35,
      ease: EASE_SMOOTH
    }
  },
  
  slideInRight: {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -30 },
    transition: { 
      duration: 0.35,
      ease: EASE_SMOOTH
    }
  },
  
  // Command center specific animations
  commandPulse: {
    animate: {
      scale: [1, 1.05, 1],
      opacity: [1, 0.8, 1]
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut" as const
    }
  },
  
  commandGlow: {
    animate: {
      boxShadow: [
        '0 0 20px rgb(59 130 246 / 0.3)',
        '0 0 30px rgb(59 130 246 / 0.5)',
        '0 0 20px rgb(59 130 246 / 0.3)'
      ]
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut" as const
    }
  },
  
  // Loading animations
  spin: {
    animate: { rotate: 360 },
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear" as const
    }
  },
  
  pulse: {
    animate: { opacity: [1, 0.5, 1] },
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut" as const
    }
  },
  
  // Stagger animations for lists
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
  },
  
  staggerItem: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { 
      duration: 0.35,
      ease: EASE_SMOOTH
    }
  },
  
  // Hover animations
  hoverScale: {
    whileHover: { 
      scale: 1.02,
      transition: { duration: 0.15 }
    },
    whileTap: { 
      scale: 0.98,
      transition: { duration: 0.1 }
    }
  },
  
  hoverLift: {
    whileHover: { 
      y: -2,
      boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.15)',
      transition: { duration: 0.2 }
    }
  },
  
  // Button press animation
  buttonPress: {
    whileTap: { 
      scale: 0.95,
      transition: { duration: 0.1 }
    }
  },
  
  // Card animations
  cardHover: {
    whileHover: {
      y: -4,
      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      transition: { duration: 0.2 }
    }
  },
  
  // Modal animations
  modalOverlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 }
  },
  
  modalContent: {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 },
    transition: { 
      duration: 0.25,
      ease: EASE_SMOOTH
    }
  },
  
  // Drawer animations
  drawerSlideIn: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: { 
      duration: 0.3,
      ease: EASE_SMOOTH
    }
  },
  
  // Toast animations
  toastSlideIn: {
    initial: { opacity: 0, x: 100, scale: 0.95 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 100, scale: 0.95 },
    transition: { 
      duration: 0.25,
      ease: EASE_SMOOTH
    }
  }
}

// CSS-in-JS animation utilities
export const cssAnimations = {
  // Keyframes for CSS animations
  keyframes: {
    fadeIn: `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
    
    slideInUp: `
      @keyframes slideInUp {
        from { 
          opacity: 0; 
          transform: translateY(20px); 
        }
        to { 
          opacity: 1; 
          transform: translateY(0); 
        }
      }
    `,
    
    spin: `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `,
    
    pulse: `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `,
    
    commandPulse: `
      @keyframes commandPulse {
        0%, 100% { 
          transform: scale(1); 
          opacity: 1; 
        }
        50% { 
          transform: scale(1.05); 
          opacity: 0.8; 
        }
      }
    `,
    
    commandGlow: `
      @keyframes commandGlow {
        0%, 100% { 
          box-shadow: 0 0 20px rgb(59 130 246 / 0.3); 
        }
        50% { 
          box-shadow: 0 0 30px rgb(59 130 246 / 0.5); 
        }
      }
    `
  },
  
  // Animation classes
  classes: {
    fadeIn: 'animate-[fadeIn_0.25s_ease-out]',
    slideInUp: 'animate-[slideInUp_0.35s_ease-out]',
    spin: 'animate-[spin_1s_linear_infinite]',
    pulse: 'animate-[pulse_1.5s_ease-in-out_infinite]',
    commandPulse: 'animate-[commandPulse_2s_ease-in-out_infinite]',
    commandGlow: 'animate-[commandGlow_2s_ease-in-out_infinite]'
  }
}

// Transition utilities
export const transitions = {
  // Common transition combinations
  smooth: `transition-all duration-${designTokens.animation.duration.normal} ease-${designTokens.animation.easing.smooth}`,
  fast: `transition-all duration-${designTokens.animation.duration.fast} ease-${designTokens.animation.easing.out}`,
  slow: `transition-all duration-${designTokens.animation.duration.slow} ease-${designTokens.animation.easing.inOut}`,
  
  // Specific property transitions
  colors: `transition-colors duration-${designTokens.animation.duration.normal} ease-${designTokens.animation.easing.out}`,
  transform: `transition-transform duration-${designTokens.animation.duration.normal} ease-${designTokens.animation.easing.command}`,
  opacity: `transition-opacity duration-${designTokens.animation.duration.fast} ease-${designTokens.animation.easing.out}`,
  shadow: `transition-shadow duration-${designTokens.animation.duration.normal} ease-${designTokens.animation.easing.out}`
}

// Animation hooks for React components
export const useAnimationPresets = () => {
  return {
    // Page transitions
    pageTransition: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -20 },
      transition: { duration: 0.3 }
    },
    
    // List item animations
    listItem: (index: number) => ({
      initial: { opacity: 0, x: -20 },
      animate: { opacity: 1, x: 0 },
      transition: { 
        duration: 0.3,
        delay: index * 0.1
      }
    }),
    
    // Loading states
    skeleton: {
      animate: {
        opacity: [0.5, 1, 0.5]
      },
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut" as const
      }
    }
  }
}

export type AnimationPreset = keyof typeof animations
export type CSSAnimationClass = keyof typeof cssAnimations.classes