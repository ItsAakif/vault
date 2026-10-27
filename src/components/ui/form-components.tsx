'use client'

import React, { forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { designTokens, componentTokens } from '@/lib/design-tokens'
import { animations } from '@/lib/animations'
import { 
  AlertCircle, 
  CheckCircle, 
  Eye, 
  EyeOff, 
  Search,
  X,
  Upload,
  Calendar,
  Clock,
  ChevronDown
} from 'lucide-react'

// Base form field wrapper
interface FormFieldProps {
  label?: string
  description?: string
  error?: string
  success?: string
  required?: boolean
  children: React.ReactNode
  className?: string
  id?: string
}

export function FormField({
  label,
  description,
  error,
  success,
  required,
  children,
  className,
  id
}: FormFieldProps) {
  const fieldId = id || `field-${Math.random().toString(36).substr(2, 9)}`
  
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label 
          htmlFor={fieldId}
          className="block text-sm font-medium text-neutral-900"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {description && (
        <p className="text-sm text-neutral-600">{description}</p>
      )}
      
      <div className="relative">
        {React.cloneElement(children as React.ReactElement<{ id?: string }>, { id: fieldId })}
      </div>
      
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            className="flex items-center space-x-2 text-sm text-red-600"
            {...animations.fadeInUp}
            key="error"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
        
        {success && !error && (
          <motion.div
            className="flex items-center space-x-2 text-sm text-green-600"
            {...animations.fadeInUp}
            key="success"
          >
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <span>{success}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Enhanced Input component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'filled' | 'outlined'
  inputSize?: 'sm' | 'md' | 'lg'
  error?: boolean
  success?: boolean
  leftIcon?: React.ComponentType<{ className?: string }>
  rightIcon?: React.ComponentType<{ className?: string }>
  onRightIconClick?: () => void
  loading?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  className,
  type = 'text',
  variant = 'default',
  inputSize = 'md',
  error,
  success,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  onRightIconClick,
  loading,
  disabled,
  ...props
}, ref) => {
  const sizeClasses = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-4 text-base'
  }
  
  const variantClasses = {
    default: 'border border-neutral-300 bg-white',
    filled: 'border-0 bg-neutral-100',
    outlined: 'border-2 border-neutral-300 bg-transparent'
  }
  
  const stateClasses = {
    default: 'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
    error: 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20',
    success: 'border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/20',
    disabled: 'bg-neutral-50 text-neutral-400 cursor-not-allowed'
  }
  
  const getStateClass = () => {
    if (disabled) return stateClasses.disabled
    if (error) return stateClasses.error
    if (success) return stateClasses.success
    return stateClasses.default
  }
  
  return (
    <div className="relative">
      {LeftIcon && (
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400">
          <LeftIcon className="h-4 w-4" />
        </div>
      )}
      
      <input
        type={type}
        className={cn(
          'w-full rounded-lg transition-all duration-200 outline-none',
          sizeClasses[inputSize],
          variantClasses[variant],
          getStateClass(),
          LeftIcon && 'pl-10',
          (RightIcon || loading) && 'pr-10',
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      />
      
      {(RightIcon || loading) && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent" />
          ) : RightIcon ? (
            <button
              type="button"
              onClick={onRightIconClick}
              className="text-neutral-400 hover:text-neutral-600 transition-colors"
              tabIndex={-1}
            >
              <RightIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
})

Input.displayName = 'Input'

// Password Input with toggle visibility
interface PasswordInputProps extends Omit<InputProps, 'type' | 'rightIcon' | 'onRightIconClick'> {
  showStrength?: boolean
}

export function PasswordInput({ showStrength, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const [strength, setStrength] = React.useState(0)
  
  const calculateStrength = (password: string) => {
    let score = 0
    if (password.length >= 8) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[a-z]/.test(password)) score += 1
    if (/\d/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    return score
  }
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (showStrength) {
      setStrength(calculateStrength(e.target.value))
    }
    props.onChange?.(e)
  }
  
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500']
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong']
  
  return (
    <div className="space-y-2">
      <Input
        {...props}
        type={showPassword ? 'text' : 'password'}
        rightIcon={showPassword ? EyeOff : Eye}
        onRightIconClick={() => setShowPassword(!showPassword)}
        onChange={handleChange}
      />
      
      {showStrength && props.value && (
        <motion.div
          className="space-y-2"
          {...animations.fadeInUp}
        >
          <div className="flex space-x-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration-300',
                  strength >= level ? strengthColors[strength - 1] : 'bg-neutral-200'
                )}
              />
            ))}
          </div>
          <p className="text-xs text-neutral-600">
            Password strength: {strengthLabels[strength - 1] || 'Very Weak'}
          </p>
        </motion.div>
      )}
    </div>
  )
}

