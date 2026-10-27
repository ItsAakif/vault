'use client'

import { useState, useCallback, useEffect } from 'react'
import { z } from 'zod'

interface ValidationError {
  field: string
  message: string
}

interface FormState<T> {
  values: Partial<T>
  errors: Record<string, string>
  touched: Record<string, boolean>
  isValid: boolean
  isSubmitting: boolean
  isDirty: boolean
}

interface UseFormValidationOptions<T> {
  schema: z.ZodSchema<T>
  initialValues?: Partial<T>
  onSubmit?: (values: T) => Promise<void> | void
  validateOnChange?: boolean
  validateOnBlur?: boolean
  resetOnSubmit?: boolean
}

export function useFormValidation<T>({
  schema,
  initialValues = {},
  onSubmit,
  validateOnChange = true,
  validateOnBlur = true,
  resetOnSubmit = false
}: UseFormValidationOptions<T>) {
  const [state, setState] = useState<FormState<T>>({
    values: initialValues,
    errors: {},
    touched: {},
    isValid: false,
    isSubmitting: false,
    isDirty: false
  })

  // Validate a single field
  const validateField = useCallback((field: string, value: any): string | null => {
    try {
      // Zod v4: .pick exists on ZodObject, not on the generic ZodType, so narrow first.
      const fieldSchema =
        schema instanceof z.ZodObject
          ? schema.pick({ [field]: true } as Record<string, true>)
          : schema
      fieldSchema.parse({ [field]: value })
      return null
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error.issues[0]?.message || 'Invalid value'
      }
      return 'Validation error'
    }
  }, [schema])

  // Validate all fields
  const validateForm = useCallback((values: Partial<T>): Record<string, string> => {
    try {
      schema.parse(values)
      return {}
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {}
        error.issues.forEach((err) => {
          const field = err.path.join('.')
          errors[field] = err.message
        })
        return errors
      }
      return { general: 'Validation failed' }
    }
  }, [schema])

  // Set field value
  const setValue = useCallback((field: string, value: any) => {
    setState(prev => {
      const newValues = { ...prev.values, [field]: value }
      const errors = { ...prev.errors }
      
      // Validate field if validateOnChange is enabled
      if (validateOnChange && prev.touched[field]) {
        const fieldError = validateField(field, value)
        if (fieldError) {
          errors[field] = fieldError
        } else {
          delete errors[field]
        }
      }
      
      // Check if form is valid
      const allErrors = validateForm(newValues)
      const isValid = Object.keys(allErrors).length === 0
      
      return {
        ...prev,
        values: newValues,
        errors,
        isValid,
        isDirty: true
      }
    })
  }, [validateField, validateForm, validateOnChange])

  // Set multiple values
  const setValues = useCallback((values: Partial<T>) => {
    setState(prev => {
      const newValues = { ...prev.values, ...values }
      const errors = validateForm(newValues)
      const isValid = Object.keys(errors).length === 0
      
      return {
        ...prev,
        values: newValues,
        errors,
        isValid,
        isDirty: true
      }
    })
  }, [validateForm])

  // Set field as touched
  const setTouched = useCallback((field: string, touched = true) => {
    setState(prev => {
      const newTouched = { ...prev.touched, [field]: touched }
      const errors = { ...prev.errors }
      
      // Validate field if validateOnBlur is enabled and field is now touched
      if (validateOnBlur && touched && prev.values[field as keyof T] !== undefined) {
        const fieldError = validateField(field, prev.values[field as keyof T])
        if (fieldError) {
          errors[field] = fieldError
        } else {
          delete errors[field]
        }
      }
      
      return {
        ...prev,
        touched: newTouched,
        errors
      }
    })
  }, [validateField, validateOnBlur])

  // Set error for a field
  const setError = useCallback((field: string, error: string) => {
    setState(prev => ({
      ...prev,
      errors: { ...prev.errors, [field]: error }
    }))
  }, [])

  // Clear error for a field
  const clearError = useCallback((field: string) => {
    setState(prev => {
      const errors = { ...prev.errors }
      delete errors[field]
      return { ...prev, errors }
    })
  }, [])

  // Clear all errors
  const clearErrors = useCallback(() => {
    setState(prev => ({ ...prev, errors: {} }))
  }, [])

  // Reset form
  const reset = useCallback((newInitialValues?: Partial<T>) => {
    setState({
      values: newInitialValues || initialValues,
      errors: {},
      touched: {},
      isValid: false,
      isSubmitting: false,
      isDirty: false
    })
  }, [initialValues])

  // Handle form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    if (!onSubmit) return
    
    setState(prev => ({ ...prev, isSubmitting: true }))
    
    try {
      // Validate all fields
      const errors = validateForm(state.values)
      
      if (Object.keys(errors).length > 0) {
        setState(prev => ({
          ...prev,
          errors,
          isSubmitting: false,
          touched: Object.keys(prev.values).reduce((acc, key) => ({
            ...acc,
            [key]: true
          }), {})
        }))
        return
      }
      
      // Parse and submit
      const validatedValues = schema.parse(state.values)
      await onSubmit(validatedValues)
      
      if (resetOnSubmit) {
        reset()
      } else {
        setState(prev => ({ ...prev, isSubmitting: false, isDirty: false }))
      }
    } catch (error) {
      setState(prev => ({ ...prev, isSubmitting: false }))
      
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {}
        error.issues.forEach((err) => {
          const field = err.path.join('.')
          errors[field] = err.message
        })
        setState(prev => ({ ...prev, errors }))
      } else {
        // Handle submission error
        console.error('Form submission error:', error)
        setError('general', 'An error occurred while submitting the form')
      }
    }
  }, [onSubmit, validateForm, state.values, schema, resetOnSubmit, reset, setError])

  // Get field props for easy integration with form components
  const getFieldProps = useCallback((field: string) => ({
    value: state.values[field as keyof T] || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(field, e.target.value)
    },
    onBlur: () => setTouched(field),
    error: state.touched[field] && state.errors[field],
    name: field,
    id: field
  }), [state.values, state.touched, state.errors, setValue, setTouched])

  // Get field props for custom components
  const getCustomFieldProps = useCallback((field: string) => ({
    value: state.values[field as keyof T],
    onChange: (value: any) => setValue(field, value),
    onBlur: () => setTouched(field),
    error: state.touched[field] && state.errors[field],
    name: field,
    id: field
  }), [state.values, state.touched, state.errors, setValue, setTouched])

  // Validate form on values change
  useEffect(() => {
    const errors = validateForm(state.values)
    const isValid = Object.keys(errors).length === 0
    
    setState(prev => ({
      ...prev,
      isValid
    }))
  }, [state.values, validateForm])

  return {
    // State
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    isValid: state.isValid,
    isSubmitting: state.isSubmitting,
    isDirty: state.isDirty,
    
    // Actions
    setValue,
    setValues,
    setTouched,
    setError,
    clearError,
    clearErrors,
    reset,
    handleSubmit,
    
    // Helpers
    getFieldProps,
    getCustomFieldProps,
    validateField,
    validateForm
  }
}

