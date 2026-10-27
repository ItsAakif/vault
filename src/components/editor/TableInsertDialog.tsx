'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { 
  Table,
  Grid3x3,
  Plus,
  Minus
} from 'lucide-react'

interface TableInsertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (tableMarkdown: string) => void
}

export function TableInsertDialog({
  open,
  onOpenChange,
  onInsert
}: TableInsertDialogProps) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const [includeHeaders, setIncludeHeaders] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  // Predefined table templates
  const templates = [
    {
      id: 'simple',
      name: 'Simple Table',
      description: 'Basic table with headers',
      rows: 3,
      cols: 3,
      headers: ['Column 1', 'Column 2', 'Column 3'],
      data: [
        ['Row 1 Col 1', 'Row 1 Col 2', 'Row 1 Col 3'],
        ['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3']
      ]
    },
    {
      id: 'comparison',
      name: 'Comparison Table',
      description: 'Feature comparison layout',
      rows: 4,
      cols: 3,
      headers: ['Feature', 'Option A', 'Option B'],
      data: [
        ['Price', '$10/month', '$20/month'],
        ['Storage', '10GB', '100GB'],
        ['Support', 'Email', '24/7 Phone']
      ]
    },
    {
      id: 'data',
      name: 'Data Table',
      description: 'Structured data presentation',
      rows: 5,
      cols: 4,
      headers: ['Name', 'Age', 'City', 'Score'],
      data: [
        ['John Doe', '25', 'New York', '85'],
        ['Jane Smith', '30', 'Los Angeles', '92'],
        ['Bob Johnson', '35', 'Chicago', '78'],
        ['Alice Brown', '28', 'Houston', '88']
      ]
    },
    {
      id: 'schedule',
      name: 'Schedule Table',
      description: 'Time-based layout',
      rows: 6,
      cols: 6,
      headers: ['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      data: [
        ['9:00 AM', 'Meeting', 'Development', 'Review', 'Planning', 'Demo'],
        ['10:00 AM', 'Code Review', 'Testing', 'Documentation', 'Research', 'Training'],
        ['11:00 AM', 'Development', 'Meeting', 'Development', 'Development', 'Meeting'],
        ['2:00 PM', 'Testing', 'Documentation', 'Testing', 'Code Review', 'Planning'],
        ['3:00 PM', 'Planning', 'Development', 'Meeting', 'Testing', 'Documentation']
      ]
    }
  ]

  // Generate table markdown
  const generateTableMarkdown = (
    numRows: number,
    numCols: number,
    withHeaders: boolean,
    template?: typeof templates[0]
  ): string => {
    let markdown = ''
    
    if (template) {
      // Use template data
      const headerRow = '| ' + template.headers.join(' | ') + ' |'
      markdown += headerRow + '\n'
      
      const alignmentRow = '|' + template.headers.map(() => ' --- ').join('|') + '|'
      markdown += alignmentRow + '\n'
      
      template.data.forEach(row => {
        const rowMarkdown = '| ' + row.join(' | ') + ' |'
        markdown += rowMarkdown + '\n'
      })
    } else {
      // Generate custom table
      if (withHeaders) {
        const headers = Array.from({ length: numCols }, (_, i) => `Header ${i + 1}`)
        const headerRow = '| ' + headers.join(' | ') + ' |'
        markdown += headerRow + '\n'
        
        const alignmentRow = '|' + Array.from({ length: numCols }, () => ' --- ').join('|') + '|'
        markdown += alignmentRow + '\n'
      }
      
      for (let i = 0; i < numRows; i++) {
        const cells = Array.from({ length: numCols }, (_, j) => `Cell ${i + 1}-${j + 1}`)
        const rowMarkdown = '| ' + cells.join(' | ') + ' |'
        markdown += rowMarkdown + '\n'
      }
    }
    
    return markdown
  }

  const handleInsert = () => {
    const template = selectedTemplate ? templates.find(t => t.id === selectedTemplate) : undefined
    const markdown = generateTableMarkdown(rows, cols, includeHeaders, template)
    onInsert(markdown)
    onOpenChange(false)
    
    // Reset state
    setSelectedTemplate(null)
    setRows(3)
    setCols(3)
    setIncludeHeaders(true)
  }

  const handleTemplateSelect = (template: typeof templates[0]) => {
    setSelectedTemplate(template.id)
    setRows(template.rows - 1) // Subtract header row
    setCols(template.cols)
    setIncludeHeaders(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table className="h-5 w-5" />
            Insert Table
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Quick Templates */}
          <div>
            <h3 className="font-semibold mb-3">Quick Templates</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                    selectedTemplate === template.id ? 'border-primary bg-accent' : ''
                  }`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{template.name}</h4>
                    <Badge variant="outline" className="text-xs">
                      {template.rows}×{template.cols}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Custom Table Configuration */}
          <div>
            <h3 className="font-semibold mb-3">Custom Table</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="rows">Rows</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRows(Math.max(1, rows - 1))}
                    disabled={rows <= 1}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    id="rows"
                    type="number"
                    min="1"
                    max="20"
                    value={rows}
                    onChange={(e) => setRows(parseInt(e.target.value) || 1)}
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRows(Math.min(20, rows + 1))}
                    disabled={rows >= 20}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="cols">Columns</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCols(Math.max(1, cols - 1))}
                    disabled={cols <= 1}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    id="cols"
                    type="number"
                    min="1"
                    max="10"
                    value={cols}
                    onChange={(e) => setCols(parseInt(e.target.value) || 1)}
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCols(Math.min(10, cols + 1))}
                    disabled={cols >= 10}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="headers"
                checked={includeHeaders}
                onChange={(e) => setIncludeHeaders(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="headers">Include header row</Label>
            </div>
          </div>

          {/* Preview */}
          <div>
            <h3 className="font-semibold mb-3">Preview</h3>
            <div className="border rounded-lg p-4 bg-muted/50 overflow-x-auto">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {includeHeaders && (
                  <>
                    {Array.from({ length: cols }, (_, i) => (
                      <div
                        key={`header-${i}`}
                        className="p-2 bg-background border text-center font-semibold text-sm"
                      >
                        Header {i + 1}
                      </div>
                    ))}
                  </>
                )}
                {Array.from({ length: rows }, (_, rowIndex) =>
                  Array.from({ length: cols }, (_, colIndex) => (
                    <div
                      key={`cell-${rowIndex}-${colIndex}`}
                      className="p-2 bg-background border text-center text-sm"
                    >
                      Cell {rowIndex + 1}-{colIndex + 1}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleInsert}>
              <Table className="h-4 w-4 mr-2" />
              Insert Table
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}