import { useWebSocket } from '@/hooks/use-websocket'
import { useAppStore } from '@/store'

// Real-time sync utilities for different data types
export class RealtimeSync {
  private static instance: RealtimeSync
  private websocket: any

  constructor() {
    // Initialize with empty websocket object - will be set by the hook
    this.websocket = {
      sendContentUpdate: () => {},
      sendProjectUpdate: () => {},
      sendJobUpdate: () => {},
      sendCalendarUpdate: () => {}
    }
  }

  static getInstance(): RealtimeSync {
    if (!RealtimeSync.instance) {
      RealtimeSync.instance = new RealtimeSync()
    }
    return RealtimeSync.instance
  }

  // Set websocket methods from hook
  setWebSocketMethods(methods: any) {
    this.websocket = methods
  }

  // Content sync methods
  syncContentUpdate(data: any) {
    this.websocket.sendContentUpdate(data)
  }

  handleContentUpdate(data: any) {
    const { setContentItems, updateContentItem, addContentItem } = useAppStore.getState()
    
    if (data.action === 'update') {
      updateContentItem(data.id, data.updates)
    } else if (data.action === 'create') {
      addContentItem(data.item)
    } else if (data.action === 'delete') {
      setContentItems(useAppStore.getState().contentItems.filter(item => item.id !== data.id))
    }
  }

  // Project sync methods
  syncProjectUpdate(data: any) {
    this.websocket.sendProjectUpdate(data)
  }

  handleProjectUpdate(data: any) {
    const { setProjects, projects, addProject } = useAppStore.getState()
    
    if (data.action === 'update') {
      setProjects(projects.map(project => 
        project.id === data.id ? { ...project, ...data.updates } : project
      ))
    } else if (data.action === 'create') {
      addProject(data.project)
    } else if (data.action === 'delete') {
      setProjects(projects.filter(project => project.id !== data.id))
    }
  }

  // Job sync methods
  syncJobUpdate(data: any) {
    this.websocket.sendJobUpdate(data)
  }

  handleJobUpdate(data: any) {
    const { setJobs, jobs, addJob } = useAppStore.getState()
    
    if (data.action === 'update') {
      setJobs(jobs.map(job => 
        job.id === data.id ? { ...job, ...data.updates } : job
      ))
    } else if (data.action === 'create') {
      addJob(data.job)
    } else if (data.action === 'delete') {
      setJobs(jobs.filter(job => job.id !== data.id))
    }
  }

  // Calendar sync methods
  syncCalendarUpdate(data: any) {
    this.websocket.sendCalendarUpdate(data)
  }

  handleCalendarUpdate(data: any) {
    const { setCalendarEvents, calendarEvents, addCalendarEvent } = useAppStore.getState()
    
    if (data.action === 'update') {
      setCalendarEvents(calendarEvents.map(event => 
        event.id === data.id ? { ...event, ...data.updates } : event
      ))
    } else if (data.action === 'create') {
      addCalendarEvent(data.event)
    } else if (data.action === 'delete') {
      setCalendarEvents(calendarEvents.filter(event => event.id !== data.id))
    }
  }
}

// Hook for real-time data synchronization
export function useRealtimeSync() {
  const realtimeSync = RealtimeSync.getInstance()
  
  const { 
    sendContentUpdate,
    sendProjectUpdate,
    sendJobUpdate,
    sendCalendarUpdate,
    onContentUpdate,
    onProjectUpdate,
    onJobUpdate,
    onCalendarUpdate
  } = useWebSocket({
    onContentUpdate: (data) => realtimeSync.handleContentUpdate(data),
    onProjectUpdate: (data) => realtimeSync.handleProjectUpdate(data),
    onJobUpdate: (data) => realtimeSync.handleJobUpdate(data),
    onCalendarUpdate: (data) => realtimeSync.handleCalendarUpdate(data)
  })

  // Set the websocket methods in the singleton
  realtimeSync.setWebSocketMethods({
    sendContentUpdate,
    sendProjectUpdate,
    sendJobUpdate,
    sendCalendarUpdate
  })
  
  return {
    syncContentUpdate: realtimeSync.syncContentUpdate.bind(realtimeSync),
    syncProjectUpdate: realtimeSync.syncProjectUpdate.bind(realtimeSync),
    syncJobUpdate: realtimeSync.syncJobUpdate.bind(realtimeSync),
    syncCalendarUpdate: realtimeSync.syncCalendarUpdate.bind(realtimeSync)
  }
}

// Enhanced API wrapper with real-time sync
export async function fetchWithSync(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options)
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = await response.json()
  
  // Trigger real-time sync based on the endpoint and method
  const realtimeSync = RealtimeSync.getInstance()
  
  if (url.includes('/content')) {
    if (options.method === 'POST') {
      realtimeSync.syncContentUpdate({ action: 'create', item: data })
    } else if (options.method === 'PUT' || options.method === 'PATCH') {
      realtimeSync.syncContentUpdate({ action: 'update', id: data.id, updates: data })
    } else if (options.method === 'DELETE') {
      realtimeSync.syncContentUpdate({ action: 'delete', id: url.split('/').pop() })
    }
  } else if (url.includes('/projects')) {
    if (options.method === 'POST') {
      realtimeSync.syncProjectUpdate({ action: 'create', project: data })
    } else if (options.method === 'PUT' || options.method === 'PATCH') {
      realtimeSync.syncProjectUpdate({ action: 'update', id: data.id, updates: data })
    } else if (options.method === 'DELETE') {
      realtimeSync.syncProjectUpdate({ action: 'delete', id: url.split('/').pop() })
    }
  } else if (url.includes('/jobs')) {
    if (options.method === 'POST') {
      realtimeSync.syncJobUpdate({ action: 'create', job: data })
    } else if (options.method === 'PUT' || options.method === 'PATCH') {
      realtimeSync.syncJobUpdate({ action: 'update', id: data.id, updates: data })
    } else if (options.method === 'DELETE') {
      realtimeSync.syncJobUpdate({ action: 'delete', id: url.split('/').pop() })
    }
  } else if (url.includes('/calendar')) {
    if (options.method === 'POST') {
      realtimeSync.syncCalendarUpdate({ action: 'create', event: data })
    } else if (options.method === 'PUT' || options.method === 'PATCH') {
      realtimeSync.syncCalendarUpdate({ action: 'update', id: data.id, updates: data })
    } else if (options.method === 'DELETE') {
      realtimeSync.syncCalendarUpdate({ action: 'delete', id: url.split('/').pop() })
    }
  }
  
  return data
}

// Real-time event emitter for custom events
class RealtimeEventEmitter {
  private listeners: Map<string, ((data: any) => void)[]> = new Map()

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  emit(event: string, data: any) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    }
  }
}

export const realtimeEvents = new RealtimeEventEmitter()