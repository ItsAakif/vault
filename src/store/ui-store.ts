import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export interface UIState {
  // Theme
  theme: 'light' | 'dark' | 'system'
  
  // Layout
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  mobileMenuOpen: boolean
  
  // Modals
  activeModal: string | null
  modalData: any
  
  // Notifications
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    title?: string
    description: string
    duration?: number
    persistent?: boolean
    action?: {
      label: string
      onClick: () => void
    }
  }>
  
  // Loading states
  loadingStates: Record<string, boolean>
  
  // Drag and drop
  dragItem: any | null
  dragOverItem: any | null
  
  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setMobileMenuOpen: (open: boolean) => void
  setActiveModal: (modal: string | null, data?: any) => void
  addNotification: (notification: Omit<UIState['notifications'][0], 'id'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  setLoading: (key: string, loading: boolean) => void
  setDragItem: (item: any) => void
  setDragOverItem: (item: any) => void
  
  // Helpers
  isDarkMode: () => boolean
}

const initialState = {
  theme: 'system' as const,
  // Closed by default: the shell's rail renders a mobile Sheet carrying
  // `lg:hidden`, so `true` would open the navigation sheet on first load for a
  // narrow-viewport (persisted) visitor. Fixes the first-render defect carried
  // forward from the shell task (batch-gate-plan.md; ADR-010 D2).
  sidebarOpen: false,
  sidebarCollapsed: false,
  mobileMenuOpen: false,
  activeModal: null,
  modalData: null,
  notifications: [],
  loadingStates: {},
  dragItem: null,
  dragOverItem: null
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // Theme actions
        setTheme: (theme) => set({ theme }),
        
        // Layout actions
        setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
        setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
        setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
        
        // Modal actions
        setActiveModal: (activeModal, modalData = null) => set({ 
          activeModal, 
          modalData 
        }),
        
        // Notification actions
        addNotification: (notification) => set((state) => ({
          notifications: [
            ...state.notifications,
            {
              ...notification,
              id: `notification-${Date.now()}-${Math.random()}`
            }
          ]
        })),
        
        removeNotification: (id) => set((state) => ({
          notifications: state.notifications.filter(n => n.id !== id)
        })),
        
        clearNotifications: () => set({ notifications: [] }),
        
        // Loading actions
        setLoading: (key, loading) => set((state) => ({
          loadingStates: {
            ...state.loadingStates,
            [key]: loading
          }
        })),
        
        // Drag and drop actions
        setDragItem: (dragItem) => set({ dragItem }),
        setDragOverItem: (dragOverItem) => set({ dragOverItem }),
        
        // Helpers
        isDarkMode: () => {
          const { theme } = get()
          if (theme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches
          }
          return theme === 'dark'
        }
      }),
      {
        name: 'ui-storage',
        partialize: (state) => ({
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
          sidebarCollapsed: state.sidebarCollapsed
        })
      }
    ),
    { name: 'ui-store' }
  )
)