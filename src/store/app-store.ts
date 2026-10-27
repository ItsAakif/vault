import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { 
  User, 
  ContentItem, 
  Category, 
  Tag, 
  File, 
  Project, 
  Task, 
  JobOpportunity, 
  CalendarEvent,
  ContentType,
  Priority,
  ProjectStatus,
  TaskStatus,
  ApplicationStage
} from '@/lib/db'

export interface AppState {
  // User state
  user: User | null
  isAuthenticated: boolean
  
  // Content state
  contentItems: ContentItem[]
  currentContent: ContentItem | null
  contentLoading: boolean
  contentError: string | null
  
  // Categories state
  categories: Category[]
  currentCategory: Category | null
  
  // Tags state
  tags: Tag[]
  selectedTags: string[]
  
  // Files state
  files: File[]
  uploadingFiles: boolean
  
  // Projects state
  projects: Project[]
  currentProject: Project | null
  projectTasks: Task[]
  
  // Jobs state
  jobs: JobOpportunity[]
  currentJob: JobOpportunity | null
  
  // Calendar state
  //
  // T090: a calendar count has THREE states, not two, and `calendarEvents.length` alone cannot
  // tell two of them apart:
  //
  //   unknown             - no successful load has ever published here (or the last one failed).
  //                         `calendarEvents` is then still the initial `[]`, which is NOT a
  //                         measurement. Display it as an em dash, never as `0`.
  //   loaded, empty       - a 200 returned `[]`. That IS a measurement: `0`.
  //   loaded, populated   - a 200 returned events. Real numbers.
  //
  // `calendarEventsLoaded` is the third state's only carrier; `[]` + `false` means "unknown" and
  // `[]` + `true` means "genuinely zero". Consumers must not read `calendarEvents` directly for
  // display - they read `selectKnownCalendarEvents`, which folds the two fields into one value
  // (`null` = unknown) so the stat card and the rail badge cannot disagree.
  calendarEvents: CalendarEvent[]
  calendarEventsLoaded: boolean
  currentView: 'day' | 'week' | 'month'
  
  // UI state
  sidebarOpen: boolean
  searchQuery: string
  searchResults: ContentItem[]
  isSearching: boolean
  
  // Actions
  setUser: (user: User | null) => void
  setContentItems: (items: ContentItem[]) => void
  addContentItem: (item: ContentItem) => void
  updateContentItem: (id: string, updates: Partial<ContentItem>) => void
  deleteContentItem: (id: string) => void
  setCurrentContent: (item: ContentItem | null) => void
  setCategories: (categories: Category[]) => void
  setTags: (tags: Tag[]) => void
  addTag: (tag: Tag) => void
  setSelectedTags: (tags: string[]) => void
  setFiles: (files: File[]) => void
  setUploadingFiles: (uploading: boolean) => void
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  setCurrentProject: (project: Project | null) => void
  setProjectTasks: (tasks: Task[]) => void
  setJobs: (jobs: JobOpportunity[]) => void
  addJob: (job: JobOpportunity) => void
  setCurrentJob: (job: JobOpportunity | null) => void
  // T090: every caller of this action has a full list from a 200 (`CalendarView`'s publish site
  // gates on a successful load, the search page only calls it inside `if (eventsRes.ok)`), so it
  // also marks the list as a measurement - `[]` published here means "genuinely zero".
  setCalendarEvents: (events: CalendarEvent[]) => void
  addCalendarEvent: (event: CalendarEvent) => void
  setCurrentView: (view: 'day' | 'week' | 'month') => void
  setSidebarOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setSearchResults: (results: ContentItem[]) => void
  setIsSearching: (searching: boolean) => void
  
  // Content filters
  contentFilter: {
    type: ContentType | 'all'
    category: string | 'all'
    tags: string[]
    priority: Priority | 'all'
    status: 'all' | 'draft' | 'published' | 'archived'
    search: string
  }
  setContentFilter: (filter: Partial<AppState['contentFilter']>) => void
  
  // Reset state
  reset: () => void
}

