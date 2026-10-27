'use client'

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  children?: React.ReactNode
  className?: string
}

/**
 * The error half of the state vocabulary.
 *
 * `children` is the composition seam: a caller whose failure is `parseDriveFailure(...)`
 * passes `<DriveRequiredNotice />` here instead of writing a second banner, and a caller
 * whose failure is generic gets the retry block. This module deliberately does not import
 * the Drive notice - that would invert the dependency.
 *
 * Copy is sentence case, active voice, no apology, no exclamation, no blame.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel,
  children,
  className,
}: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-8 text-center",
        className
      )}
    >
      {children ? (
        children
      ) : (
        <>
          <p data-slot="error-state-title" className="text-sm font-medium">
            {title}
          </p>
          {description ? (
            <p
              data-slot="error-state-description"
              className="text-sm text-ink-muted"
            >
              {description}
            </p>
          ) : null}
          {onRetry ? (
            <Button size="sm" onClick={onRetry}>
              {retryLabel ?? "Retry"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}
