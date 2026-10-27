'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  Archive,
  BookOpen,
  Briefcase,
  Calendar,
  FileText,
  Lightbulb,
  Plus,
  Star,
  X,
} from 'lucide-react'

import { ContentItemList } from '@/components/categories'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { SimplifiedMarkdownEditor } from '@/components/editor'
import { Workspace } from '@/components/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Label } from '@/components/ui/label'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDriveConnection } from '@/hooks/use-drive-connection'
import { usePresence } from '@/hooks/use-websocket'
import { isRecord, readCollection, readItem, readStringCollection } from '@/lib/api-collection'
import {
  mergeRecentSaves,
  pruneRecentSaves,
  type RecentSave,
} from '@/lib/content-list-merge'
import { Category, ContentItem, ContentType } from '@/lib/db'
import { parseDriveFailure, type DriveFailure } from '@/lib/drive-client'
import { log } from '@/lib/production-logger'
import { useRealtimeSync } from '@/lib/realtime-sync'
import { useAppStore } from '@/store'
import { useStatsStore } from '@/store/stats-store'

// Extend ContentType to include CUSTOM
type ExtendedContentType = ContentType | 'CUSTOM'

// ADR-010 D2: `?type=` is the single source of truth for the content-type filter, so this is the
// complete set of values the parameter is allowed to carry: the ContentType values this page
// already uses, plus the two pseudo-types `all` and `archived`.
const CONTENT_TYPE_VALUES: ReadonlySet<string> = new Set([
  'all',
  'archived',
  'IDEA',
  'POETRY',
  'NOTE',
  'RESOURCE',
  'PROJECT',
  'JOB',
  'DAILY',
  'ARCHIVE',
  'CUSTOM',
])

function isValidContentType(
  value: string | null
): value is ExtendedContentType | 'all' | 'archived' {
  return value !== null && CONTENT_TYPE_VALUES.has(value)
}

// T093: the fields the surfaces actually read. `ContentItemList` calls `item.title.toLowerCase()`
// and `item.content.toLowerCase()`, and the editor reads `type`, so an element that is not a
// content item is dropped rather than rendered: a body can be an array of the wrong things just as
// easily as it can be an object.
function isContentItem(value: unknown): value is ContentItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    typeof value.type === 'string'
  )
}

// T099: the body of the note the editor is showing, read from `GET /api/content/[id]`.
//
// T098 builds a listed row from the file's list properties, so a row's `content` is `''`. The
// editor therefore has three states and no fourth: it is loading, it has the body it fetched, or
// it says the body could not be read. There is deliberately no "empty" state for an existing
// note - an empty editor that looks like an empty note is how a real note gets overwritten.
type EditorBodyState =
  | { status: 'loading'; id: string }
  | { status: 'loaded'; id: string; content: string }
  | { status: 'error'; id: string; message: string }

// The server's own words when it supplied any; otherwise the caller supplies the fallback.
function readErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) return null
  if (typeof body.message === 'string' && body.message) return body.message
  if (typeof body.error === 'string' && body.error) return body.error
  return null
}