// Hook for async validation
export function useAsyncValidation<T>(
  validator: (value: T) => Promise<boolean>,
  errorMessage: string,
  debounceMs = 500
) {
  const [isValidating, setIsValidating] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const validate = useCallback(
    async (value: T) => {
      if (!value) {
        setIsValid(null)
        setError(null)
        return
      }

      setIsValidating(true)
      setError(null)

      try {
        const result = await validator(value)
        setIsValid(result)
        if (!result) {
          setError(errorMessage)
        }
      } catch (err) {
        setIsValid(false)
        setError('Validation failed')
      } finally {
        setIsValidating(false)
      }
    },
    [validator, errorMessage]
  )

  // Debounced validation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // This would be called with the actual value from the component
    }, debounceMs)

    return () => clearTimeout(timeoutId)
  }, [debounceMs])

  return {
    isValidating,
    isValid,
    error,
    validate
  }
}

// Hook for form arrays (dynamic form fields)
export function useFormArray<T>(initialItems: T[] = []) {
  const [items, setItems] = useState<T[]>(initialItems)

  const append = useCallback((item: T) => {
    setItems(prev => [...prev, item])
  }, [])

  const prepend = useCallback((item: T) => {
    setItems(prev => [item, ...prev])
  }, [])

  const insert = useCallback((index: number, item: T) => {
    setItems(prev => [
      ...prev.slice(0, index),
      item,
      ...prev.slice(index)
    ])
  }, [])

  const remove = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }, [])

  const move = useCallback((from: number, to: number) => {
    setItems(prev => {
      const newItems = [...prev]
      const item = newItems.splice(from, 1)[0]
      newItems.splice(to, 0, item)
      return newItems
    })
  }, [])

  const update = useCallback((index: number, item: T) => {
    setItems(prev => prev.map((existingItem, i) => i === index ? item : existingItem))
  }, [])

  const clear = useCallback(() => {
    setItems([])
  }, [])

  const reset = useCallback((newItems: T[] = initialItems) => {
    setItems(newItems)
  }, [initialItems])

  return {
    items,
    append,
    prepend,
    insert,
    remove,
    move,
    update,
    clear,
    reset
  }
}