'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { CheckSquare, Square } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TaskListItem {
  id: string
  text: string
  completed: boolean
  indentLevel: number
}

interface TaskListPluginProps {
  onInsertTaskList?: () => void
  disabled?: boolean
}

export function TaskListPlugin({ onInsertTaskList, disabled = false }: TaskListPluginProps) {
  const handleInsertTaskList = useCallback(() => {
    if (onInsertTaskList) {
      onInsertTaskList()
    }
  }, [onInsertTaskList])

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleInsertTaskList}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <CheckSquare className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <div className="font-medium">Task List</div>
            <div className="text-xs text-muted-foreground">Ctrl+Shift+T</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Task list renderer component
export function TaskListRenderer({ 
  content, 
  onChange 
}: { 
  content: string
  onChange: (newContent: string) => void 
}) {
  const parseTaskList = useCallback((text: string): TaskListItem[] => {
    const lines = text.split('\n')
    const tasks: TaskListItem[] = []
    
    lines.forEach((line, index) => {
      const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/)
      if (taskMatch) {
        const [, indent, checked, text] = taskMatch
        tasks.push({
          id: `task-${index}`,
          text: text.trim(),
          completed: checked === 'x',
          indentLevel: indent.length / 2 // Assuming 2 spaces per indent level
        })
      }
    })
    
    return tasks
  }, [])

  const toggleTask = useCallback((taskId: string) => {
    const lines = content.split('\n')
    const newLines = lines.map((line, index) => {
      if (`task-${index}` === taskId) {
        const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/)
        if (taskMatch) {
          const [, indent, checked, text] = taskMatch
          const newChecked = checked === 'x' ? ' ' : 'x'
          return `${indent}- [${newChecked}] ${text}`
        }
      }
      return line
    })
    
    onChange(newLines.join('\n'))
  }, [content, onChange])

  const tasks = parseTaskList(content)

  if (tasks.length === 0) {
    return null
  }

  return (
    <div className="space-y-2 my-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-2"
          style={{ marginLeft: `${task.indentLevel * 1.5}rem` }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleTask(task.id)}
            className="h-5 w-5 p-0"
          >
            {task.completed ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </Button>
          <span
            className={`text-sm ${
              task.completed 
                ? 'line-through text-muted-foreground' 
                : 'text-foreground'
            }`}
          >
            {task.text}
          </span>
        </div>
      ))}
    </div>
  )
}

// Utility functions for task list manipulation
export const taskListUtils = {
  insertTaskList: (content: string, position: number): string => {
    const before = content.slice(0, position)
    const after = content.slice(position)
    const taskListTemplate = '\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n'
    return before + taskListTemplate + after
  },

  toggleTaskAtLine: (content: string, lineNumber: number): string => {
    const lines = content.split('\n')
    if (lineNumber >= 0 && lineNumber < lines.length) {
      const line = lines[lineNumber]
      const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/)
      
      if (taskMatch) {
        const [, indent, checked, text] = taskMatch
        const newChecked = checked === 'x' ? ' ' : 'x'
        lines[lineNumber] = `${indent}- [${newChecked}] ${text}`
      }
    }
    return lines.join('\n')
  },

  addTaskItem: (content: string, position: number, indentLevel: number = 0): string => {
    const before = content.slice(0, position)
    const after = content.slice(position)
    const indent = '  '.repeat(indentLevel)
    const newTask = `\n${indent}- [ ] New task`
    return before + newTask + after
  },

  indentTask: (content: string, lineNumber: number): string => {
    const lines = content.split('\n')
    if (lineNumber >= 0 && lineNumber < lines.length) {
      const line = lines[lineNumber]
      if (line.match(/^\s*- \[([ x])\]/)) {
        lines[lineNumber] = '  ' + line
      }
    }
    return lines.join('\n')
  },

  outdentTask: (content: string, lineNumber: number): string => {
    const lines = content.split('\n')
    if (lineNumber >= 0 && lineNumber < lines.length) {
      const line = lines[lineNumber]
      if (line.match(/^\s*- \[([ x])\]/)) {
        lines[lineNumber] = line.replace(/^  /, '')
      }
    }
    return lines.join('\n')
  }
}