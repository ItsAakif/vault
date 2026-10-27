import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface EditorState {
  // Editor content
  content: string
  title: string
  isDirty: boolean
  isSaving: boolean
  lastSaved: Date | null
  
  // Editor settings
  mode: 'markdown' | 'rich-text'
  previewMode: 'split' | 'edit' | 'preview'
  autoSave: boolean
  autoSaveInterval: number
  
  // Version history
  versions: Array<{
    id: string
    content: string
    timestamp: Date
    label?: string
  }>
  currentVersion: number
  
  // Actions
  setContent: (content: string) => void
  setTitle: (title: string) => void
  setIsDirty: (dirty: boolean) => void
  setIsSaving: (saving: boolean) => void
  setLastSaved: (date: Date | null) => void
  setMode: (mode: 'markdown' | 'rich-text') => void
  setPreviewMode: (mode: 'split' | 'edit' | 'preview') => void
  setAutoSave: (enabled: boolean) => void
  setAutoSaveInterval: (interval: number) => void
  addVersion: (content: string, label?: string) => void
  setCurrentVersion: (version: number) => void
  restoreVersion: (version: number) => void
  
  // Reset
  reset: () => void
}

const initialState = {
  content: '',
  title: '',
  isDirty: false,
  isSaving: false,
  lastSaved: null,
  mode: 'markdown' as const,
  previewMode: 'split' as const,
  autoSave: true,
  autoSaveInterval: 30000, // 30 seconds
  versions: [],
  currentVersion: 0
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      ...initialState,
      
      // Content actions
      setContent: (content) => set((state) => ({ 
        content, 
        isDirty: content !== state.versions[state.currentVersion]?.content 
      })),
      setTitle: (title) => set({ title, isDirty: true }),
      setIsDirty: (dirty) => set({ isDirty: dirty }),
      setIsSaving: (saving) => set({ isSaving: saving }),
      setLastSaved: (date) => set({ lastSaved: date }),
      
      // Settings actions
      setMode: (mode) => set({ mode }),
      setPreviewMode: (previewMode) => set({ previewMode }),
      setAutoSave: (autoSave) => set({ autoSave }),
      setAutoSaveInterval: (autoSaveInterval) => set({ autoSaveInterval }),
      
      // Version actions
      addVersion: (content, label) => set((state) => {
        const newVersion = {
          id: `v${state.versions.length + 1}`,
          content,
          timestamp: new Date(),
          label
        }
        
        return {
          versions: [...state.versions, newVersion],
          currentVersion: state.versions.length,
          isDirty: false
        }
      }),
      
      setCurrentVersion: (version) => set((state) => ({
        currentVersion: version,
        content: state.versions[version]?.content || ''
      })),
      
      restoreVersion: (version) => set((state) => {
        const versionContent = state.versions[version]?.content
        if (versionContent) {
          return {
            content: versionContent,
            currentVersion: version,
            isDirty: true
          }
        }
        return state
      }),
      
      // Reset
      reset: () => set(initialState)
    }),
    { name: 'editor-store' }
  )
)