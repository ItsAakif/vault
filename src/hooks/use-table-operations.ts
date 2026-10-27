import { useCallback } from 'react'

export interface TableCell {
  content: string
  alignment?: 'left' | 'center' | 'right'
}

export interface TableData {
  headers: TableCell[]
  rows: TableCell[][]
  caption?: string
}

export function useTableOperations() {
  
  // Parse markdown table to structured data
  const parseMarkdownTable = useCallback((markdown: string): TableData | null => {
    try {
      const lines = markdown.trim().split('\n').filter(line => line.trim())
      if (lines.length < 3) return null
      
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
      console.error('Error parsing markdown table:', error)
      return null
    }
  }, [])

  // Generate markdown from structured table data
  const generateMarkdownTable = useCallback((tableData: TableData): string => {
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

  // Create a simple table with specified dimensions
  const createSimpleTable = useCallback((rows: number, cols: number, includeHeaders: boolean = true): string => {
    let markdown = ''
    
    if (includeHeaders) {
      // Headers
      const headers = Array.from({ length: cols }, (_, i) => `Header ${i + 1}`)
      const headerRow = '| ' + headers.join(' | ') + ' |'
      markdown += headerRow + '\n'
      
      // Alignment row
      const alignmentRow = '|' + Array.from({ length: cols }, () => ' --- ').join('|') + '|'
      markdown += alignmentRow + '\n'
    }
    
    // Data rows
    for (let i = 0; i < rows; i++) {
      const cells = Array.from({ length: cols }, (_, j) => `Cell ${i + 1}-${j + 1}`)
      const rowMarkdown = '| ' + cells.join(' | ') + ' |'
      markdown += rowMarkdown + '\n'
    }
    
    return markdown
  }, [])

  // Add a column to existing table markdown
  const addColumnToTable = useCallback((markdown: string, position?: number): string => {
    const tableData = parseMarkdownTable(markdown)
    if (!tableData) return markdown
    
    const insertIndex = position !== undefined ? position : tableData.headers.length
    
    // Add header
    const newHeaders = [...tableData.headers]
    newHeaders.splice(insertIndex, 0, { content: `Header ${insertIndex + 1}`, alignment: 'left' })
    
    // Add cells to each row
    const newRows = tableData.rows.map(row => {
      const newRow = [...row]
      newRow.splice(insertIndex, 0, { content: '', alignment: 'left' })
      return newRow
    })
    
    return generateMarkdownTable({ ...tableData, headers: newHeaders, rows: newRows })
  }, [parseMarkdownTable, generateMarkdownTable])

  // Remove a column from existing table markdown
  const removeColumnFromTable = useCallback((markdown: string, columnIndex: number): string => {
    const tableData = parseMarkdownTable(markdown)
    if (!tableData || tableData.headers.length <= 1) return markdown
    
    const newHeaders = tableData.headers.filter((_, i) => i !== columnIndex)
    const newRows = tableData.rows.map(row => row.filter((_, i) => i !== columnIndex))
    
    return generateMarkdownTable({ ...tableData, headers: newHeaders, rows: newRows })
  }, [parseMarkdownTable, generateMarkdownTable])

  // Add a row to existing table markdown
  const addRowToTable = useCallback((markdown: string, position?: number): string => {
    const tableData = parseMarkdownTable(markdown)
    if (!tableData) return markdown
    
    const insertIndex = position !== undefined ? position : tableData.rows.length
    const newRow = tableData.headers.map(() => ({ content: '', alignment: 'left' as const }))
    
    const newRows = [...tableData.rows]
    newRows.splice(insertIndex, 0, newRow)
    
    return generateMarkdownTable({ ...tableData, rows: newRows })
  }, [parseMarkdownTable, generateMarkdownTable])

  // Remove a row from existing table markdown
  const removeRowFromTable = useCallback((markdown: string, rowIndex: number): string => {
    const tableData = parseMarkdownTable(markdown)
    if (!tableData || tableData.rows.length <= 1) return markdown
    
    const newRows = tableData.rows.filter((_, i) => i !== rowIndex)
    
    return generateMarkdownTable({ ...tableData, rows: newRows })
  }, [parseMarkdownTable, generateMarkdownTable])

  // Update cell content in table markdown
  const updateTableCell = useCallback((
    markdown: string, 
    row: number, 
    col: number, 
    content: string
  ): string => {
    const tableData = parseMarkdownTable(markdown)
    if (!tableData) return markdown
    
    if (row === -1) {
      // Update header
      if (col >= 0 && col < tableData.headers.length) {
        const newHeaders = [...tableData.headers]
        newHeaders[col] = { ...newHeaders[col], content }
        return generateMarkdownTable({ ...tableData, headers: newHeaders })
      }
    } else {
      // Update data cell
      if (row >= 0 && row < tableData.rows.length && col >= 0 && col < tableData.rows[row].length) {
        const newRows = [...tableData.rows]
        newRows[row] = [...newRows[row]]
        newRows[row][col] = { ...newRows[row][col], content }
        return generateMarkdownTable({ ...tableData, rows: newRows })
      }
    }
    
    return markdown
  }, [parseMarkdownTable, generateMarkdownTable])

  // Update cell alignment in table markdown
  const updateTableCellAlignment = useCallback((
    markdown: string, 
    row: number, 
    col: number, 
    alignment: 'left' | 'center' | 'right'
  ): string => {
    const tableData = parseMarkdownTable(markdown)
    if (!tableData) return markdown
    
    if (row === -1) {
      // Update header alignment (affects entire column)
      if (col >= 0 && col < tableData.headers.length) {
        const newHeaders = [...tableData.headers]
        newHeaders[col] = { ...newHeaders[col], alignment }
        
        // Update all cells in this column
        const newRows = tableData.rows.map(rowData => {
          const newRow = [...rowData]
          if (newRow[col]) {
            newRow[col] = { ...newRow[col], alignment }
          }
          return newRow
        })
        
        return generateMarkdownTable({ ...tableData, headers: newHeaders, rows: newRows })
      }
    } else {
      // Update individual cell alignment
      if (row >= 0 && row < tableData.rows.length && col >= 0 && col < tableData.rows[row].length) {
        const newRows = [...tableData.rows]
        newRows[row] = [...newRows[row]]
        newRows[row][col] = { ...newRows[row][col], alignment }
        return generateMarkdownTable({ ...tableData, rows: newRows })
      }
    }
    
    return markdown
  }, [parseMarkdownTable, generateMarkdownTable])

  // Check if text contains a markdown table
  const isMarkdownTable = useCallback((text: string): boolean => {
    const lines = text.trim().split('\n')
    if (lines.length < 3) return false
    
    // Check if we have at least 3 lines that look like table rows
    const tableLines = lines.filter(line => {
      const trimmed = line.trim()
      return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')
    })
    
    if (tableLines.length < 3) return false
    
    // Check if second line looks like alignment row
    const secondLine = tableLines[1]
    const alignmentPattern = /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|$/
    
    return alignmentPattern.test(secondLine)
  }, [])

  // Extract table from markdown text (finds first table)
  const extractTableFromMarkdown = useCallback((markdown: string): { table: string; start: number; end: number } | null => {
    const lines = markdown.split('\n')
    
    for (let i = 0; i < lines.length - 2; i++) {
      const currentLine = lines[i].trim()
      const nextLine = lines[i + 1].trim()
      
      // Check if current line looks like a table header
      if (currentLine.startsWith('|') && currentLine.endsWith('|')) {
        // Check if next line is alignment row
        const alignmentPattern = /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|$/
        if (alignmentPattern.test(nextLine)) {
          // Find the end of the table
          let endIndex = i + 2
          while (endIndex < lines.length && lines[endIndex].trim().startsWith('|')) {
            endIndex++
          }
          
          const tableLines = lines.slice(i, endIndex)
          return {
            table: tableLines.join('\n'),
            start: i,
            end: endIndex - 1
          }
        }
      }
    }
    
    return null
  }, [])

  return {
    parseMarkdownTable,
    generateMarkdownTable,
    createSimpleTable,
    addColumnToTable,
    removeColumnFromTable,
    addRowToTable,
    removeRowFromTable,
    updateTableCell,
    updateTableCellAlignment,
    isMarkdownTable,
    extractTableFromMarkdown
  }
}