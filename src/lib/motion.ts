// Shared, typed motion primitives for framer-motion v12.
//
// framer-motion types cubic-bezier easings as a fixed 4-tuple
// `[number, number, number, number]`. Array literals are inferred as `number[]`
// and therefore do not satisfy the prop types. Declaring the tuples here with an
// explicit type keeps every consumer (e.g. `@/lib/animations`) type-safe without
// `as any`.
import type { Transition, Variants } from 'framer-motion'

export type CubicBezier = [number, number, number, number]

// Common easing curves used across the design system.
export const EASE_SMOOTH: CubicBezier = [0.25, 0.46, 0.45, 0.94]
export const EASE_BOUNCE: CubicBezier = [0.34, 1.56, 0.64, 1]

// Typed transition presets returning the framer-motion `Transition` shape.
export const transition = {
  smooth: { duration: 0.25, ease: EASE_SMOOTH } as Transition,
  enter: { duration: 0.35, ease: EASE_SMOOTH } as Transition,
  bounce: { duration: 0.4, ease: EASE_BOUNCE } as Transition,
  overlay: { duration: 0.2 } as Transition,
} satisfies Record<string, Transition>

export type MotionVariants = Variants
