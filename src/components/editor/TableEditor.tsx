'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { 
  Plus, 
  Minus, 
  MoreHorizontal,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface TableCell {
  content: string
  alignment?: 'left' | 'center' | 'right'
}

interface TableData {
  headers: TableCell[]
  rows: TableCell[][]
  caption?: string
}

interface TableEditorProps {
  initialTable?: TableData
  onSave?: (tableMarkdown: string) => void
  onCancel?: () => void
  className?: string
}

export function TableEditor({
  initialTable,
  onSave,
  onCancel,
  className
}: TableEditorProps) {
  const [table, setTable] = useState<TableData>(
    initialTable || {
      headers: [
        { content: 'Header 1', alignment: 'left' },
        { content: 'Header 2', alignment: 'left' },
        { content: 'Header 3', alignment: 'left' }
      ],
      rows: [
        [
          { content: 'Cell 1', alignment: 'left' },
          { content: 'Cell 2', alignment: 'left' },
          { content: 'Cell 3', alignment: 'left' }
        ],
        [
          { content: 'Cell 4', alignment: 'left' },
          { content: 'Cell 5', alignment: 'left' },
          { content: 'Cell 6', alignment: 'left' }
        ]
      ]
    }
  )
  
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null)
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newTableRows, setNewTableRows] = useState(3)
  const [newTableCols, setNewTableCols] = useState(3)
  
  const inputRefs = useRef<{ [key: string]: HTMLInputElement }>({})
  const { toast } = useToast()

  // Generate table markdown
  const generateMarkdown = useCallback((tableData: TableData): string => {
    const { headers, rows, caption } = tableData
    
    let markdown = ''
    
    // Add caption if present
    if (caption) {
      markdown += `*${caption}*\n\n`
    }
    
    // Headers
    const headerRow = '| ' + headers.map(h => h.content).join(' | ') + ' |'
    markdown += headerRow + '\n'
    
    // Alignment row
    const alignmentRow = '|' + headers.map(h => {
      switch (h.alignment) {
        case 'center': return ':---:'
        case 'right': return '---:'
        default: return '---'
      }
    }).map(a => ` ${a} `).join('|') + '|'
    markdown += alignmentRow + '\n'
    
    // Data rows
    rows.forEach(row => {
      const rowMarkdown = '| ' + row.map(cell => cell.content).join(' | ') + ' |'
      markdown += rowMarkdown + '\n'
    })
    
    return markdown
  }, [])

  // Parse markdown table
  const parseMarkdown = useCallback((markdown: string): TableData | null => {
    const lines = markdown.trim().split('\n').filter(line => line.trim())
    if (lines.length < 3) return null
    
    try {
      // Find table lines (starting with |)
      const tableLines = lines.filter(line => line.trim().startsWith('|'))
      if (tableLines.length < 3) return null
      
      const headerLine = tableLines[0]
      const alignmentLine = tableLines[1]
      const dataLines = tableLines.slice(2)
      
      // Parse headers
      const headerCells = headerLine.split('|').slice(1, -1).map(cell => cell.trim())
      const alignments = alignmentLine.split('|').slice(1, -1).map(cell => {
        const trimmed = cell.trim()
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center'
        if (trimmed.endsWith(':')) return 'right'
        return 'left'
      })
      
      const headers: TableCell[] = headerCells.map((content, index) => ({
        content,
        alignment: alignments[index] as 'left' | 'center' | 'right'
      }))
      
      // Parse rows
      const rows: TableCell[][] = dataLines.map(line => {
        const cells = line.split('|').slice(1, -1).map(cell => cell.trim())
        return cells.map((content, index) => ({
          content,
          alignment: alignments[index] as 'left' | 'center' | 'right'
        }))
      })
      
      return { headers, rows }
    } catch (error) {
      return null
    }
  }, [])

  // Handle cell content change
  const handleCellChange = useCallback((row: number, col: number, content: string) => {
    setTable(prev => {
      const newTable = { ...prev }
      
      if (row === -1) {
        // Header cell
        newTable.headers = [...prev.headers]
        newTable.headers[col] = { ...newTable.headers[col], content }
      } else {
        // Data cell
        newTable.rows = [...prev.rows]
        newTable.rows[row] = [...prev.rows[row]]
        newTable.rows[row][col] = { ...newTable.rows[row][col], content }
      }
      
      return newTable
    })
  }, [])

  // Handle cell alignment change
  const handleAlignmentChange = useCallback((row: number, col: number, alignment: 'left' | 'center' | 'right') => {
    setTable(prev => {
      const newTable = { ...prev }
      
      if (row === -1) {
        // Header alignment affects entire column
        newTable.headers = [...prev.headers]
        newTable.headers[col] = { ...newTable.headers[col], alignment }
        
        // Update all cells in this column
        newTable.rows = prev.rows.map(rowData => {
          const newRow = [...rowData]
          if (newRow[col]) {
            newRow[col] = { ...newRow[col], alignment }
          }
          return newRow
        })
      } else {
        // Individual cell alignment
        newTable.rows = [...prev.rows]
        newTable.rows[row] = [...prev.rows[row]]
        newTable.rows[row][col] = { ...newTable.rows[row][col], alignment }
      }
      
      return newTable
    })
  }, [])

  // Add column
  const addColumn = useCallback((index?: number) => {
    setTable(prev => {
      const insertIndex = index !== undefined ? index : prev.headers.length
      
      const newHeaders = [...prev.headers]
      newHeaders.splice(insertIndex, 0, { content: `Header ${insertIndex + 1}`, alignment: 'left' })
      
      const newRows = prev.rows.map(row => {
        const newRow = [...row]
        newRow.splice(insertIndex, 0, { content: '', alignment: 'left' })
        return newRow
      })
      
      return { ...prev, headers: newHeaders, rows: newRows }
    })
  }, [])

  // Remove column
  const removeColumn = useCallback((index: number) => {
    if (table.headers.length <= 1) {
      toast({
        title: 'Cannot remove column',
        description: 'Table must have at least one column',
        variant: 'destructive'
      })
      return
    }
    
    setTable(prev => {
      const newHeaders = prev.headers.filter((_, i) => i !== index)
      const newRows = prev.rows.map(row => row.filter((_, i) => i !== index))
      
      return { ...prev, headers: newHeaders, rows: newRows }
    })
  }, [table.headers.length, toast])

  // Add row
  const addRow = useCallback((index?: number) => {
    setTable(prev => {
      const insertIndex = index !== undefined ? index : prev.rows.length
      const newRow = prev.headers.map(() => ({ content: '', alignment: 'left' as const }))
      
      const newRows = [...prev.rows]
      newRows.splice(insertIndex, 0, newRow)
      
      return { ...prev, rows: newRows }
    })
  }, [])

  // Remove row
  const removeRow = useCallback((index: number) => {
    if (table.rows.length <= 1) {
      toast({
        title: 'Cannot remove row',
        description: 'Table must have at least one row',
        variant: 'destructive'
      })
      return
    }
    
    setTable(prev => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== index)
    }))
  }, [table.rows.length, toast])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, row: number, col: number) => {
    switch (e.key) {
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) {
          // Move to previous cell
          if (col > 0) {
            setSelectedCell({ row, col: col - 1 })
          } else if (row > -1) {
            setSelectedCell({ row: row - 1, col: table.headers.length - 1 })
          }
        } else {
          // Move to next cell
          if (col < table.headers.length - 1) {
            setSelectedCell({ row, col: col + 1 })
          } else if (row < table.rows.length - 1) {
            setSelectedCell({ row: row + 1, col: 0 })
          }
        }
        break
      
      case 'Enter':
        e.preventDefault()
        if (row < table.rows.length - 1) {
          setSelectedCell({ row: row + 1, col })
        } else {
          addRow()
          setSelectedCell({ row: table.rows.length, col })
        }
        break
      
      case 'ArrowUp':
        e.preventDefault()
        if (row > -1) {
          setSelectedCell({ row: row - 1, col })
        }
        break
      
      case 'ArrowDown':
        e.preventDefault()
        if (row < table.rows.length - 1) {
          setSelectedCell({ row: row + 1, col })
        }
        break
      
      case 'ArrowLeft':
        e.preventDefault()
        if (col > 0) {
          setSelectedCell({ row, col: col - 1 })
        }
        break
      
      case 'ArrowRight':
        e.preventDefault()
        if (col < table.headers.length - 1) {
          setSelectedCell({ row, col: col + 1 })
        }
        break
      
      case 'Escape':
        setEditingCell(null)
        setSelectedCell(null)
        break
    }
  }, [table.headers.length, table.rows.length, addRow])

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell) {
      const key = `${editingCell.row}-${editingCell.col}`
      const input = inputRefs.current[key]
      if (input) {
        input.focus()
        input.select()
      }
    }
  }, [editingCell])

  // Create new table
  const createNewTable = useCallback(() => {
    const headers = Array.from({ length: newTableCols }, (_, i) => ({
      content: `Header ${i + 1}`,
      alignment: 'left' as const
    }))
    
    const rows = Array.from({ length: newTableRows }, () =>
      Array.from({ length: newTableCols }, () => ({
        content: '',
        alignment: 'left' as const
      }))
    )
    
    setTable({ headers, rows })
    setShowCreateDialog(false)
  }, [newTableRows, newTableCols])

  // Save table
  const handleSave = useCallback(() => {
    const markdown = generateMarkdown(table)
    if (onSave) {
      onSave(markdown)
    }
  }, [table, generateMarkdown, onSave])

  const CellContextMenu = ({ row, col, children }: { row: number; col: number; children: React.ReactNode }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleAlignmentChange(row, col, 'left')}>
          <AlignLeft className="mr-2 h-4 w-4" />
          Align Left
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAlignmentChange(row, col, 'center')}>
          <AlignCenter className="mr-2 h-4 w-4" />
          Align Center
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAlignmentChange(row, col, 'right')}>
          <AlignRight className="mr-2 h-4 w-4" />
          Align Right
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={() => addColumn(col + 1)}>
          <Plus className="mr-2 h-4 w-4" />
          Insert Column Right
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => addColumn(col)}>
          <Plus className="mr-2 h-4 w-4" />
          Insert Column Left
        </DropdownMenuItem>
        
        {table.headers.length > 1 && (
          <DropdownMenuItem onClick={() => removeColumn(col)} className="text-destructive">
            <Minus className="mr-2 h-4 w-4" />
            Delete Column
          </DropdownMenuItem>
        )}
        
        {row >= 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => addRow(row + 1)}>
              <Plus className="mr-2 h-4 w-4" />
              Insert Row Below
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addRow(row)}>
              <Plus className="mr-2 h-4 w-4" />
              Insert Row Above
            </DropdownMenuItem>
            
            {table.rows.length > 1 && (
              <DropdownMenuItem onClick={() => removeRow(row)} className="text-destructive">
                <Minus className="mr-2 h-4 w-4" />
                Delete Row
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <Card className={cn('w-full max-w-4xl mx-auto', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Table className="h-5 w-5" />
            Table Editor
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Table
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Table</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="rows">Rows</Label>
                    <Input
                      id="rows"
                      type="number"
                      min="1"
                      max="20"
                      value={newTableRows}
                      onChange={(e) => setNewTableRows(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cols">Columns</Label>
                    <Input
                      id="cols"
                      type="number"
                      min="1"
                      max="10"
                      value={newTableCols}
                      onChange={(e) => setNewTableCols(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={createNewTable}>
                      Create Table
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button onClick={handleSave} size="sm">
              Save Table
            </Button>
            
            {onCancel && (
              <Button variant="outline" onClick={onCancel} size="sm">
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-border">
            {/* Headers */}
            <thead>
              <tr>
                {table.headers.map((header, colIndex) => (
                  <th
                    key={colIndex}
                    className={cn(
                      'border border-border bg-muted p-2 min-w-[120px] relative group',
                      selectedCell?.row === -1 && selectedCell?.col === colIndex && 'ring-2 ring-primary'
                    )}
                  >
                    <CellContextMenu row={-1} col={colIndex}>
                      <div
                        className="w-full cursor-pointer"
                        onClick={() => setSelectedCell({ row: -1, col: colIndex })}
                        onDoubleClick={() => setEditingCell({ row: -1, col: colIndex })}
                      >
                        {editingCell?.row === -1 && editingCell?.col === colIndex ? (
                          <Input
                            ref={(el) => {
                              if (el) inputRefs.current[`-1-${colIndex}`] = el
                            }}
                            value={header.content}
                            onChange={(e) => handleCellChange(-1, colIndex, e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={(e) => handleKeyDown(e, -1, colIndex)}
                            className="border-0 p-0 h-auto bg-transparent font-semibold"
                          />
                        ) : (
                          <div className={cn(
                            'font-semibold',
                            header.alignment === 'center' && 'text-center',
                            header.alignment === 'right' && 'text-right'
                          )}>
                            {header.content || 'Header'}
                          </div>
                        )}
                      </div>
                    </CellContextMenu>
                  </th>
                ))}
              </tr>
            </thead>
            
            {/* Data Rows */}
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className={cn(
                        'border border-border p-2 relative group',
                        selectedCell?.row === rowIndex && selectedCell?.col === colIndex && 'ring-2 ring-primary'
                      )}
                    >
                      <CellContextMenu row={rowIndex} col={colIndex}>
                        <div
                          className="w-full cursor-pointer min-h-[24px]"
                          onClick={() => setSelectedCell({ row: rowIndex, col: colIndex })}
                          onDoubleClick={() => setEditingCell({ row: rowIndex, col: colIndex })}
                        >
                          {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                            <Input
                              ref={(el) => {
                                if (el) inputRefs.current[`${rowIndex}-${colIndex}`] = el
                              }}
                              value={cell.content}
                              onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                              className="border-0 p-0 h-auto bg-transparent"
                            />
                          ) : (
                            <div className={cn(
                              cell.alignment === 'center' && 'text-center',
                              cell.alignment === 'right' && 'text-right'
                            )}>
                              {cell.content || '\u00A0'}
                            </div>
                          )}
                        </div>
                      </CellContextMenu>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Table Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => addRow()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Row
            </Button>
            <Button variant="outline" size="sm" onClick={() => addColumn()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Column
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground">
            {table.rows.length} rows × {table.headers.length} columns
          </div>
        </div>
        
        {/* Keyboard Shortcuts Help */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-sm font-medium mb-2">Keyboard Shortcuts:</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>Tab / Shift+Tab: Navigate cells</div>
            <div>Enter: Move to next row</div>
            <div>Double-click: Edit cell</div>
            <div>Right-click: Context menu</div>
            <div>Arrow keys: Navigate</div>
            <div>Escape: Exit editing</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}