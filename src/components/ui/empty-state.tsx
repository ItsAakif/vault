'use client'

import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

export interface EmptyStateAction {
  label: string
  onClick?: () => void
  href?: string
}

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: EmptyStateAction
  className?: string
}

/**
 * The single empty-state vocabulary: a faint 24px icon, a sentence-case title, one
 * sentence saying what the surface is for, and exactly one action.
 *
 * No illustration, no emoji, no apology (ADR-011 D2). The caller supplies the words.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-8 text-center",
        className
      )}
    >
      {Icon ? <Icon className="h-6 w-6 text-ink-faint" aria-hidden="true" /> : null}
      <p data-slot="empty-state-title" className="text-sm font-medium">
        {title}
      </p>
      {description ? (
        <p
          data-slot="empty-state-description"
          className="max-w-[45ch] text-sm text-ink-muted"
        >
          {description}
        </p>
      ) : null}
      {action ? (
        action.onClick ? (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : action.href ? (
          <Link href={action.href} className={cn(buttonVariants({ size: "sm" }))}>
            {action.label}
          </Link>
        ) : null
      ) : null}
    </div>
  )
}
