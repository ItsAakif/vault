import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { vi } from 'vitest'

// Mock session for testing
const mockSession = {
  user: {
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    image: null
  },
  expires: '2024-12-31'
}

// Create a custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0
      }
    }
  })

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={mockSession}>
        <ThemeProvider attribute="class" defaultTheme="light">
          {children}
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }

// Test data factories
export const createMockProject = (overrides = {}) => ({
  id: 'project-1',
  title: 'Test Project',
  description: 'A test project',
  status: 'ACTIVE',
  priority: 'MEDIUM',
  progress: 50,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  userId: 'test-user-id',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  tasks: [],
  collaborators: [],
  ...overrides
})

export const createMockTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Test Task',
  description: 'A test task',
  status: 'TODO',
  priority: 'MEDIUM',
  projectId: 'project-1',
  userId: 'test-user-id',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
})

export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  avatar: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
})

export const createMockCalendarEvent = (overrides = {}) => ({
  id: 'event-1',
  title: 'Test Event',
  description: 'A test event',
  startTime: new Date('2024-06-01T10:00:00Z'),
  endTime: new Date('2024-06-01T11:00:00Z'),
  allDay: false,
  userId: 'test-user-id',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
})

export const createMockNotification = (overrides = {}) => ({
  id: 'notification-1',
  type: 'task_due',
  title: 'Task Due',
  message: 'Your task is due soon',
  userId: 'test-user-id',
  status: 'pending',
  priority: 'medium',
  channels: ['in_app'],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
})

// Mock API responses
export const mockApiResponse = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
})

// Mock fetch
export const mockFetch = (responses: Array<{ url: string; response: any; status?: number }>) => {
  const originalFetch = global.fetch
  
  global.fetch = vi.fn((url: string, options?: any) => {
    const matchedResponse = responses.find(r => url.includes(r.url))
    
    if (matchedResponse) {
      return Promise.resolve(mockApiResponse(matchedResponse.response, matchedResponse.status))
    }
    
    return Promise.reject(new Error(`No mock response found for ${url}`))
  }) as unknown as typeof fetch
  
  return () => {
    global.fetch = originalFetch
  }
}

// Wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0))

// Mock localStorage
export const mockLocalStorage = () => {
  const store: Record<string, string> = {}
  
  const mockStorage = {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key])
    })
  }
  
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage
  })
  
  return mockStorage
}

// Mock IntersectionObserver
export const mockIntersectionObserver = () => {
  const mockObserver = {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }
  
  global.IntersectionObserver = vi.fn(() => mockObserver) as unknown as typeof IntersectionObserver
  
  return mockObserver
}

// Mock ResizeObserver
export const mockResizeObserver = () => {
  const mockObserver = {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }
  
  global.ResizeObserver = vi.fn(() => mockObserver)
  
  return mockObserver
}

// Mock next/router
export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  pathname: '/',
  query: {},
  asPath: '/',
  route: '/',
  events: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}

// Mock next/navigation
export const mockNavigation = {
  useRouter: () => mockRouter,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn()
}

// Test helpers for async components
export const renderAsync = async (component: React.ReactElement) => {
  const result = customRender(component)
  await waitForAsync()
  return result
}

// Custom matchers
// (toHaveClass / toBeInTheDocument are provided by @testing-library/jest-dom/vitest,
//  registered globally in src/__tests__/setup.ts — no local expect.extend needed.)

// Performance testing utilities
export const measureRenderTime = async (component: React.ReactElement) => {
  const start = performance.now()
  const result = customRender(component)
  await waitForAsync()
  const end = performance.now()
  
  return {
    renderTime: end - start,
    result
  }
}

// Mock WebSocket
export const mockWebSocket = () => {
  const mockWs = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: WebSocket.OPEN,
    CONNECTING: WebSocket.CONNECTING,
    OPEN: WebSocket.OPEN,
    CLOSING: WebSocket.CLOSING,
    CLOSED: WebSocket.CLOSED
  }
  
  global.WebSocket = vi.fn(() => mockWs) as any
  
  return mockWs
}

// Mock Service Worker
export const mockServiceWorker = () => {
  const mockRegistration = {
    installing: null,
    waiting: null,
    active: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    update: vi.fn(),
    unregister: vi.fn()
  }
  
  const mockServiceWorker = {
    register: vi.fn(() => Promise.resolve(mockRegistration)),
    getRegistration: vi.fn(() => Promise.resolve(mockRegistration)),
    getRegistrations: vi.fn(() => Promise.resolve([mockRegistration])),
    ready: Promise.resolve(mockRegistration)
  }
  
  Object.defineProperty(navigator, 'serviceWorker', {
    value: mockServiceWorker,
    writable: true
  })
  
  return { mockServiceWorker, mockRegistration }
}

// Database testing utilities
export const createTestDatabase = async () => {
  // This would set up a test database
  // For now, we'll mock it
  return {
    cleanup: vi.fn(),
    seed: vi.fn(),
    reset: vi.fn()
  }
}

// File upload testing
export const createMockFile = (name = 'test.txt', content = 'test content', type = 'text/plain') => {
  return new File([content], name, { type })
}

// Drag and drop testing
export const createDragEvent = (type: string, dataTransfer?: Partial<DataTransfer>) => {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      getData: vi.fn(),
      setData: vi.fn(),
      clearData: vi.fn(),
      files: [],
      items: [],
      types: [],
      effectAllowed: 'all',
      dropEffect: 'none',
      ...dataTransfer
    }
  })
  return event
}

// Form testing utilities
export const fillForm = (container: HTMLElement, values: Record<string, string>) => {
  Object.entries(values).forEach(([name, value]) => {
    const input = container.querySelector(`[name="${name}"]`) as HTMLInputElement
    if (input) {
      input.value = value
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
}

// Animation testing
export const mockAnimations = () => {
  const mockAnimate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
    pause: vi.fn(),
    play: vi.fn()
  }))
  
  Element.prototype.animate = mockAnimate as unknown as Element['animate']
  
  return mockAnimate
}

// Cleanup utilities
export const cleanup = () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  
  // Reset DOM
  document.body.innerHTML = ''
  
  // Clear localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear()
  }
  
  // Clear sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.clear()
  }
}