const initialState = {
  user: null,
  isAuthenticated: false,
  contentItems: [],
  currentContent: null,
  contentLoading: false,
  contentError: null,
  categories: [],
  currentCategory: null,
  tags: [],
  selectedTags: [],
  files: [],
  uploadingFiles: false,
  projects: [],
  currentProject: null,
  projectTasks: [],
  jobs: [],
  currentJob: null,
  calendarEvents: [],
  // T090: `false` until something publishes a full list. This is what makes "we have never
  // loaded" distinguishable from "we loaded and Drive holds nothing".
  calendarEventsLoaded: false,
  currentView: 'week',
  sidebarOpen: true,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  contentFilter: {
    type: 'all',
    category: 'all',
    tags: [],
    priority: 'all',
    status: 'all',
    search: ''
  }
} satisfies Partial<AppState>

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // User actions
        setUser: (user) => set({ user, isAuthenticated: !!user }),
        
        // Content actions
        setContentItems: (items) => set({ contentItems: items }),
        addContentItem: (item) => set((state) => ({ 
          contentItems: [item, ...state.contentItems] 
        })),
        updateContentItem: (id, updates) => set((state) => ({
          contentItems: state.contentItems.map(item => 
            item.id === id ? { ...item, ...updates } : item
          )
        })),
        deleteContentItem: (id) => set((state) => ({
          contentItems: state.contentItems.filter(item => item.id !== id)
        })),
        setCurrentContent: (item) => set({ currentContent: item }),
        
        // Category actions
        setCategories: (categories) => set({ categories }),
        
        // Tag actions
        setTags: (tags) => set({ tags }),
        addTag: (tag) => set((state) => ({ tags: [...state.tags, tag] })),
        setSelectedTags: (tags) => set({ selectedTags: tags }),
        
        // File actions
        setFiles: (files) => set({ files }),
        setUploadingFiles: (uploading) => set({ uploadingFiles: uploading }),
        
        // Project actions
        setProjects: (projects) => set({ projects }),
        addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
        setCurrentProject: (project) => set({ currentProject: project }),
        setProjectTasks: (tasks) => set({ projectTasks: tasks }),
        
        // Job actions
        setJobs: (jobs) => set({ jobs }),
        addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
        setCurrentJob: (job) => set({ currentJob: job }),
        
        // Calendar actions
        // T090: publishing a list is also the assertion that the list is COMPLETE (both callers
        // reach this only after a 200), so a `[]` written here is a real zero, not "unknown".
        setCalendarEvents: (events) => set({ calendarEvents: events, calendarEventsLoaded: true }),
        addCalendarEvent: (event) => set((state) => ({ calendarEvents: [event, ...state.calendarEvents] })),
        setCurrentView: (view) => set({ currentView: view }),
        
        // UI actions
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        setSearchQuery: (query) => set({ searchQuery: query }),
        setSearchResults: (results) => set({ searchResults: results }),
        setIsSearching: (searching) => set({ isSearching: searching }),
        
        // Filter actions
        setContentFilter: (filter) => set((state) => ({
          contentFilter: { ...state.contentFilter, ...filter }
        })),
        
        // Reset state
        reset: () => set(initialState)
      }),
      {
        name: 'app-storage',
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          sidebarOpen: state.sidebarOpen,
          contentFilter: state.contentFilter,
          currentView: state.currentView
        })
      }
    ),
    { name: 'app-store' }
  )
)

/**
 * T090: THE calendar-count field. Everything that displays a calendar count reads this and
 * nothing else, so two consumers cannot disagree about whether the count is known.
 *
 *   `CalendarEvent[]` - a successful load has published this list; render its length. `[]` is a
 *                       genuine zero and must render `0`, not an em dash.
 *   `null`            - unknown. Nothing has ever loaded (cold start, or the Drive notice replaced
 *                       `CalendarView` so it never mounted), or the last load failed and published
 *                       nothing (T089's guarantee). Render `—` and no rail badge. It is never `0`:
 *                       a zero is a claim, and this state has no data behind it.
 *
 * `calendarEvents.length > 0` is treated as known even when the flag is unset, because the initial
 * value is `[]`: a non-empty list cannot be the default, so some writer put real events there.
 * That keeps the guarantee honest in both directions - it can only ever turn a "would be unknown"
 * into a true reading, never a reading into a false zero.
 */
export function selectKnownCalendarEvents(state: AppState): CalendarEvent[] | null {
  if (state.calendarEventsLoaded) return state.calendarEvents
  return state.calendarEvents.length > 0 ? state.calendarEvents : null
}