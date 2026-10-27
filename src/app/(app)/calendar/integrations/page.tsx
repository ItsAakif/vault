import { Button } from '@/components/ui/button'
import { CalendarIntegrations } from '@/components/calendar'
import { PageHeader } from '@/components/shell'
import { Download, Plus, Upload } from 'lucide-react'

export default function CalendarIntegrationsPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="p-0"
        title="Calendar Integrations"
        description="Connect external calendars and manage import/export"
        actions={
          <>
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Integration
            </Button>
          </>
        }
      />
      <CalendarIntegrations />
    </div>
  )
}
