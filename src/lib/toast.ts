// Single toast convention for the app, backed by `sonner`.
//
// Use these helpers instead of ad-hoc toast globals so every notification
// shares one implementation and one visual style.
import { toast as sonnerToast } from 'sonner'

export const toast = sonnerToast

export function toastError(message: string, description?: string): string | number {
  return sonnerToast.error(message, description ? { description } : undefined)
}

export function success(message: string, description?: string): string | number {
  return sonnerToast.success(message, description ? { description } : undefined)
}
