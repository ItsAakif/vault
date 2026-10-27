'use client'

import React from 'react'
import { logger } from '@/lib/logger'

// Accessibility utilities and helpers
export class AccessibilityManager {
  private focusableElements = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ')

  private announcements: HTMLElement | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeAnnouncements()
      this.setupKeyboardNavigation()
      this.setupFocusManagement()
    }
  }

  // Initialize screen reader announcements
  private initializeAnnouncements() {
    this.announcements = document.createElement('div')
    this.announcements.setAttribute('aria-live', 'polite')
    this.announcements.setAttribute('aria-atomic', 'true')
    this.announcements.className = 'sr-only'
    this.announcements.style.cssText = `
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    `
    document.body.appendChild(this.announcements)
  }

  // Announce message to screen readers
  announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
    if (!this.announcements) return

    this.announcements.setAttribute('aria-live', priority)
    this.announcements.textContent = message

    // Clear after announcement
    setTimeout(() => {
      if (this.announcements) {
        this.announcements.textContent = ''
      }
    }, 1000)

    logger.debug('Accessibility announcement:', message)
  }

  // Get all focusable elements within a container
  getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
    return Array.from(container.querySelectorAll(this.focusableElements))
      .filter(el => this.isVisible(el)) as HTMLElement[]
  }

  // Check if element is visible
  private isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0'
  }

  // Trap focus within a container (for modals, dropdowns, etc.)
  trapFocus(container: HTMLElement, initialFocus?: HTMLElement): () => void {
    const focusableElements = this.getFocusableElements(container)
    
    if (focusableElements.length === 0) {
      logger.warn('No focusable elements found in container')
      return () => {}
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus initial element or first focusable element
    const elementToFocus = initialFocus || firstElement
    elementToFocus.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        // Shift + Tab (backward)
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab (forward)
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
    }
  }

  // Setup global keyboard navigation
  private setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
      // Escape key handling
      if (e.key === 'Escape') {
        this.handleEscapeKey()
      }

      // Skip links navigation
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        this.handleTabNavigation(e)
      }
    })
  }

  // Handle escape key press
  private handleEscapeKey() {
    // Close any open modals, dropdowns, etc.
    const openModals = document.querySelectorAll('[role="dialog"][aria-hidden="false"]')
    const openDropdowns = document.querySelectorAll('[aria-expanded="true"]')

    openModals.forEach(modal => {
      const closeButton = modal.querySelector('[data-close]') as HTMLElement
      closeButton?.click()
    })

    openDropdowns.forEach(dropdown => {
      if (dropdown instanceof HTMLElement) {
        dropdown.setAttribute('aria-expanded', 'false')
        dropdown.blur()
      }
    })
  }

  // Handle tab navigation
  private handleTabNavigation(e: KeyboardEvent) {
    // Add visual focus indicators for keyboard users
    document.body.classList.add('keyboard-navigation')
    
    // Remove class on mouse interaction
    const removeKeyboardClass = () => {
      document.body.classList.remove('keyboard-navigation')
      document.removeEventListener('mousedown', removeKeyboardClass)
    }
    
    document.addEventListener('mousedown', removeKeyboardClass)
  }

  // Setup focus management
  private setupFocusManagement() {
    // Add focus-visible polyfill behavior
    let hadKeyboardEvent = false

    const keyboardThrottledEventListener = this.throttle((e: KeyboardEvent) => {
      if (e.metaKey || e.altKey || e.ctrlKey) return
      hadKeyboardEvent = true
    }, 100)

    const pointerEventListener = () => {
      hadKeyboardEvent = false
    }

    document.addEventListener('keydown', keyboardThrottledEventListener, true)
    document.addEventListener('mousedown', pointerEventListener, true)
    document.addEventListener('pointerdown', pointerEventListener, true)
    document.addEventListener('touchstart', pointerEventListener, true)

    // Apply focus-visible class
    document.addEventListener('focusin', (e) => {
      if (hadKeyboardEvent && e.target instanceof HTMLElement) {
        e.target.classList.add('focus-visible')
      }
    })

    document.addEventListener('focusout', (e) => {
      if (e.target instanceof HTMLElement) {
        e.target.classList.remove('focus-visible')
      }
    })
  }

  // Throttle utility
  private throttle(func: Function, limit: number) {
    let inThrottle: boolean
    return function(this: any, ...args: any[]) {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => inThrottle = false, limit)
      }
    }
  }

  // Check color contrast ratio
  getContrastRatio(foreground: string, background: string): number {
    const getLuminance = (color: string): number => {
      const rgb = this.hexToRgb(color)
      if (!rgb) return 0

      const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
        c = c / 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      })

      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    const l1 = getLuminance(foreground)
    const l2 = getLuminance(background)
    const lighter = Math.max(l1, l2)
    const darker = Math.min(l1, l2)

    return (lighter + 0.05) / (darker + 0.05)
  }

  // Convert hex to RGB
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  // Check if contrast meets WCAG standards
  meetsContrastStandard(
    foreground: string, 
    background: string, 
    level: 'AA' | 'AAA' = 'AA',
    size: 'normal' | 'large' = 'normal'
  ): boolean {
    const ratio = this.getContrastRatio(foreground, background)
    
    const requirements = {
      'AA': { normal: 4.5, large: 3 },
      'AAA': { normal: 7, large: 4.5 }
    }

    return ratio >= requirements[level][size]
  }

  // Add skip links to page
  addSkipLinks(links: Array<{ href: string; text: string }>) {
    const skipLinksContainer = document.createElement('div')
    skipLinksContainer.className = 'skip-links'
    skipLinksContainer.style.cssText = `
      position: absolute;
      top: -40px;
      left: 6px;
      background: #000;
      color: #fff;
      padding: 8px;
      z-index: 1000;
      text-decoration: none;
      border-radius: 0 0 4px 4px;
    `

    links.forEach(link => {
      const skipLink = document.createElement('a')
      skipLink.href = link.href
      skipLink.textContent = link.text
      skipLink.className = 'skip-link'
      skipLink.style.cssText = `
        display: block;
        color: #fff;
        text-decoration: none;
        padding: 4px 8px;
        margin: 2px 0;
      `

      skipLink.addEventListener('focus', () => {
        skipLinksContainer.style.top = '6px'
      })

      skipLink.addEventListener('blur', () => {
        skipLinksContainer.style.top = '-40px'
      })

      skipLinksContainer.appendChild(skipLink)
    })

    document.body.insertBefore(skipLinksContainer, document.body.firstChild)
  }

  // Validate ARIA attributes
  validateAriaAttributes(element: HTMLElement): string[] {
    const issues: string[] = []

    // Check for required ARIA attributes
    const role = element.getAttribute('role')
    if (role) {
      const requiredAttributes = this.getRequiredAriaAttributes(role)
      requiredAttributes.forEach(attr => {
        if (!element.hasAttribute(attr)) {
          issues.push(`Missing required ARIA attribute: ${attr}`)
        }
      })
    }

    // Check for invalid ARIA attribute values
    const ariaAttributes = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('aria-'))

    ariaAttributes.forEach(attr => {
      if (!this.isValidAriaValue(attr.name, attr.value)) {
        issues.push(`Invalid ARIA attribute value: ${attr.name}="${attr.value}"`)
      }
    })

    return issues
  }

  // Get required ARIA attributes for a role
  private getRequiredAriaAttributes(role: string): string[] {
    const requirements: Record<string, string[]> = {
      'button': [],
      'checkbox': ['aria-checked'],
      'radio': ['aria-checked'],
      'slider': ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
      'spinbutton': ['aria-valuenow'],
      'progressbar': ['aria-valuenow'],
      'tab': ['aria-selected'],
      'tabpanel': ['aria-labelledby'],
      'dialog': ['aria-labelledby'],
      'alertdialog': ['aria-labelledby'],
      'combobox': ['aria-expanded'],
      'listbox': [],
      'option': ['aria-selected']
    }

    return requirements[role] || []
  }

  // Validate ARIA attribute values
  private isValidAriaValue(attribute: string, value: string): boolean {
    const booleanAttributes = [
      'aria-checked', 'aria-disabled', 'aria-expanded', 'aria-hidden',
      'aria-invalid', 'aria-pressed', 'aria-readonly', 'aria-required',
      'aria-selected'
    ]

    const numericAttributes = [
      'aria-level', 'aria-posinset', 'aria-setsize', 'aria-valuemax',
      'aria-valuemin', 'aria-valuenow'
    ]

    if (booleanAttributes.includes(attribute)) {
      return ['true', 'false', 'mixed'].includes(value)
    }

    if (numericAttributes.includes(attribute)) {
      return !isNaN(Number(value))
    }

    // For other attributes, assume valid (would need more comprehensive validation)
    return true
  }

  // Generate accessible IDs
  generateId(prefix: string = 'element'): string {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`
  }

  // Check if element is properly labeled
  isProperlyLabeled(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase()
    
    // Form elements
    if (['input', 'textarea', 'select'].includes(tagName)) {
      return !!(
        element.getAttribute('aria-label') ||
        element.getAttribute('aria-labelledby') ||
        element.getAttribute('title') ||
        document.querySelector(`label[for="${element.id}"]`)
      )
    }

    // Interactive elements
    if (['button', 'a'].includes(tagName)) {
      return !!(
        element.textContent?.trim() ||
        element.getAttribute('aria-label') ||
        element.getAttribute('aria-labelledby') ||
        element.getAttribute('title')
      )
    }

    // Images
    if (tagName === 'img') {
      return !!(element.getAttribute('alt'))
    }

    return true
  }

  // Cleanup
  cleanup() {
    if (this.announcements) {
      document.body.removeChild(this.announcements)
      this.announcements = null
    }
  }
}

// React hook for accessibility features
export function useAccessibility() {
  const [manager] = React.useState(() => new AccessibilityManager())

  React.useEffect(() => {
    return () => manager.cleanup()
  }, [manager])

  return {
    announce: manager.announce.bind(manager),
    trapFocus: manager.trapFocus.bind(manager),
    getFocusableElements: manager.getFocusableElements.bind(manager),
    getContrastRatio: manager.getContrastRatio.bind(manager),
    meetsContrastStandard: manager.meetsContrastStandard.bind(manager),
    validateAriaAttributes: manager.validateAriaAttributes.bind(manager),
    generateId: manager.generateId.bind(manager),
    isProperlyLabeled: manager.isProperlyLabeled.bind(manager)
  }
}

// Keyboard navigation hook
export function useKeyboardNavigation(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    trapFocus?: boolean
    initialFocus?: HTMLElement
    onEscape?: () => void
  } = {}
) {
  const { trapFocus = false, initialFocus, onEscape } = options

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cleanup: (() => void) | undefined

    if (trapFocus) {
      const manager = new AccessibilityManager()
      cleanup = manager.trapFocus(container, initialFocus)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        onEscape()
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      cleanup?.()
    }
  }, [containerRef, trapFocus, initialFocus, onEscape])
}

// Focus management hook
export function useFocusManagement() {
  const previousFocus = React.useRef<HTMLElement | null>(null)

  const saveFocus = React.useCallback(() => {
    previousFocus.current = document.activeElement as HTMLElement
  }, [])

  const restoreFocus = React.useCallback(() => {
    if (previousFocus.current) {
      previousFocus.current.focus()
      previousFocus.current = null
    }
  }, [])

  return { saveFocus, restoreFocus }
}

// Export singleton instance
export const accessibilityManager = new AccessibilityManager()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    accessibilityManager.cleanup()
  })
}