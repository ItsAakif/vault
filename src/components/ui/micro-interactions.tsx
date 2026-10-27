'use client'

import React from 'react'
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

// Smooth button with haptic feedback
interface SmoothButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  hapticFeedback?: boolean
}

export function SmoothButton({ 
  variant = 'default', 
  size = 'md', 
  children, 
  hapticFeedback = true,
  className,
  onClick,
  ...props 
}: SmoothButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Haptic feedback for mobile devices
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
    
    onClick?.(e)
  }

  const baseClasses = 'relative overflow-hidden rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'
  
  const variantClasses = {
    default: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-blue-500',
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500'
  }
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  }

  return (
    <motion.button
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      onClick={handleClick}
      {...props}
    >
      <motion.div
        className="absolute inset-0 bg-white opacity-0"
        whileHover={{ opacity: 0.1 }}
        transition={{ duration: 0.2 }}
      />
      {children}
    </motion.button>
  )
}

// Floating action button with magnetic effect
interface FloatingActionButtonProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  magneticStrength?: number
}

export function FloatingActionButton({ 
  children, 
  onClick, 
  className,
  magneticStrength = 0.3 
}: FloatingActionButtonProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  
  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    x.set((e.clientX - centerX) * magneticStrength)
    y.set((e.clientY - centerY) * magneticStrength)
  }
  
  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.button
      className={cn(
        'fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 z-50',
        className
      )}
      style={{ x, y }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {children}
    </motion.button>
  )
}

// Smooth card with hover effects
interface SmoothCardProps {
  children: React.ReactNode
  className?: string
  hoverable?: boolean
  clickable?: boolean
  onClick?: () => void
}

export function SmoothCard({ 
  children, 
  className, 
  hoverable = true, 
  clickable = false, 
  onClick 
}: SmoothCardProps) {
  return (
    <motion.div
      className={cn(
        'bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-200',
        hoverable && 'hover:shadow-md',
        clickable && 'cursor-pointer',
        className
      )}
      whileHover={hoverable ? { y: -2, scale: 1.01 } : undefined}
      whileTap={clickable ? { scale: 0.99 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

// Smooth input with focus animations
interface SmoothInputProps extends HTMLMotionProps<'input'> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export function SmoothInput({ label, error, icon, className, ...props }: SmoothInputProps) {
  const [isFocused, setIsFocused] = React.useState(false)
  const [hasValue, setHasValue] = React.useState(false)

  const handleFocus = () => setIsFocused(true)
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    setHasValue(e.target.value.length > 0)
  }

  return (
    <div className="relative">
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        
        <motion.input
          className={cn(
            'w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200',
            icon && 'pl-10',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          onFocus={handleFocus}
          onBlur={handleBlur}
          whileFocus={{ scale: 1.01 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          {...props}
        />
        
        {label && (
          <motion.label
            className={cn(
              'absolute left-4 text-gray-500 pointer-events-none transition-all duration-200',
              icon && 'left-10'
            )}
            animate={{
              top: isFocused || hasValue ? '0.5rem' : '50%',
              fontSize: isFocused || hasValue ? '0.75rem' : '1rem',
              y: isFocused || hasValue ? 0 : '-50%',
              color: isFocused ? '#3b82f6' : '#6b7280'
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {label}
          </motion.label>
        )}
      </div>
      
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-1 text-sm text-red-600"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Progress indicator with smooth animations
interface SmoothProgressProps {
  value: number
  max?: number
  className?: string
  showLabel?: boolean
  color?: 'blue' | 'green' | 'orange' | 'red'
}

export function SmoothProgress({ 
  value, 
  max = 100, 
  className, 
  showLabel = false,
  color = 'blue' 
}: SmoothProgressProps) {
  const percentage = Math.min(100, (value / max) * 100)
  
  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    orange: 'bg-orange-600',
    red: 'bg-red-600'
  }

  return (
    <div className={cn('relative', className)}>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', colorClasses[color])}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 15 }}
        />
      </div>
      
      {showLabel && (
        <motion.div
          className="absolute right-0 -top-6 text-sm font-medium text-gray-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {Math.round(percentage)}%
        </motion.div>
      )}
    </div>
  )
}

// Smooth toggle switch
interface SmoothToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function SmoothToggle({ 
  checked, 
  onChange, 
  label, 
  disabled = false,
  size = 'md' 
}: SmoothToggleProps) {
  const sizeClasses = {
    sm: { switch: 'w-8 h-4', thumb: 'w-3 h-3' },
    md: { switch: 'w-11 h-6', thumb: 'w-5 h-5' },
    lg: { switch: 'w-14 h-8', thumb: 'w-6 h-6' }
  }

  return (
    <div className="flex items-center gap-3">
      <motion.button
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          sizeClasses[size].switch,
          checked ? 'bg-blue-600' : 'bg-gray-300',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        whileTap={{ scale: 0.95 }}
      >
        <motion.div
          className={cn(
            'inline-block rounded-full bg-white shadow transform transition-transform duration-200',
            sizeClasses[size].thumb
          )}
          animate={{
            x: checked ? (size === 'sm' ? 16 : size === 'md' ? 20 : 24) : 2
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        />
      </motion.button>
      
      {label && (
        <span className={cn('text-sm font-medium', disabled && 'text-gray-400')}>
          {label}
        </span>
      )}
    </div>
  )
}

// Smooth notification toast
interface SmoothToastProps {
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  onClose?: () => void
  duration?: number
}

export function SmoothToast({ 
  message, 
  type = 'info', 
  onClose, 
  duration = 5000 
}: SmoothToastProps) {
  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.()
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const typeStyles = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-orange-600 text-white',
    info: 'bg-blue-600 text-white'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={cn(
        'fixed bottom-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm',
        typeStyles[type]
      )}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{message}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-4 text-white hover:text-gray-200 transition-colors"
          >
            ×
          </button>
        )}
      </div>
    </motion.div>
  )
}

// Smooth skeleton loader
interface SmoothSkeletonProps {
  className?: string
  lines?: number
  avatar?: boolean
}

export function SmoothSkeleton({ className, lines = 3, avatar = false }: SmoothSkeletonProps) {
  return (
    <div className={cn('animate-pulse', className)}>
      {avatar && (
        <div className="flex items-center space-x-4 mb-4">
          <div className="rounded-full bg-gray-300 h-10 w-10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-300 rounded w-3/4" />
            <div className="h-3 bg-gray-300 rounded w-1/2" />
          </div>
        </div>
      )}
      
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 bg-gray-300 rounded',
              i === lines - 1 ? 'w-2/3' : 'w-full'
            )}
          />
        ))}
      </div>
    </div>
  )
}

// Smooth ripple effect
export function useRipple() {
  const [ripples, setRipples] = React.useState<Array<{ x: number; y: number; id: number }>>([])

  const addRipple = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const id = Date.now()

    setRipples(prev => [...prev, { x, y, id }])

    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== id))
    }, 600)
  }, [])

  const RippleContainer = React.useCallback(({ children, className }: { 
    children: React.ReactNode
    className?: string 
  }) => (
    <div className={cn('relative overflow-hidden', className)} onClick={addRipple}>
      {children}
      {ripples.map(ripple => (
        <motion.div
          key={ripple.id}
          className="absolute bg-white opacity-30 rounded-full pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: 'translate(-50%, -50%)'
          }}
          initial={{ width: 0, height: 0 }}
          animate={{ width: 100, height: 100 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
    </div>
  ), [ripples, addRipple])

  return { addRipple, RippleContainer }
}