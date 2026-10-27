'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Globe } from 'lucide-react'

interface TimezoneSelectorProps {
  value: string
  onValueChange: (timezone: string) => void
  label?: string
  className?: string
}

interface TimezoneGroup {
  [region: string]: {
    value: string
    label: string
    offset: number
  }[]
}

export function TimezoneSelector({ value, onValueChange, label = 'Timezone', className }: TimezoneSelectorProps) {
  const [loading, setLoading] = useState(false)

  // Simplified - no API call for now

  const formatOffset = (offset: number) => {
    const hours = Math.floor(Math.abs(offset) / 60)
    const minutes = Math.abs(offset) % 60
    const sign = offset >= 0 ? '+' : '-'
    return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  const getCurrentTimezone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  const getTimezoneDisplay = (timezone: string) => {
    try {
      const now = new Date()
      const offset = -now.getTimezoneOffset()
      return `${timezone.split('/').pop()?.replace(/_/g, ' ')} (${formatOffset(offset)})`
    } catch {
      return timezone
    }
  }

  if (loading) {
    return (
      <div className={className}>
        {label && <Label className="mb-2 block">{label}</Label>}
        <div className="flex items-center space-x-2 p-2 border rounded">
          <Globe className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading timezones...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {label && <Label className="mb-2 block">{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select timezone">
            <div className="flex items-center space-x-2">
              <Globe className="h-4 w-4" />
              <span>{getTimezoneDisplay(value)}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {/* Current timezone option */}
          <SelectItem value={getCurrentTimezone()}>
            <div className="flex items-center justify-between w-full">
              <span>Current Timezone</span>
              <span className="text-xs text-muted-foreground ml-2">
                {getTimezoneDisplay(getCurrentTimezone())}
              </span>
            </div>
          </SelectItem>
          
          {/* Common timezones */}
          <div className="px-2 py-1 text-sm font-medium text-muted-foreground border-t">
            Common
          </div>
          {[
            'UTC',
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Australia/Sydney'
          ].map((tz) => (
            <SelectItem key={tz} value={tz}>
              <div className="flex items-center justify-between w-full">
                <span>{tz.split('/').pop()?.replace(/_/g, ' ') || tz}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {tz === 'UTC' ? 'UTC+00:00' : getTimezoneDisplay(tz)}
                </span>
              </div>
            </SelectItem>
          ))}

          {/* Additional timezones */}
          <div className="px-2 py-1 text-sm font-medium text-muted-foreground border-t">
            More Timezones
          </div>
          {[
            'America/Toronto',
            'America/Mexico_City',
            'Europe/Rome',
            'Europe/Madrid',
            'Asia/Dubai',
            'Asia/Singapore',
            'Australia/Melbourne'
          ].map((tz) => (
            <SelectItem key={tz} value={tz}>
              <div className="flex items-center justify-between w-full">
                <span>{tz.split('/').pop()?.replace(/_/g, ' ') || tz}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {getTimezoneDisplay(tz)}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}