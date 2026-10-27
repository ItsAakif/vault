import { useCallback, useRef } from 'react'

interface ClickToEditOptions {
  content: string
  onNavigateToLine?: (lineNumber: number) => void
  enabled?: boolean
}

export function useClickToEdit({ 
  content, 
  onNavigateToLine, 
  enabled = true 
}: ClickToEditOptions) {
  const contentLinesRef = useRef<string[]>([])

  // Update content lines when content changes
  const updateContentLines = useCallback(() => {
    contentLinesRef.current = content.split('\n')
  }, [content])

  // Find line number from text content
  const findLineFromText = useCallback((searchText: string): number => {
    updateContentLines()
    
    const lines = contentLinesRef.current
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchText.trim())) {
        return i + 1 // Line numbers are 1-based
      }
    }
    return 1 // Default to first line if not found
  }, [updateContentLines])

  // Find line number from heading
  const findLineFromHeading = useCallback((headingText: string): number => {
    updateContentLines()
    
    const lines = contentLinesRef.current
    const cleanHeading = headingText.replace(/^#+\s*/, '').trim()
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.match(/^#+\s+/) && line.includes(cleanHeading)) {
        return i + 1
      }
    }
    return 1
  }, [updateContentLines])

  // Handle click on preview element
  const handlePreviewClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!enabled || !onNavigateToLine) return

    const target = event.target as HTMLElement
    
    // Handle heading clicks
    if (target.tagName.match(/^H[1-6]$/)) {
      const headingText = target.textContent || ''
      const lineNumber = findLineFromHeading(headingText)
      onNavigateToLine(lineNumber)
      return
    }

    // Handle paragraph clicks
    if (target.tagName === 'P') {
      const paragraphText = target.textContent || ''
      if (paragraphText.length > 10) { // Only for substantial paragraphs
        const searchText = paragraphText.substring(0, 50) // First 50 characters
        const lineNumber = findLineFromText(searchText)
        onNavigateToLine(lineNumber)
      }
      return
    }

    // Handle list item clicks
    if (target.tagName === 'LI') {
      const listText = target.textContent || ''
      const lineNumber = findLineFromText(listText)
      onNavigateToLine(lineNumber)
      return
    }

    // Handle code block clicks
    if (target.tagName === 'CODE' || target.closest('pre')) {
      const codeElement = target.tagName === 'CODE' ? target : target.closest('code')
      if (codeElement) {
        const codeText = codeElement.textContent || ''
        const lineNumber = findLineFromText(codeText)
        onNavigateToLine(lineNumber)
      }
      return
    }

    // Handle blockquote clicks
    if (target.tagName === 'BLOCKQUOTE' || target.closest('blockquote')) {
      const quoteElement = target.tagName === 'BLOCKQUOTE' ? target : target.closest('blockquote')
      if (quoteElement) {
        const quoteText = quoteElement.textContent || ''
        const lineNumber = findLineFromText(quoteText)
        onNavigateToLine(lineNumber)
      }
      return
    }

    // Handle table clicks
    if (target.tagName === 'TD' || target.tagName === 'TH') {
      const cellText = target.textContent || ''
      const lineNumber = findLineFromText(cellText)
      onNavigateToLine(lineNumber)
      return
    }
  }, [enabled, onNavigateToLine, findLineFromHeading, findLineFromText])

  // Get line range for a specific element type
  const getElementLineRange = useCallback((elementText: string, elementType: string): { start: number, end: number } => {
    updateContentLines()
    
    const lines = contentLinesRef.current
    let startLine = -1
    let endLine = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      if (startLine === -1 && line.includes(elementText.trim())) {
        startLine = i + 1
      }
      
      if (startLine !== -1) {
        // For headings, it's usually a single line
        if (elementType === 'heading') {
          endLine = startLine
          break
        }
        
        // For paragraphs, find the end of the paragraph
        if (elementType === 'paragraph') {
          if (i === lines.length - 1 || lines[i + 1].trim() === '') {
            endLine = i + 1
            break
          }
        }
        
        // For code blocks, find the closing ```
        if (elementType === 'codeblock') {
          if (line.includes('```') && i > startLine) {
            endLine = i + 1
            break
          }
        }
      }
    }

    return {
      start: startLine > 0 ? startLine : 1,
      end: endLine > 0 ? endLine : startLine > 0 ? startLine : 1
    }
  }, [updateContentLines])

  return {
    handlePreviewClick,
    findLineFromText,
    findLineFromHeading,
    getElementLineRange
  }
}