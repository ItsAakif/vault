'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shell'
import { Download, Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function DataManagementPage() {
  const [exportType, setExportType] = useState('all')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const { toast } = useToast()

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetch(`/api/export?type=${exportType}&format=json`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vault-export-${exportType}-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        
        toast({
          title: 'Export Successful',
          description: 'Your data has been exported successfully'
        })
      } else {
        throw new Error('Export failed')
      }
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export data',
        variant: 'destructive'
      })
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      })

      const result = await response.json()
      setImportResult(result)

      if (result.success) {
        toast({
          title: 'Import Successful',
          description: `Imported ${Object.values(result.imported).reduce((a: any, b: any) => (typeof b === 'number' ? a + b : a), 0)} items`
        })
      } else {
        toast({
          title: 'Import Completed with Errors',
          description: `${result.imported.errors?.length || 0} errors occurred`,
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to import data',
        variant: 'destructive'
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="p-0"
        title="Data Management"
        description="Export and import your Vault data"
      />

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Data
          </CardTitle>
          <CardDescription>
            Download your data as JSON for backup or migration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Data Type</Label>
            <Select value={exportType} onValueChange={setExportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Data</SelectItem>
                <SelectItem value="content">Content Items</SelectItem>
                <SelectItem value="projects">Projects</SelectItem>
                <SelectItem value="jobs">Job Opportunities</SelectItem>
                <SelectItem value="calendar">Calendar Events</SelectItem>
                <SelectItem value="categories">Categories</SelectItem>
                <SelectItem value="tags">Tags</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleExport} 
            disabled={exporting}
            className="w-full"
          >
            <FileJson className="h-4 w-4 mr-2" />
            {exporting ? 'Exporting...' : 'Export as JSON'}
          </Button>
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Data
          </CardTitle>
          <CardDescription>
            Restore data from a previously exported JSON file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              className="hidden"
              id="import-file"
            />
            <label htmlFor="import-file" className="cursor-pointer">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                {importing ? 'Importing...' : 'Click to select a JSON file'}
              </p>
              <Button variant="outline" disabled={importing} type="button">
                Choose File
              </Button>
            </label>
          </div>

          {importResult && (
            <div className={`p-4 rounded-lg ${importResult.success ? 'bg-positive/10' : 'bg-caution/10'}`}>
              <div className="flex items-start gap-2">
                {importResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-positive mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-caution mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {importResult.message}
                  </p>
                  <div className="mt-2 text-sm space-y-1">
                    <p>Content Items: {importResult.imported.contentItems}</p>
                    <p>Projects: {importResult.imported.projects}</p>
                    <p>Jobs: {importResult.imported.jobs}</p>
                    <p>Calendar Events: {importResult.imported.calendarEvents}</p>
                    <p>Categories: {importResult.imported.categories}</p>
                    <p>Tags: {importResult.imported.tags}</p>
                    {importResult.imported.errors?.length > 0 && (
                      <p className="text-caution mt-2">
                        {importResult.imported.errors.length} errors occurred
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Notice */}
      <Card className="border-signal/20 bg-signal/10">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-signal flex-shrink-0 mt-0.5" />
            <div className="text-sm text-ink">
              <p className="font-medium mb-1">Security Notice</p>
              <p>Exported data is not encrypted. Store your export files securely and delete them when no longer needed.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