// Enhanced Textarea
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'filled' | 'outlined'
  error?: boolean
  success?: boolean
  resize?: 'none' | 'vertical' | 'horizontal' | 'both'
  showCount?: boolean
  maxLength?: number
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  className,
  variant = 'default',
  error,
  success,
  resize = 'vertical',
  showCount,
  maxLength,
  ...props
}, ref) => {
  const [count, setCount] = React.useState(0)
  
  const variantClasses = {
    default: 'border border-neutral-300 bg-white',
    filled: 'border-0 bg-neutral-100',
    outlined: 'border-2 border-neutral-300 bg-transparent'
  }
  
  const stateClasses = {
    default: 'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
    error: 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20',
    success: 'border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
  }
  
  const resizeClasses = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize'
  }
  
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (showCount) {
      setCount(e.target.value.length)
    }
    props.onChange?.(e)
  }
  
  return (
    <div className="space-y-2">
      <textarea
        className={cn(
          'w-full min-h-[80px] px-4 py-3 rounded-lg transition-all duration-200 outline-none text-sm',
          variantClasses[variant],
          error ? stateClasses.error : success ? stateClasses.success : stateClasses.default,
          resizeClasses[resize],
          className
        )}
        ref={ref}
        maxLength={maxLength}
        onChange={handleChange}
        {...props}
      />
      
      {showCount && (
        <div className="flex justify-end">
          <span className={cn(
            'text-xs',
            maxLength && count > maxLength * 0.9 ? 'text-red-600' : 'text-neutral-500'
          )}>
            {count}{maxLength && `/${maxLength}`}
          </span>
        </div>
      )}
    </div>
  )
})

Textarea.displayName = 'Textarea'

// Search Input
interface SearchInputProps extends Omit<InputProps, 'leftIcon' | 'type'> {
  onClear?: () => void
  showClear?: boolean
}

export function SearchInput({ onClear, showClear = true, ...props }: SearchInputProps) {
  const [hasValue, setHasValue] = React.useState(false)
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasValue(e.target.value.length > 0)
    props.onChange?.(e)
  }
  
  const handleClear = () => {
    setHasValue(false)
    onClear?.()
  }
  
  return (
    <Input
      {...props}
      type="search"
      leftIcon={Search}
      rightIcon={hasValue && showClear ? X : undefined}
      onRightIconClick={hasValue && showClear ? handleClear : undefined}
      onChange={handleChange}
      placeholder={props.placeholder || 'Search...'}
    />
  )
}

// File Upload Input
interface FileUploadProps {
  accept?: string
  multiple?: boolean
  maxSize?: number // in bytes
  onFileSelect?: (files: File[]) => void
  className?: string
  children?: React.ReactNode
  disabled?: boolean
}

export function FileUpload({
  accept,
  multiple,
  maxSize,
  onFileSelect,
  className,
  children,
  disabled
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }
  
  const handleFiles = (files: File[]) => {
    if (maxSize) {
      const validFiles = files.filter(file => file.size <= maxSize)
      if (validFiles.length !== files.length) {
        // Handle size error
        console.warn('Some files exceed maximum size')
      }
      onFileSelect?.(validFiles)
    } else {
      onFileSelect?.(files)
    }
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    if (disabled) return
    
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }
  
  const handleDragLeave = () => {
    setIsDragOver(false)
  }
  
  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200',
        isDragOver ? 'border-primary-500 bg-primary-50' : 'border-neutral-300',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary-400',
        className
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      
      {children || (
        <div className="space-y-2">
          <Upload className="h-8 w-8 mx-auto text-neutral-400" />
          <div>
            <p className="text-sm font-medium text-neutral-900">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-neutral-500">
              {accept && `Accepted formats: ${accept}`}
              {maxSize && ` • Max size: ${(maxSize / 1024 / 1024).toFixed(1)}MB`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Date/Time Input
interface DateTimeInputProps extends Omit<InputProps, 'type'> {
  type?: 'date' | 'time' | 'datetime-local'
  showIcon?: boolean
}

export function DateTimeInput({ type = 'date', showIcon = true, ...props }: DateTimeInputProps) {
  const getIcon = () => {
    switch (type) {
      case 'time':
        return Clock
      default:
        return Calendar
    }
  }
  
  return (
    <Input
      {...props}
      type={type}
      leftIcon={showIcon ? getIcon() : undefined}
    />
  )
}

// Select Input (enhanced)
interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectInputProps {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  error?: boolean
  success?: boolean
}

export function SelectInput({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  className,
  disabled,
  error,
  success
}: SelectInputProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const selectedOption = options.find(option => option.value === value)
  
  const stateClasses = {
    default: 'border-neutral-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
    error: 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20',
    success: 'border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/20',
    disabled: 'bg-neutral-50 text-neutral-400 cursor-not-allowed'
  }
  
  const getStateClass = () => {
    if (disabled) return stateClasses.disabled
    if (error) return stateClasses.error
    if (success) return stateClasses.success
    return stateClasses.default
  }
  
  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          'w-full h-10 px-4 text-left bg-white border rounded-lg transition-all duration-200 outline-none flex items-center justify-between',
          getStateClass(),
          className
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={selectedOption ? 'text-neutral-900' : 'text-neutral-500'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={cn(
          'h-4 w-4 text-neutral-400 transition-transform duration-200',
          isOpen && 'transform rotate-180'
        )} />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-60 overflow-auto"
            {...animations.fadeInUp}
            onBlur={() => setIsOpen(false)}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'w-full px-4 py-2 text-left hover:bg-neutral-50 transition-colors duration-150',
                  option.disabled && 'opacity-50 cursor-not-allowed',
                  value === option.value && 'bg-primary-50 text-primary-900'
                )}
                onClick={() => {
                  if (!option.disabled) {
                    onChange?.(option.value)
                    setIsOpen(false)
                  }
                }}
                disabled={option.disabled}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}