// Not a bare spinner: a skeleton of the editor it is standing in for, the same convention as the
// shell's loading state (ADR-011 D3). `role="status"` is what makes it announce itself as a
// loading surface rather than as an empty document.
function EditorBodySkeleton({ title }: { title: string }) {
  return (
    <div
      data-slot="editor-loading"
      role="status"
      aria-label={`Opening ${title}`}
      aria-busy="true"
      className="space-y-4"
    >
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

// The create dialog lists a custom type by these two fields; the rest of the row is optional copy.
interface CustomContentTypeOption {
  id: string
  name: string
  description?: string | null
}

function isCustomContentTypeOption(value: unknown): value is CustomContentTypeOption {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

// The create dialog's category <Select> and the editor badge read only `id`, `name` and `color`.
function isCategoryRecord(value: unknown): value is Category {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

function DashboardContent() {
  const searchParams = useSearchParams()

  // Enable WebSocket functionality for real-time updates
  const { syncContentUpdate, syncProjectUpdate, syncJobUpdate, syncCalendarUpdate } =
    useRealtimeSync()

  // Initialize presence tracking for collaborative features
  usePresence('dashboard')

  const [selectedCategory] = useState<Category | null>(null)
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null)
  // T099: the editor's body is its own state, loaded on select. See `EditorBodyState`.
  const [editorBody, setEditorBody] = useState<EditorBodyState | null>(null)
  // Bumped by the error state's Retry button: the only way to re-read a body that failed.
  const [bodyReloadKey, setBodyReloadKey] = useState(0)
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newItemType, setNewItemType] = useState<ExtendedContentType>('NOTE')
  const [newItemCategory, setNewItemCategory] = useState<string>('none')
  // The create dialog's own custom-type field. The content-type FILTER now lives in the URL, so
  // the dialog keeps its form field locally, exactly like `newItemType`/`newItemCategory`.
  const [newItemCustomTypeId, setNewItemCustomTypeId] = useState<string | null>(null)
  const [customContentTypes, setCustomContentTypes] = useState<CustomContentTypeOption[]>([])
  const [disabledContentTypes, setDisabledContentTypes] = useState<string[]>([])
  const [driveFailure, setDriveFailure] = useState<DriveFailure | null>(null)
  const driveConnection = useDriveConnection()

  // T097: two pieces of state the refetch path needs, and neither may trigger a re-render.
  //
  // `hasRenderedList` - has a listing ever been shown? Only the first load blanks the pane; a
  // refresh keeps the current items on screen (the list used to become skeletons for the whole
  // eleven-second fetch, which the user reported as the notes disappearing).
  //
  // `recentSaves` - the items this session saved, by id, with the time. Drive's listing is
  // eventually consistent, so the refetch after a save can arrive without the file just written;
  // `mergeRecentSaves` keeps it for a short window instead of dropping it.
  const hasRenderedList = useRef(false)
  const recentSaves = useRef<Map<string, RecentSave<ContentItem>>>(new Map())

  // T099: a note that was just created has its body in hand from the POST response, so the
  // select effect must not pay for a second read of the file the app itself just wrote.
  const justSavedBody = useRef<{ id: string; content: string } | null>(null)

  // ADR-010 D2: the content-type filter is derived from the URL, not from local state, so a
  // refresh or a shared link keeps the selection and the rail can reflect it.
  const typeParam = searchParams.get('type')
  const customTypeIdParam = searchParams.get('customTypeId')
  const selectedContentType: ExtendedContentType | 'all' | 'archived' = isValidContentType(typeParam)
    ? typeParam
    : 'all'
  const selectedCustomTypeId = selectedContentType === 'CUSTOM' ? (customTypeIdParam ?? null) : null

  // ADR-008 D5: two signals, one surface. A data-endpoint 403 code is the freshest information
  // (it is what the failing call actually returned); otherwise the cheap probe's answer decides.
  // Neither signal present means nothing is rendered.
  const driveUnavailable =
    driveFailure ??
    (driveConnection.connectRequired
      ? {
          code: 'DRIVE_NOT_CONNECTED' as const,
          message: driveConnection.message ?? '',
          connectUrl: driveConnection.connectUrl,
        }
      : null)

  const { categories, setCategories: setStoreCategories } = useAppStore()
  const setQuickStats = useStatsStore((state) => state.setStats)

  // ADR-010 D2: the rail (AppRail) owns the content-type control and writes the URL itself, so
  // this page has neither a filter widget nor a filter writer of its own. Reading `?type=` above is
  // the whole of its involvement; the old redirect that erased the parameter is gone, so a refresh
  // or a shared link keeps the selection.

  useEffect(() => {
    fetchContentItems()
    fetchCustomContentTypes()
    fetchUserPreferences()
  }, [selectedCategory, selectedContentType, selectedCustomTypeId])

  // T086: the categories pane is gone from this page, but the create dialog's category <Select>
  // and the editor's category badge still read `useAppStore().categories`. The pane used to
  // populate that store as a side effect of its own fetch, so the dashboard keeps one fetch of its
  // own - this is the ONE page that needs the list, while the rail's copy is deliberately not
  // mounted until the user opens the disclosure. A failure here is not fatal: the dialog's select
  // simply stays empty, and a Drive failure already has a notice on the content panel.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch('/api/categories')
        if (!response.ok) return
        const data: unknown = await response.json()
        if (!cancelled) setStoreCategories(readCollection(data, isCategoryRecord))
      } catch (error) {
        log.error('Error fetching categories', error)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [setStoreCategories])

  // T086: the rail's Quick Stats read these figures from `useStatsStore`. The dashboard is their
  // only producer, so it publishes them here and clears them when it unmounts (navigating away)
  // rather than leaving them to look like facts on another page. `null` is published while the
  // list is loading and after a failed fetch, because the rail must render "—" rather than a
  // false zero: "0 pinned" claims nothing is pinned, which this page does not know yet.
  useEffect(() => {
    if (loading || driveFailure) {
      setQuickStats(null)
      return
    }

    setQuickStats({
      total: contentItems.length,
      pinned: contentItems.filter((item) => item.pinned).length,
      archived: contentItems.filter((item) => item.archived).length,
    })

    return () => setQuickStats(null)
  }, [contentItems, loading, driveFailure, setQuickStats])

  // T099: a listed row carries no body (T098), so selecting a note reads the body before the
  // editor may open. Only the editor pane reacts: the list keeps rendering the items it already
  // has, and a selection that is superseded mid-flight cannot land on the wrong note.
  const selectedContentId = selectedContent?.id ?? null

  useEffect(() => {
    if (!selectedContentId) {
      // The create flow's draft has no file yet - its body is the empty document the user is
      // about to write, and there is nothing to read.
      setEditorBody(null)
      return
    }

    // A note that was just created has its body in hand from the POST response; re-reading it
    // would only add a round trip before the editor can reopen on what the app itself wrote.
    const savedBody = justSavedBody.current
    justSavedBody.current = null
    if (savedBody && savedBody.id === selectedContentId) {
      setEditorBody({ status: 'loaded', id: selectedContentId, content: savedBody.content })
      return
    }

    let cancelled = false
    setEditorBody({ status: 'loading', id: selectedContentId })

    const load = async () => {
      try {
        const response = await fetch(`/api/content/${selectedContentId}`)

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          const message =
            readErrorMessage(body) ??
            (response.status === 404
              ? 'This note could not be found.'
              : `The server could not return this note (HTTP ${response.status}).`)
          if (!cancelled) setEditorBody({ status: 'error', id: selectedContentId, message })
          return
        }

        // T093: the response is `unknown` until it is parsed. A 200 that is not a content item
        // must not reach the editor as an empty document either.
        const item = readItem(await response.json(), isContentItem)
        if (!item) {
          if (!cancelled) {
            setEditorBody({
              status: 'error',
              id: selectedContentId,
              message: 'The note came back in an unexpected shape.',
            })
          }
          return
        }

        if (!cancelled) {
          setEditorBody({ status: 'loaded', id: selectedContentId, content: item.content })
        }
      } catch (error) {
        log.error('Error opening content item', error)
        if (!cancelled) {
          setEditorBody({
            status: 'error',
            id: selectedContentId,
            message: 'The note body could not be read. Check your connection and try again.',
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [selectedContentId, bodyReloadKey])

  const reloadEditorBody = useCallback(() => setBodyReloadKey((key) => key + 1), [])

  const fetchCustomContentTypes = async () => {
    try {
      const response = await fetch('/api/content-types')
      if (response.ok) {
        const data: unknown = await response.json()
        setCustomContentTypes(readCollection(data, isCustomContentTypeOption))
      }
    } catch (error) {
      log.error('Error fetching custom content types', error)
    }
  }

  const fetchUserPreferences = async () => {
    try {
      const response = await fetch('/api/user/preferences')
      if (response.ok) {
        const preferences: unknown = await response.json()
        setDisabledContentTypes(
          readStringCollection(isRecord(preferences) ? preferences.disabledContentTypes : null)
        )
      }
    } catch (error) {
      log.error('Error fetching user preferences', error)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n':
            e.preventDefault()
            handleCreateItem('NOTE')
            break
          case 'p':
            e.preventDefault()
            handleCreateItem('POETRY')
            break
          case 'i':
            e.preventDefault()
            handleCreateItem('IDEA')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const fetchContentItems = async () => {
    // T097: a refresh must not blank a list the user is already reading. `loading` is the pane's
    // "show skeletons" flag, so it is raised for the FIRST load only; every later fetch leaves the
    // current items in place until the answer replaces them.
    if (!hasRenderedList.current) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedCategory) {
        params.append('categoryId', selectedCategory.id)
      }
      if (selectedContentType === 'CUSTOM' && selectedCustomTypeId) {
        params.append('type', 'CUSTOM')
        params.append('customTypeId', selectedCustomTypeId)
      } else if (selectedContentType !== 'all' && selectedContentType !== 'archived') {
        params.append('type', selectedContentType)
      }
      if (selectedContentType === 'archived') {
        params.append('archived', 'true')
      }

      const response = await fetch(`/api/content?${params}`)
      if (response.ok) {
        setDriveFailure(null)
        const data: unknown = await response.json()
        const incoming = readCollection(data, isContentItem)
        const now = Date.now()

        // T097: merge by id rather than replace wholesale. The server is authoritative for every
        // item it returns; an item saved moments ago that this listing has not caught up on yet is
        // kept, so the note the user just wrote does not blink out of the list.
        setContentItems((previous) =>
          mergeRecentSaves(incoming, previous, recentSaves.current, now)
        )
        pruneRecentSaves(recentSaves.current, now)
        hasRenderedList.current = true
        return
      }
      const body = await response.json().catch(() => null)
      setDriveFailure(parseDriveFailure(body))
    } catch (error) {
      log.error('Error fetching content items', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCustomItem = (customTypeId: string) => {
    setNewItemType('CUSTOM')
    setNewItemCustomTypeId(customTypeId)
    setNewItemCategory(selectedCategory?.id || 'none')
    setShowCreateDialog(true)
  }

  const handleCreateItem = (type: ExtendedContentType) => {
    setNewItemType(type)
    setNewItemCategory(selectedCategory?.id || 'none')
    setShowCreateDialog(true)
  }

  const handleConfirmCreate = () => {
    const newItem: Partial<ContentItem> = {
      type: newItemType === 'CUSTOM' ? 'NOTE' : newItemType, // Prisma doesn't support CUSTOM, so we use NOTE and rely on customTypeId
      title: `New ${newItemType === 'CUSTOM' ? (customContentTypes.find(ct => ct.id === newItemCustomTypeId)?.name || 'content') : newItemType.toLowerCase()}`,
      content: '',
      status: 'DRAFT',
      priority: 'MEDIUM',
      archived: false,
      pinned: false,
      categoryId: newItemCategory === 'none' ? null : newItemCategory || null,
      customTypeId: newItemType === 'CUSTOM' ? newItemCustomTypeId : null
    }

    setSelectedContent(newItem as ContentItem)
    setShowCreateDialog(false)
  }

  const handleSaveContent = async (content: string, title: string) => {
    const contentId = selectedContent?.id ?? null
    try {
      // T099: an existing note may only be saved from an editor that was given its real body.
      // The editor is not mounted before that read lands (or after it fails), but this is the last
      // line: a PATCH carrying `content: ''` is exactly how a real note gets blanked, so a save
      // with no body behind it is refused rather than trusted.
      if (contentId && !(editorBody?.status === 'loaded' && editorBody.id === contentId)) {
        throw new Error(
          'This note has not finished loading, so it was not saved. Try again once it opens.'
        )
      }

      const url = contentId ? `/api/content/${contentId}` : '/api/content'

      const method = contentId ? 'PATCH' : 'POST'

      const payload: Record<string, unknown> = {
        title,
        type: selectedContent?.type || 'NOTE',
        customTypeId: selectedContent?.customTypeId || null,
        categoryId: selectedContent?.categoryId || (newItemCategory === 'none' ? null : newItemCategory) || selectedCategory?.id
      }

      // T099: never send `content: ''` for an existing note. The route masks it with
      // `updates.content || existingContent`, but a client that claims "the body is empty" is one
      // server change away from clearing the note; the body is only ever sent when there is one.
      // A new item is the exception: its empty draft is its content.
      if (!contentId || content !== '') payload.content = content

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const failure = parseDriveFailure(body)
        if (failure) {
          setDriveFailure(failure)
        }
        const message =
          failure?.message ??
          (body && typeof body.message === 'string' ? body.message : null) ??
          (body && typeof body.error === 'string' ? body.error : null) ??
          'Failed to save your content. Please try again.'
        throw new Error(message) // MUST reject: the editor must not report success
      }

      // T093: the save body is a response body too. A malformed 200 must not put a non-item into
      // the list (the next render would read `title` off it), but it also must not report failure:
      // the server did save. The editor keeps the content it already holds and the next fetch
      // reconciles - so log and leave the list untouched.
      const savedItem = readItem(await response.json(), isContentItem)
      setDriveFailure(null)
      if (!savedItem) {
        log.error('Save returned a body that is not a content item', undefined, {
          contentId: selectedContent?.id,
        })
        return
      }

      // Trigger real-time sync for collaborative updates
      if (selectedContent?.id) {
        syncContentUpdate({ action: 'update', id: savedItem.id, updates: savedItem })
      } else {
        syncContentUpdate({ action: 'create', item: savedItem })
      }

      if (!selectedContent?.id) {
        // T097: remember the save for the grace window, then show it immediately. If the next
        // listing has not caught up, the merge keeps it instead of dropping it.
        recentSaves.current.set(savedItem.id, { item: savedItem, savedAt: Date.now() })
        setContentItems(prev => [savedItem, ...prev])
        // T099: the POST response is the new note's body; open the editor on it directly.
        justSavedBody.current = { id: savedItem.id, content: savedItem.content }
      } else {
        setContentItems(prev => prev.map(item => 
          item.id === savedItem.id ? savedItem : item
        ))
      }
      setSelectedContent(savedItem)
    } catch (error) { log.error('Error saving content', error); throw error }
  }

  const handleDeleteContent = async (id: string) => {
    const item = contentItems.find(item => item.id === id)
    if (!item) return
    
    if (!confirm(`Are you sure you want to delete "${item.title}"? This action cannot be undone.`)) {
      return
    }
    
    try {
      const response = await fetch(`/api/content/${id}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        setContentItems(prev => prev.filter(item => item.id !== id))
        if (selectedContent?.id === id) {
          setSelectedContent(null)
        }
        // Show success message
        log.info('Content deleted successfully', { contentId: id })
      } else {
        log.error('Failed to delete content', undefined, { status: response.status })
      }
    } catch (error) {
      log.error('Error deleting content', error)
    }
  }

  const handleEditContent = (item: ContentItem) => {
    setSelectedContent(item)
  }

  const handleUpdateContent = (id: string, updates: Partial<ContentItem>) => {
    setContentItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ))
    if (selectedContent?.id === id) {
      setSelectedContent(prev => prev ? { ...prev, ...updates } : null)
    }
  }

  return (
    <Workspace flush>
      {/* Two resizable panes - content list | editor. T086: the categories column moved into the
          rail's Categories disclosure (and its stats), so the 16% it occupied is split between the
          two survivors: the list goes 40 -> 45 (its max 50 -> 60, now that nothing else competes)
          and the editor 44 -> 55. They sum to 100, so the default layout is the whole width rather
          than something the panel library has to normalise. `flush` drops the padded scroll frame
          so the group's `h-full` resolves against the root's definite
          `h-[calc(100vh-var(--app-header-h))]`, which is what makes the two panes fill the
          viewport. */}
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Content List */}
        <ResizablePanel defaultSize={45} minSize={30} maxSize={60}>
          <div className="h-full overflow-y-auto">
            {driveUnavailable ? (
              <div className="p-4">
                <DriveRequiredNotice message={driveUnavailable.message || undefined} />
              </div>
            ) : (
              <ContentItemList
                items={contentItems}
                loading={loading}
                onItemSelect={setSelectedContent}
                onCreateItem={handleCreateItem}
                onEditItem={handleEditContent}
                onDeleteItem={handleDeleteContent}
                onUpdateItem={handleUpdateContent}
                className="border-0 shadow-none"
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Editor */}
        <ResizablePanel defaultSize={55}>
          <div className="h-full overflow-y-auto">
            {selectedContent ? (
              <div className="space-y-4 p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium">Editing {selectedContent.type}</h3>
                    {selectedContent.categoryId ? (() => {
                      const category = categories.find(cat => cat.id === selectedContent.categoryId)
                      return category ? (
                        <Badge variant="outline" style={{ backgroundColor: category.color + '20', color: category.color }}>
                          {category.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          Unknown Category
                        </Badge>
                      )
                    })() : (
                      <Badge variant="outline">
                        No Category
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedContent(null)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Close Editor
                    </Button>
                    <Button size="sm" onClick={() => handleCreateItem('NOTE')}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Note
                    </Button>
                  </div>
                </div>
                {selectedContentId ? (
                  // T099: an existing note's editor only exists once its body has been read. The
                  // three states are explicit, so a slow or failed read can never look like an
                  // empty note the user is free to type over.
                  editorBody?.status === 'loaded' && editorBody.id === selectedContentId ? (
                    <SimplifiedMarkdownEditor
                      key={editorBody.id}
                      initialContent={editorBody.content}
                      initialTitle={selectedContent.title}
                      onSave={handleSaveContent}
                      className="border-0 shadow-none"
                    />
                  ) : editorBody?.status === 'error' && editorBody.id === selectedContentId ? (
                    <ErrorState
                      title="Could not open this note"
                      description={editorBody.message}
                      onRetry={reloadEditorBody}
                    />
                  ) : (
                    <EditorBodySkeleton title={selectedContent.title} />
                  )
                ) : (
                  // The create flow's draft: no file yet, so the empty body is the document being
                  // written, not a body that failed to load.
                  <SimplifiedMarkdownEditor
                    key="new-item"
                    initialContent={selectedContent.content}
                    initialTitle={selectedContent.title}
                    onSave={handleSaveContent}
                    className="border-0 shadow-none"
                  />
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                <EmptyState
                  icon={FileText}
                  title="Nothing selected"
                  description="Choose a note from the list, or create one."
                  action={{ label: 'New note', onClick: () => handleCreateItem('NOTE') }}
                />
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button 
          size="lg" 
          className="h-14 w-14 rounded-full shadow-md"
          onClick={() => handleCreateItem('NOTE')}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {/* Create Item Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Content Type Selection */}
            <div className="space-y-3">
              <Label>Content Type</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ...(!disabledContentTypes.includes('NOTE') ? [{ type: 'NOTE', label: 'Note', icon: FileText, desc: 'General notes and thoughts' }] : []),
                  ...(!disabledContentTypes.includes('POETRY') ? [{ type: 'POETRY', label: 'Poetry', icon: BookOpen, desc: 'Creative writing and poems' }] : []),
                  ...(!disabledContentTypes.includes('IDEA') ? [{ type: 'IDEA', label: 'Idea', icon: Lightbulb, desc: 'Brainstorming and concepts' }] : []),
                  ...(!disabledContentTypes.includes('RESOURCE') ? [{ type: 'RESOURCE', label: 'Resource', icon: Star, desc: 'Links and references' }] : []),
                  ...(!disabledContentTypes.includes('PROJECT') ? [{ type: 'PROJECT', label: 'Project', icon: Briefcase, desc: 'Project documentation and planning' }] : []),
                  ...(!disabledContentTypes.includes('JOB') ? [{ type: 'JOB', label: 'Job Opportunity', icon: Briefcase, desc: 'Career opportunities and applications' }] : []),
                  ...(!disabledContentTypes.includes('DAILY') ? [{ type: 'DAILY', label: 'Daily Note', icon: Calendar, desc: 'Daily journaling and personal reflections' }] : []),
                  ...(!disabledContentTypes.includes('ARCHIVE') ? [{ type: 'ARCHIVE', label: 'Archive', icon: Archive, desc: 'Archived and reference content' }] : []),
                  ...customContentTypes.map(customType => ({
                    type: 'CUSTOM',
                    customTypeId: customType.id,
                    label: customType.name,
                    icon: FileText, // Default icon for now
                    desc: customType.description || 'Custom content type'
                  }))
                ].map(({ type, customTypeId, label, icon: Icon, desc }: { type: string; customTypeId?: any; label: any; icon: any; desc: any }) => (
                  <Button
                    key={customTypeId || type}
                    variant={newItemType === type && (!customTypeId || newItemCustomTypeId === customTypeId) ? 'default' : 'outline'}
                    className="h-auto p-4 flex flex-col items-start text-left"
                    onClick={() => {
                      setNewItemType(type as ContentType)
                      if (customTypeId) {
                        setNewItemCustomTypeId(customTypeId)
                      } else {
                        setNewItemCustomTypeId(null)
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </Button>
                ))}              
              </div>
            </div>

            {/* Category Selection */}
            <div className="space-y-3">
              <Label htmlFor="category">Category (Optional)</Label>
              <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category to organize your content" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gray-300" />
                      <span>No Category</span>
                    </div>
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-3 w-3 rounded-full" 
                          style={{ backgroundColor: category.color }}
                        />
                        <span>{category.name}</span>
                        {category.description && (
                          <span className="text-xs text-muted-foreground">- {category.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newItemCategory && newItemCategory !== 'none' && (
                <div className="text-sm text-muted-foreground">
                  Your {newItemType.toLowerCase()} will be organized under this category for easy filtering.
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create {newItemType}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Workspace>
  )
}

// `useSearchParams()` needs a Suspense boundary above it: the group layout renders this page and
// Next otherwise refuses to statically prerender it. Same pattern as `(app)/files/page.tsx`.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  )
}
