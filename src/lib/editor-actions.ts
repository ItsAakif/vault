import { type MDXEditorMethods } from '@mdxeditor/editor'

export class EditorActions {
  private editorRef: React.RefObject<MDXEditorMethods>

  constructor(editorRef: React.RefObject<MDXEditorMethods>) {
    this.editorRef = editorRef
  }

  // Get current editor instance
  private getEditor(): MDXEditorMethods | null {
    return this.editorRef.current
  }

  // Get current selection or cursor position
  private getSelection(): Selection | null {
    return window.getSelection()
  }

  // Insert text at cursor position
  private insertText(text: string): void {
    const selection = this.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(text))
      
      // Move cursor to end of inserted text
      range.setStartAfter(range.endContainer)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  // Wrap selected text with markdown syntax
  private wrapSelection(before: string, after: string = before, placeholder: string = ''): void {
    const selection = this.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const selectedText = range.toString()
      const textToWrap = selectedText || placeholder
      
      range.deleteContents()
      range.insertNode(document.createTextNode(before + textToWrap + after))
      
      // Select the wrapped text (excluding the wrapper)
      if (!selectedText && placeholder) {
        const newRange = document.createRange()
        newRange.setStart(range.endContainer, before.length)
        newRange.setEnd(range.endContainer, before.length + placeholder.length)
        selection.removeAllRanges()
        selection.addRange(newRange)
      }
    }
  }

  // Insert text at beginning of line
  private insertAtLineStart(prefix: string): void {
    const selection = this.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const container = range.startContainer
      
      // Find the start of the current line
      let lineStart = range.startOffset
      const text = container.textContent || ''
      
      while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--
      }
      
      // Insert prefix at line start
      const newRange = document.createRange()
      newRange.setStart(container, lineStart)
      newRange.collapse(true)
      newRange.insertNode(document.createTextNode(prefix))
    }
  }

  // Document Actions
  save(): void {
    // This should be handled by the parent component
    document.dispatchEvent(new CustomEvent('editor:save'))
  }

  undo(): void {
    document.execCommand('undo')
  }

  redo(): void {
    document.execCommand('redo')
  }

  // Text Formatting
  bold(): void {
    this.wrapSelection('**', '**', 'bold text')
  }

  italic(): void {
    this.wrapSelection('*', '*', 'italic text')
  }

  underline(): void {
    this.wrapSelection('<u>', '</u>', 'underlined text')
  }

  strikethrough(): void {
    this.wrapSelection('~~', '~~', 'strikethrough text')
  }

  code(): void {
    this.wrapSelection('`', '`', 'code')
  }

  // Headings
  heading1(): void {
    this.insertAtLineStart('# ')
  }

  heading2(): void {
    this.insertAtLineStart('## ')
  }

  heading3(): void {
    this.insertAtLineStart('### ')
  }

  heading4(): void {
    this.insertAtLineStart('#### ')
  }

  heading5(): void {
    this.insertAtLineStart('##### ')
  }

  heading6(): void {
    this.insertAtLineStart('###### ')
  }

  // Lists
  bulletList(): void {
    this.insertAtLineStart('- ')
  }

  numberedList(): void {
    this.insertAtLineStart('1. ')
  }

  taskList(): void {
    this.insertAtLineStart('- [ ] ')
  }

  indent(): void {
    const selection = this.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const container = range.startContainer
      
      // Find line start and add indentation
      let lineStart = range.startOffset
      const text = container.textContent || ''
      
      while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--
      }
      
      const newRange = document.createRange()
      newRange.setStart(container, lineStart)
      newRange.collapse(true)
      newRange.insertNode(document.createTextNode('  '))
    }
  }

  outdent(): void {
    const selection = this.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const container = range.startContainer
      const text = container.textContent || ''
      
      // Find line start
      let lineStart = range.startOffset
      while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--
      }
      
      // Remove up to 2 spaces at line start
      if (text.substring(lineStart, lineStart + 2) === '  ') {
        const newRange = document.createRange()
        newRange.setStart(container, lineStart)
        newRange.setEnd(container, lineStart + 2)
        newRange.deleteContents()
      } else if (text.substring(lineStart, lineStart + 1) === ' ') {
        const newRange = document.createRange()
        newRange.setStart(container, lineStart)
        newRange.setEnd(container, lineStart + 1)
        newRange.deleteContents()
      }
    }
  }

  // Insert Elements
  link(): void {
    const selection = this.getSelection()
    const selectedText = selection?.toString() || ''
    const linkText = selectedText || 'link text'
    this.insertText(`[${linkText}](url)`)
  }

  image(): void {
    this.insertText('![alt text](image-url)')
  }

  table(): void {
    const tableMarkdown = `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`
    this.insertText(tableMarkdown)
  }

  codeBlock(): void {
    const codeBlockMarkdown = '\n```\ncode\n```\n'
    this.insertText(codeBlockMarkdown)
  }

  quote(): void {
    this.insertAtLineStart('> ')
  }

  horizontalRule(): void {
    this.insertText('\n---\n')
  }

  // Selection and Editing
  selectAll(): void {
    document.execCommand('selectAll')
  }

  copy(): void {
    document.execCommand('copy')
  }

  cut(): void {
    document.execCommand('cut')
  }

  paste(): void {
    document.execCommand('paste')
  }

  duplicate(): void {
    const selection = this.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const container = range.startContainer
      const text = container.textContent || ''
      
      // Find current line boundaries
      let lineStart = range.startOffset
      let lineEnd = range.startOffset
      
      while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--
      }
      
      while (lineEnd < text.length && text[lineEnd] !== '\n') {
        lineEnd++
      }
      
      const currentLine = text.substring(lineStart, lineEnd)
      
      // Insert duplicate line
      const newRange = document.createRange()
      newRange.setStart(container, lineEnd)
      newRange.collapse(true)
      newRange.insertNode(document.createTextNode('\n' + currentLine))
    }
  }

  deleteLine(): void {
    const selection = this.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const container = range.startContainer
      const text = container.textContent || ''
      
      // Find current line boundaries
      let lineStart = range.startOffset
      let lineEnd = range.startOffset
      
      while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--
      }
      
      while (lineEnd < text.length && text[lineEnd] !== '\n') {
        lineEnd++
      }
      
      // Include the newline character if it exists
      if (lineEnd < text.length) {
        lineEnd++
      }
      
      // Delete the entire line
      const deleteRange = document.createRange()
      deleteRange.setStart(container, lineStart)
      deleteRange.setEnd(container, lineEnd)
      deleteRange.deleteContents()
    }
  }

  // View Controls (these should be handled by parent component)
  viewEdit(): void {
    document.dispatchEvent(new CustomEvent('editor:view-edit'))
  }

  viewPreview(): void {
    document.dispatchEvent(new CustomEvent('editor:view-preview'))
  }

  viewSplit(): void {
    document.dispatchEvent(new CustomEvent('editor:view-split'))
  }

  fullscreen(): void {
    document.dispatchEvent(new CustomEvent('editor:fullscreen'))
  }

  // Search
  find(): void {
    document.dispatchEvent(new CustomEvent('editor:find'))
  }

  replace(): void {
    document.dispatchEvent(new CustomEvent('editor:replace'))
  }

  // Help
  help(): void {
    document.dispatchEvent(new CustomEvent('editor:help'))
  }
}