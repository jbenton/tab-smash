import React from 'react'
import { createRoot } from 'react-dom/client'
import { sendMessage } from '../shared/messaging'
import type { Item, Folder } from '../shared/types'
import '../styles/globals.css'
import { initSystemTheme } from '@/shared/theme'

// Browser detection utility
function getBrowserName(): string {
  const userAgent = navigator.userAgent

  if (userAgent.includes('Edg/')) return 'Edge'
  if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) return 'Opera'
  if (userAgent.includes('Firefox/')) return 'Firefox'
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) return 'Safari'

  // Handle Chrome-based browsers
  if (userAgent.includes('Chrome/') || userAgent.includes('Chromium/')) {
    // Check for specific Chrome variants first
    if (userAgent.includes('Chrome Dev')) return 'Chrome Dev'
    if (userAgent.includes('Chrome Canary')) return 'Chrome Canary'
    if (userAgent.includes('Chrome/')) {
      // Check for Brave by looking for Brave-specific patterns
      if (userAgent.includes('Brave') || navigator.brave?.isBrave()) return 'Brave'
      return 'Chrome'
    }
    if (userAgent.includes('Chromium/')) return 'Chromium'
  }

  return 'Browser'
}
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Toaster, toast } from 'sonner'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ChevronsUpDown, ChevronUp, ChevronDown, Info, X } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { SelectionBar } from './components/SelectionBar'
import { TabSelectionBar } from './components/TabSelectionBar'
import { RowActions } from './components/RowActions'
import { useDebounce } from '@/hooks/use-debounce'
import { useItemSelection } from '@/hooks/use-item-selection'
import { useTabSelection } from '@/hooks/use-tab-selection'
import { FolderTree } from './components/FolderTree'
import { CreateFolderDialog, RenameFolderDialog, ChangeColorDialog, BulkTagDialog, BulkRemoveTagsDialog } from './components/FolderDialogs'
import { ImportDialog } from './components/ImportDialog'
import { WindowGroup } from './components/WindowGroup'
import { cn } from '@/lib/utils'

// Apply system theme (MV3 CSP-safe)
initSystemTheme()

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

// Validate if a favicon URL is safe to load (prevents CSP violations from HTML pages)
function isSafeFaviconUrl(url: string | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)

    // Allow data URLs
    if (parsed.protocol === 'data:') return true

    // Blocklist: domains known to return HTML 404 pages for favicon requests
    const blockedDomains = ['every.to']
    if (blockedDomains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))) {
      return false
    }

    // Allow trusted favicon services
    const trustedHosts = [
      'gstatic.com',
      'googleapis.com',
      'google.com',
      'favicon.ico',
      'chrome://favicon'
    ]
    if (trustedHosts.some(host => parsed.hostname.includes(host))) return true

    // Allow URLs with common image extensions
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp', '.gif']
    const pathname = parsed.pathname.toLowerCase()
    if (imageExtensions.some(ext => pathname.endsWith(ext))) return true

    // Reject everything else (likely HTML pages)
    return false
  } catch {
    return false
  }
}

function Dashboard() {
  const browserName = getBrowserName()

  // Handle drag start from Open Windows tabs
  const handleOpenTabsDragStart = (e: React.DragEvent, tabIds: number[]) => {
    // Convert tab IDs to temporary items that can be handled by the existing drop logic
    const tempItems = tabIds.map(tabId => ({
      id: `tab-${tabId}`, // Temporary ID for drag operation
      url: '', // Will be filled by drop handler
      title: '',
      status: 'unfiled' as const,
      folderId: null,
      createdAt: Date.now(),
      tabId: tabId // Store the actual Chrome tab ID
    }))

    e.dataTransfer.setData('application/tab-stash-items', JSON.stringify(tempItems))
    e.dataTransfer.effectAllowed = 'move'

    // Create custom drag image
    const dragPreview = document.createElement('div')
    dragPreview.style.position = 'absolute'
    dragPreview.style.top = '-1000px'
    dragPreview.style.left = '-1000px'
    dragPreview.style.padding = '12px 16px'
    dragPreview.style.backgroundColor = 'white'
    dragPreview.style.border = '2px solid #3b82f6'
    dragPreview.style.borderRadius = '8px'
    dragPreview.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    dragPreview.style.fontSize = '14px'
    dragPreview.style.fontWeight = '500'
    dragPreview.style.color = '#1f2937'
    dragPreview.style.whiteSpace = 'nowrap'
    dragPreview.style.maxWidth = '300px'
    dragPreview.style.overflow = 'hidden'
    dragPreview.style.textOverflow = 'ellipsis'
    dragPreview.style.display = 'flex'
    dragPreview.style.alignItems = 'center'
    dragPreview.style.gap = '8px'

    const count = document.createElement('span')
    count.textContent = `${tabIds.length} ${tabIds.length === 1 ? 'tab' : 'tabs'}`
    count.style.background = '#3b82f6'
    count.style.color = 'white'
    count.style.padding = '2px 8px'
    count.style.borderRadius = '12px'
    count.style.fontSize = '12px'
    count.style.fontWeight = '600'

    dragPreview.appendChild(count)
    document.body.appendChild(dragPreview)
    e.dataTransfer.setDragImage(dragPreview, 0, 0)
    setTimeout(() => document.body.removeChild(dragPreview), 0)
  }
  // Sonner toast utility
  const [items, setItems] = React.useState<Item[]>([])
  const [folders, setFolders] = React.useState<Folder[]>([])
  const [folderStats, setFolderStats] = React.useState<Record<string, number>>({})
  const [trashFolderId, setTrashFolderId] = React.useState<string | null>(null)
  const [archiveFolderId, setArchiveFolderId] = React.useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null | 'all' | 'trash' | 'archive' | 'tags' | 'windows'>('all')
  const [windows, setWindows] = React.useState<import('@/shared/types').WindowWithTabs[]>([])
  const [allWindowsExpanded, setAllWindowsExpanded] = React.useState(false)
  const [closeAfterStashInWindows, setCloseAfterStashInWindows] = React.useState(true)
  const [isLoadingLastFolder, setIsLoadingLastFolder] = React.useState(true)
  const [q, setQ] = React.useState('')
  const dq = useDebounce(q, 300)
  const [searchOnlyInFolder, setSearchOnlyInFolder] = React.useState(false)
  const [selectedTags, setSelectedTags] = React.useState<string[]>([])
  const [editTags, setEditTags] = React.useState<Record<string, string>>({})
  const [editingRowId, setEditingRowId] = React.useState<string | null>(null)
  const [removeTag, setRemoveTag] = React.useState<{ id: string; tag: string } | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const editorRef = React.useRef<HTMLDivElement | null>(null)
  const lastClickedIndexRef = React.useRef<number | null>(null)
  const draggedItemsRef = React.useRef<string[]>([])
  const hasInitialized = React.useRef(false)
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)
  type SortKey = 'manual' | 'createdAt' | 'title' | 'domain' | 'tag' | 'folder'
  const [sortKey, setSortKey] = React.useState<SortKey>('manual')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')

  // Folder dialogs
  const [createFolderOpen, setCreateFolderOpen] = React.useState(false)
  const [createFolderParentId, setCreateFolderParentId] = React.useState<string | null>(null)
  const [renameFolderOpen, setRenameFolderOpen] = React.useState(false)
  const [renameFolderId, setRenameFolderId] = React.useState<string | null>(null)
  const [changeColorOpen, setChangeColorOpen] = React.useState(false)
  const [changeColorFolderId, setChangeColorFolderId] = React.useState<string | null>(null)
  const [bulkTagOpen, setBulkTagOpen] = React.useState(false)
  const [bulkRemoveTagsOpen, setBulkRemoveTagsOpen] = React.useState(false)
  const [editTitleOpen, setEditTitleOpen] = React.useState(false)
  const [editTitleItemId, setEditTitleItemId] = React.useState<string | null>(null)
  const [editTitleValue, setEditTitleValue] = React.useState('')
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)
  const [pendingImport, setPendingImport] = React.useState<{
    items: Array<{ url: string; title?: string; tags?: string[]; createdAt?: number; folderId?: string | null }>
    duplicates: Array<{ url: string; existsIn: string }>
    fileType: 'txt' | 'md' | 'csv' | 'json'
  } | null>(null)
  const [draggingItemIds, setDraggingItemIds] = React.useState<string[]>([])
  const [moveAfterCreate, setMoveAfterCreate] = React.useState(false)
  const [stashAfterCreate, setStashAfterCreate] = React.useState<{ tabIds: number[]; closeAfter: boolean } | null>(null)
  const [sidebarWidth, setSidebarWidth] = React.useState(256) // 256px = w-64
  const [isResizing, setIsResizing] = React.useState(false)
  const [itemDropIndicator, setItemDropIndicator] = React.useState<{ y: number; left: number; right: number } | null>(null) // Position where drop line appears
  const tableRef = React.useRef<HTMLTableElement>(null)
  const [folderExpandedStates, setFolderExpandedStates] = React.useState<Record<string, boolean>>({})
  const [windowExpandedStates, setWindowExpandedStates] = React.useState<Record<number, boolean>>({})
  const [fistSmashing, setFistSmashing] = React.useState(false) // Animation trigger for fist icon


  // Load folder and window expanded states from storage on mount
  React.useEffect(() => {
    async function loadExpandedStates() {
      const { getFolderExpandedStates, getWindowExpandedStates } = await import('@/shared/settings')
      const folderStates = await getFolderExpandedStates()
      const windowStates = await getWindowExpandedStates()
      setFolderExpandedStates(folderStates)
      setWindowExpandedStates(windowStates)
    }
    loadExpandedStates()
  }, [])

  // Handler for toggling folder expansion
  const handleToggleFolderExpanded = React.useCallback(async (folderId: string, isExpanded: boolean) => {
    // Update local state immediately for responsive UI
    setFolderExpandedStates(prev => ({ ...prev, [folderId]: isExpanded }))
    // Save to storage
    const { setFolderExpandedState } = await import('@/shared/settings')
    await setFolderExpandedState(folderId, isExpanded)
  }, [])

  // Handler for toggling window expansion
  const handleToggleWindowExpanded = React.useCallback(async (windowId: number, isExpanded: boolean) => {
    // Update local state immediately for responsive UI
    setWindowExpandedStates(prev => ({ ...prev, [windowId]: isExpanded }))
    // Save to storage
    const { setWindowExpandedState } = await import('@/shared/settings')
    await setWindowExpandedState(windowId, isExpanded)
  }, [])

  // Load last viewed folder from storage on mount
  React.useEffect(() => {
    async function loadLastFolder() {
      const t0 = performance.now()
      console.log('[PERF_DEBUG] Dashboard mounted, loading last folder...')
      try {
        const result = await chrome.storage.local.get('lastViewedFolder')
        if (result.lastViewedFolder) {
          setSelectedFolderId(result.lastViewedFolder)
          // Initialize lastSelectedFolderId for shift-click to work on first try
          // Only set it if it's an actual folder ID (not special views like 'all', 'trash', null)
          if (typeof result.lastViewedFolder === 'string' &&
              result.lastViewedFolder !== 'all' &&
              result.lastViewedFolder !== 'trash' &&
              result.lastViewedFolder !== 'tags') {
            setLastSelectedFolderId(result.lastViewedFolder)
          }
        }
        const t1 = performance.now()
        console.log(`[PERF_DEBUG] Loaded last folder in ${(t1 - t0).toFixed(2)}ms`)
      } catch (err) {
        console.error('Failed to load last folder:', err)
      } finally {
        setIsLoadingLastFolder(false)
      }
    }
    loadLastFolder()
  }, [])

  // Refresh when folder selection changes (including initial mount) and save to storage
  React.useEffect(() => {
    if (!isLoadingLastFolder) {
      // Only refresh once on initial mount, then on every folder change
      if (!hasInitialized.current) {
        hasInitialized.current = true
        console.log('[PERF_DEBUG] Initial refresh for folder:', selectedFolderId)
        refresh()
      } else {
        // Always refresh on folder change, including when changing to null (Unfiled)
        console.log('[PERF_DEBUG] Folder changed to:', selectedFolderId)
        refresh()
      }

      // Save last viewed folder to storage
      chrome.storage.local.set({ lastViewedFolder: selectedFolderId }).catch(err => {
        console.error('Failed to save last folder:', err)
      })
    }
  }, [selectedFolderId, isLoadingLastFolder])

  // Instant refresh when background reports item changes
  React.useEffect(() => {
    const onMsg = (msg: any) => { if (msg?.type === 'EVENT_ITEMS_CHANGED') refresh() }
    try { chrome.runtime.onMessage.addListener(onMsg) } catch {}
    return () => { try { chrome.runtime.onMessage.removeListener(onMsg) } catch {} }
  }, [selectedFolderId])

  // Refresh when window regains focus or tab becomes visible (e.g., after sleep)
  React.useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        // Always refresh data when regaining focus
        // Don't re-run search - the useEffect watching dq will handle that if needed
        refresh()
      }
    }
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    return () => {
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
    }
  }, [selectedFolderId])

  // Close tag editor on outside click (same as Esc)
  React.useEffect(() => {
    if (!editingRowId) return
    function onDown(e: MouseEvent | TouchEvent) {
      const el = editorRef.current
      const target = e.target as Node | null
      if (!el || (target && el.contains(target))) return
      const id = editingRowId!
      const item = items.find((i) => i.id === id)
      if (item) setEditTags((m) => ({ ...m, [id]: (item.tags || []).join(' ') }))
      setEditingRowId(null)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('touchstart', onDown, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('touchstart', onDown, true)
    }
  }, [editingRowId, items])

  // Keyboard shortcuts for search
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl+F to focus search field
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      // Esc to clear search field (only if search has content)
      if (e.key === 'Escape' && q) {
        e.preventDefault()
        setQ('')
        searchInputRef.current?.blur()
        return
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [q])

  async function refreshWindows() {
    const res = await sendMessage({ type: 'GET_ALL_WINDOWS' })
    if (res.ok && 'windows' in res) {
      setWindows(res.windows)
    }
  }

  async function stashTabs(tabIds: number[], closeAfter: boolean, targetFolderId?: string | null) {
    const res = await sendMessage({
      type: 'STASH_TABS',
      tabIds,
      close: closeAfter,
      folderId: targetFolderId !== undefined ? targetFolderId : selectedFolderId === 'windows' ? null : selectedFolderId
    })

    if (res.ok && 'stash' in res) {
      toast.success(`Stashed ${res.stash.added + res.stash.updated} ${res.stash.added + res.stash.updated === 1 ? 'tab' : 'tabs'}${closeAfter && res.stash.closed ? ` and closed ${res.stash.closed}` : ''}`)

      // Trigger fist smashing animation
      setFistSmashing(true)

      // Refresh windows to show updated state
      await refreshWindows()

      // Re-apply search filter if there's an active search query
      if (dq && selectedFolderId === 'windows') {
        await onSearchImmediate(dq)
      }

      // Refresh folder stats to update counts
      await refreshFolderStats()

      // Clear selection
      tabSelection.clearSelection()
    } else if (!res.ok && 'error' in res) {
      toast.error(`Failed to stash tabs: ${res.error}`)
    }
  }

  async function closeSelectedTabsInChrome() {
    const selectedTabIds = tabSelection.selectedIds
    if (selectedTabIds.length === 0) return

    const res = await sendMessage({
      type: 'CLOSE_TABS',
      tabIds: selectedTabIds
    })

    if (res.ok && 'closed' in res) {
      toast.success(`Closed ${res.closed} ${res.closed === 1 ? 'tab' : 'tabs'} in ${browserName}`)

      // Refresh windows to show updated state
      await refreshWindows()

      // Re-apply search filter if there's an active search query
      if (dq && selectedFolderId === 'windows') {
        await onSearchImmediate(dq)
      }

      // Clear selection
      tabSelection.clearSelection()
    } else if (!res.ok && 'error' in res) {
      toast.error(`Failed to close tabs: ${res.error}`)
    }
  }

  function expandAllWindows() {
    setAllWindowsExpanded(true)
  }

  function collapseAllWindows() {
    setAllWindowsExpanded(false)
  }

  async function refresh() {
    const t0 = performance.now()
    console.log('[PERF_DEBUG] refresh() started')

    // If viewing Open Windows, fetch windows instead
    if (selectedFolderId === 'windows') {
      await refreshWindows()
      return
    }

    // Fetch items for the current folder view
    // For 'all' and 'tags', fetch all items; otherwise fetch for specific folder
    const folderId = (selectedFolderId === 'all' || selectedFolderId === 'tags') ? undefined : selectedFolderId
    // Only include trash items when explicitly viewing the Trash folder
    const includeTrash = selectedFolderId === 'trash'
    // Only include archive items when explicitly viewing the Archive folder
    const includeArchive = selectedFolderId === 'archive'

    const t1 = performance.now()
    const res = await sendMessage({ type: 'GET_ITEMS', limit: 2000, folderId, includeTrash, includeArchive })
    const t2 = performance.now()
    console.log(`[PERF_DEBUG] GET_ITEMS took ${(t2 - t1).toFixed(2)}ms, returned ${res.ok && 'items' in res ? res.items.length : 0} items`)

    if (res.ok && 'items' in res) {
      setItems(res.items)
      const map: Record<string, string> = {}
      res.items.forEach((it) => { map[it.id] = (it.tags || []).join(' ') })
      setEditTags(map)

      // Don't automatically queue metadata - it causes hundreds of items to be re-queued on every refresh
      // Metadata will be fetched on-demand when items are viewed/interacted with
    }

    const t3 = performance.now()
    await refreshFolders()
    const t4 = performance.now()
    console.log(`[PERF_DEBUG] refreshFolders() took ${(t4 - t3).toFixed(2)}ms`)
    console.log(`[PERF_DEBUG] refresh() total: ${(t4 - t0).toFixed(2)}ms`)
  }

  async function refreshFolders() {
    const res = await sendMessage({ type: 'GET_FOLDERS_WITH_STATS' })
    if (res.ok && 'folders' in res && 'folderStats' in res) {
      setFolders(res.folders)
      if ('trashFolderId' in res) {
        setTrashFolderId(res.trashFolderId)
      }
      if ('archiveFolderId' in res) {
        setArchiveFolderId(res.archiveFolderId)
      }
      setFolderStats(res.folderStats)
    }
  }

  async function refreshFolderStats() {
    // Now handled by refreshFolders - kept for compatibility
    await refreshFolders()
  }

  // Generate dynamic placeholder text based on current view
  function getSearchPlaceholder(): string {
    if (selectedFolderId === 'windows') {
      return 'Search your open Chrome tabs'
    } else if (selectedFolderId === 'archive') {
      return 'Search your Archive tabs'
    } else {
      return 'Search your stashed tabs'
    }
  }

  async function onSearchImmediate(v: string) {
    if (!v) return refresh()

    // For Open Windows view, filter locally instead of searching backend
    if (selectedFolderId === 'windows') {
      const res = await sendMessage({ type: 'GET_ALL_WINDOWS' })
      if (res.ok && 'windows' in res) {
        const query = v.toLowerCase()
        // Add original index before filtering to preserve window numbers
        const filteredWindows = res.windows.map((window, originalIndex) => ({
          ...window,
          originalIndex,
          tabs: window.tabs.filter(tab =>
            tab.title?.toLowerCase().includes(query) ||
            tab.url.toLowerCase().includes(query)
          )
        })).filter(window => window.tabs.length > 0)
        setWindows(filteredWindows as any) // Cast needed due to originalIndex addition
      }
      return
    }

    // If "search only in folder" is checked, pass the folder ID
    // For Archive view, always pass archive folder ID to search only in Archive
    let folderId = null
    if (selectedFolderId === 'archive') {
      folderId = archiveFolderId
    } else if (searchOnlyInFolder && selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'trash' && selectedFolderId !== 'tags') {
      folderId = selectedFolderId
    }

    const res = await sendMessage({ type: 'SEARCH_ITEMS', q: v, folderId: folderId || undefined })
    if (res.ok && 'items' in res) setItems(res.items)
  }
  React.useEffect(() => { onSearchImmediate(dq) }, [dq, searchOnlyInFolder, selectedFolderId, archiveFolderId])

  const uniqueTags = React.useMemo(() => {
    const s = new Set<string>()
    for (const it of items) for (const t of it.tags || []) s.add(t)
    return Array.from(s).sort()
  }, [items])

  const tagCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const it of items) {
      for (const tag of it.tags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }
    return counts
  }, [items])

  const filtered = React.useMemo(() => {
    return items.filter((it) => {
      // Tag filtering
      const byTagMulti = selectedTags.length === 0 || (it.tags || []).some((t) => selectedTags.includes(t))
      return byTagMulti
    })
  }, [items, selectedTags])

  function domainOf(it: Item) {
    try {
      let domain = new URL(it.url).host.toLowerCase()
      // Strip www. from domain for consistent sorting
      if (domain.startsWith('www.')) {
        domain = domain.slice(4)
      }
      return domain
    } catch { return '' }
  }

  function formatUrl(url: string): string {
    try {
      const u = new URL(url)
      let domain = u.host.toLowerCase()
      // Strip www. from domain
      if (domain.startsWith('www.')) {
        domain = domain.slice(4)
      }
      const path = u.pathname + u.search
      // Show domain + path (truncated if needed)
      if (path === '/' || path === '') return domain
      const maxPathLength = 40
      const truncatedPath = path.length > maxPathLength ? path.substring(0, maxPathLength) + '...' : path
      return domain + truncatedPath
    } catch {
      return url
    }
  }

  function getCurrentFolderName(): string {
    if (selectedFolderId === 'all') return 'All Tabs'
    if (selectedFolderId === 'trash') return 'Trash'
    if (selectedFolderId === 'archive') return 'Archive'
    if (selectedFolderId === 'tags') return 'Tags'
    if (selectedFolderId === 'windows') return `Open ${browserName} Windows`
    if (selectedFolderId === null) return 'Unfiled'
    const folder = folders.find(f => f.id === selectedFolderId)
    return folder?.name || 'Unknown Folder'
  }

  // Helper to get folder name by ID, including system folders
  function getFolderNameById(folderId: string | null): string {
    if (!folderId) return 'Unfiled'

    // Check if this is the Trash folder using the stored ID
    if (trashFolderId && folderId === trashFolderId) return 'Trash'

    const folder = folders.find(f => f.id === folderId)
    return folder?.name || 'Unknown'
  }

  function getFolderBreadcrumbs(): Array<{ id: string | null | 'all' | 'trash' | 'tags' | 'windows', name: string, color?: string }> {
    if (selectedFolderId === 'all') return [{ id: 'all', name: 'All Tabs' }]
    if (selectedFolderId === 'trash') return [{ id: 'trash', name: 'Trash' }]
    if (selectedFolderId === 'archive') return [{ id: 'archive', name: 'Archive' }]
    if (selectedFolderId === 'tags') return [{ id: 'tags', name: 'Tags' }]
    if (selectedFolderId === 'windows') return [{ id: 'windows', name: `Open ${browserName} Windows` }]
    if (selectedFolderId === null) return [{ id: null, name: 'Unfiled' }]

    // Build path from current folder up to root
    const path: Array<{ id: string, name: string, color?: string }> = []
    let currentId: string | null = selectedFolderId

    while (currentId) {
      const folder = folders.find(f => f.id === currentId)
      if (!folder) break
      path.unshift({ id: folder.id, name: folder.name, color: folder.color })
      currentId = folder.parentId
    }

    return path
  }

  // Handle sidebar resize
  React.useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, 200), 600) // Min 200px, max 600px
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])
  const sorted = React.useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av: string | number = 0
      let bv: string | number = 0
      if (sortKey === 'manual') { av = a.sortOrder; bv = b.sortOrder }
      else if (sortKey === 'createdAt') { av = a.createdAt; bv = b.createdAt }
      else if (sortKey === 'title') { av = (a.title || a.url).toLowerCase(); bv = (b.title || b.url).toLowerCase() }
      else if (sortKey === 'domain') { av = domainOf(a); bv = domainOf(b) }
      else if (sortKey === 'tag') {
        // Sort by first tag (or empty string if no tags)
        av = (a.tags && a.tags.length > 0) ? a.tags[0].toLowerCase() : ''
        bv = (b.tags && b.tags.length > 0) ? b.tags[0].toLowerCase() : ''
      }
      else if (sortKey === 'folder') {
        // Sort by folder name
        const folderA = a.folderId ? (folders.find(f => f.id === a.folderId)?.name || '') : 'Unfiled'
        const folderB = b.folderId ? (folders.find(f => f.id === b.folderId)?.name || '') : 'Unfiled'
        av = folderA.toLowerCase()
        bv = folderB.toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir, folders])

  // Use item selection hook with shift-click support
  const {
    selected,
    selectedIds,
    selectedItems,
    isAllSelected,
    handleItemClick,
    selectAll,
    clearSelection,
    toggleItem,
    selectRange,
    setSelected
  } = useItemSelection({ items: sorted })

  // Tab selection for Open Windows view
  const allTabs = React.useMemo(() => windows.flatMap(w => w.tabs), [windows])
  const tabSelection = useTabSelection({ tabs: allTabs })

  // Folder selection state
  const [selectedFolderIds, setSelectedFolderIds] = React.useState<string[]>([])
  const [lastSelectedFolderId, setLastSelectedFolderId] = React.useState<string | null>(null)

  function handleFolderClick(folderId: string, index: number, event?: React.MouseEvent) {
    const isCmd = event?.metaKey || event?.ctrlKey
    const isShift = event?.shiftKey

    console.log('[FOLDER_CLICK]', { folderId, isCmd, isShift, lastSelectedFolderId })

    if (isCmd) {
      // Cmd+click: toggle selection
      setSelectedFolderIds(prev =>
        prev.includes(folderId)
          ? prev.filter(id => id !== folderId)
          : [...prev, folderId]
      )
      setLastSelectedFolderId(folderId)
    } else if (isShift && lastSelectedFolderId !== null && lastSelectedFolderId !== folderId) {
      // Shift+click: select range
      // Build a flat list of all folders in tree display order
      function flattenFolders(parentId: string | null = null): Folder[] {
        const children = folders.filter(f => f.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)
        const result: Folder[] = []
        for (const child of children) {
          result.push(child)
          result.push(...flattenFolders(child.id))
        }
        return result
      }
      const folderArray = flattenFolders(null)

      console.log('[FOLDER_CLICK] Shift-click detected, folder array:', folderArray.map(f => f.name))

      // Find the indices of the last clicked and current clicked folders in the flat array
      const lastIndex = folderArray.findIndex(f => f.id === lastSelectedFolderId)
      const currentIndex = folderArray.findIndex(f => f.id === folderId)

      console.log('[FOLDER_CLICK] lastIndex:', lastIndex, 'currentIndex:', currentIndex)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = folderArray.slice(start, end + 1).map(f => f.id)
        console.log('[FOLDER_CLICK] Selecting range:', folderArray.slice(start, end + 1).map(f => f.name))
        setSelectedFolderIds(prev => [...new Set([...prev, ...rangeIds])])
      }
      setLastSelectedFolderId(folderId)
    } else {
      // Regular click: select only this folder
      setSelectedFolderIds([folderId])
      setLastSelectedFolderId(folderId)
    }
  }

  function clearFolderSelection() {
    setSelectedFolderIds([])
    setLastSelectedFolderId(null)
  }

  function toggleSort(key: Exclude<SortKey, 'manual'>) {
    if (sortKey === key) {
      // Already sorting by this key
      if (sortDir === 'asc') {
        // First click: asc, go to desc
        setSortDir('desc')
      } else {
        // Second click: desc, go back to manual
        setSortKey('manual')
        setSortDir('asc')
      }
    } else {
      // New sort key: start with asc
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function fmtDate(ts: number) {
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ts) } catch { return new Date(ts).toLocaleString() }
  }


  async function bulkMoveToTrash() {
    await bulkMoveToFolder('trash')
  }

  async function moveItemToTrash(itemId: string) {
    const res = await sendMessage({ type: 'MOVE_ITEMS_TO_FOLDER', itemIds: [itemId], folderId: 'trash' })
    if (res.ok && 'moved' in res) {
      const item = items.find(i => i.id === itemId)
      const desc = item ? (item.title || item.url) : undefined
      toast('Moved to Trash', { description: desc })
      await refresh()
    }
  }

  async function deleteItemPermanently(itemId: string) {
    const res = await sendMessage({ type: 'DELETE_ITEM', id: itemId })
    if (res.ok && 'deleted' in res) {
      const item = items.find(i => i.id === itemId)
      const desc = item ? (item.title || item.url) : undefined
      toast('Permanently deleted', { description: desc })
      await refresh()
    }
  }

  function openBulkEditTitleDialog() {
    // For bulk edit, only allow single selection
    if (selectedIds.length !== 1) {
      toast('Please select exactly one tab to edit its title')
      return
    }
    const itemId = selectedIds[0]
    const item = items.find(i => i.id === itemId)
    if (item) {
      setEditTitleItemId(itemId)
      setEditTitleValue(item.title || item.url)
      setEditTitleOpen(true)
    }
  }

  async function saveEditedTitle() {
    if (!editTitleItemId) return
    const res = await sendMessage({
      type: 'UPDATE_ITEM',
      id: editTitleItemId,
      patch: { title: editTitleValue }
    })
    if (res.ok && 'updated' in res) {
      toast('Title updated')
      setEditTitleOpen(false)
      setEditTitleItemId(null)
      setEditTitleValue('')
      clearSelection()
      await refresh()
    }
  }

  async function bulkDelete() {
    const map = new Map(items.map((it) => [it.id, it]))
    const first = map.get(selectedIds[0])
    const tasks = selectedIds.map((id) => () => sendMessage({ type: 'DELETE_ITEM', id }))
    await runConcurrent(tasks, 8)
    clearSelection()
    await refresh()
    const rest = selectedIds.length - 1
    const firstLine = first ? (first.title || first.url) : ''
    toast(`Deleted ${selectedIds.length} ${pluralize(selectedIds.length, 'tab', 'tabs')}`, { description: rest > 0 && firstLine ? `${firstLine} (+${rest} more)` : firstLine || undefined })
  }

  async function bulkMoveToFolder(folderId: string | null) {
    const res = await sendMessage({ type: 'MOVE_ITEMS_TO_FOLDER', itemIds: selectedIds, folderId })
    if (res.ok && 'moved' in res) {
      toast(`Moved ${res.moved} ${pluralize(res.moved, 'tab', 'tabs')}`)
      clearSelection()
      await refresh()
    }
  }

  async function bulkAddTags(tags: string[]) {
    const res = await sendMessage({ type: 'BULK_ADD_TAGS', itemIds: selectedIds, tags })
    if (res.ok && 'tagged' in res) {
      toast(`Added tags to ${res.tagged} ${pluralize(res.tagged, 'tab', 'tabs')}`)
      clearSelection()
      await refresh()
    }
  }

  async function bulkRemoveTags(tags: string[]) {
    const res = await sendMessage({ type: 'BULK_REMOVE_TAGS', itemIds: selectedIds, tags })
    if (res.ok && 'tagged' in res) {
      toast(`Removed tags from ${res.tagged} ${pluralize(res.tagged, 'tab', 'tabs')}`)
      clearSelection()
      await refresh()
    }
  }

  async function bulkRefreshMetadata() {
    const res = await sendMessage({ type: 'REFRESH_METADATA', itemIds: selectedIds })
    if (res.ok && 'queued' in res) {
      toast(`Queued ${res.queued} ${pluralize(res.queued, 'tab', 'tabs')} for metadata refresh`)
      clearSelection()
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag)
      } else {
        return Array.from(new Set([...prev, tag]))
      }
    })
  }

  function getAvailableTagsFromSelection(): string[] {
    const tagSet = new Set<string>()
    const map = new Map(items.map((it) => [it.id, it]))
    for (const id of selectedIds) {
      const item = map.get(id)
      if (item && item.tags) {
        item.tags.forEach(tag => tagSet.add(tag))
      }
    }
    return Array.from(tagSet).sort()
  }

  function activeItems(): Item[] {
    const map = new Map(items.map((it) => [it.id, it]))
    if (selectedIds.length) return selectedIds.map((id) => map.get(id)!).filter(Boolean) as Item[]
    return filtered
  }

  async function restoreAll() {
    const targets = activeItems()
    if (!targets.length) return
    if (targets.length > 25 && !confirm(`Open ${targets.length} tabs?`)) return
    for (const it of targets) {
      chrome.tabs.create({ url: it.url })
    }
    toast(`Opened ${targets.length} ${pluralize(targets.length, 'tab', 'tabs')}`)
  }

  async function restoreAllNewWindow() {
    const targets = activeItems()
    if (!targets.length) return
    if (targets.length > 25 && !confirm(`Open ${targets.length} tabs in a new window?`)) return

    // Create new window with the first tab
    const newWindow = await chrome.windows.create({ url: targets[0].url })

    // Add remaining tabs to the new window
    for (let i = 1; i < targets.length; i++) {
      await chrome.tabs.create({ url: targets[i].url, windowId: newWindow.id })
    }

    toast(`Opened ${targets.length} ${pluralize(targets.length, 'tab', 'tabs')} in new window`)
  }

  function downloadBlob(filename: string, content: string, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Helper to build full folder path with hierarchy
  function getFolderPath(folderId: string | null): string {
    if (!folderId) return ''
    const path: string[] = []
    let current = folders.find(f => f.id === folderId)
    while (current) {
      path.unshift(current.name)
      current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined
    }
    return path.join(' > ')
  }

  // Export current view (sorted items - matching dashboard display order)
  function exportCurrentViewTXT() {
    const viewItems = sorted
    const list = viewItems.map((it) => it.url).join('\n')
    const folderName = getCurrentFolderName().replace(/[<>:"/\\|?*]/g, '-')
    downloadBlob(`${folderName}.txt`, list, 'text/plain')
    toast(`Exported ${viewItems.length} URLs from ${folderName}`)
  }

  function exportCurrentViewMD() {
    const viewItems = sorted
    const lines = viewItems.map((it) => `- [${it.title || it.url}](${it.url})`)
    const folderName = getCurrentFolderName().replace(/[<>:"/\\|?*]/g, '-')
    const content = `# ${folderName}\n\nExported: ${new Date().toLocaleString()}\n\n${lines.join('\n')}`
    downloadBlob(`${folderName}.md`, content, 'text/markdown')
    toast(`Exported ${viewItems.length} tabs from ${folderName}`)
  }

  function exportCurrentViewCSV() {
    const viewItems = sorted
    const rows = viewItems.map((it) => {
      const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"'
      const date = new Date(it.createdAt).toISOString()
      const folderPath = getFolderPath(it.folderId)
      return [esc(it.title || ''), esc(it.url), esc((it.tags || []).join(',')), esc(folderPath), esc(date)].join(',')
    })
    const header = 'title,url,tags,folder,createdAt'
    const folderName = getCurrentFolderName().replace(/[<>:"/\\|?*]/g, '-')
    downloadBlob(`${folderName}.csv`, [header, ...rows].join('\n'), 'text/csv')
    toast(`Exported ${viewItems.length} tabs from ${folderName}`)
  }

  // Export complete database
  function exportFullJSON() {
    // Get ALL items from background, not just current view (exclude trash)
    sendMessage({ type: 'GET_ITEMS', limit: 10000, includeTrash: false }).then(res => {
      if (!res.ok || !('items' in res)) return

      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        items: res.items.map((it: Item) => ({
          id: it.id,
          url: it.url,
          urlHash: it.urlHash,
          title: it.title,
          favicon: it.favicon,
          createdAt: it.createdAt,
          lastSeenAt: it.lastSeenAt,
          timesAdded: it.timesAdded,
          notes: it.notes,
          tags: it.tags || [],
          folderId: it.folderId,
          sortOrder: it.sortOrder
        })),
        folders: folders.map(f => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          color: f.color,
          sortOrder: f.sortOrder,
          createdAt: f.createdAt
        }))
      }
      const json = JSON.stringify(exportData, null, 2)
      downloadBlob('tab-stash-full-backup.json', json, 'application/json')
      toast(`Exported complete backup (${res.items.length} tabs, ${folders.length} folders)`)
    })
  }

  async function parseCSV(text: string): Promise<Array<{ url: string; title?: string; tags?: string[]; createdAt?: number; folderId?: string | null }>> {
    // Minimal CSV parser supporting quotes and escaped quotes
    const rows: string[][] = []
    let field = ''
    let row: string[] = []
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
        } else { field += ch }
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { row.push(field); field = '' }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++
          row.push(field); field = ''
          if (row.length) rows.push(row)
          row = []
        } else { field += ch }
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row) }
    if (!rows.length) return []
    const header = rows[0].map((h) => h.trim().toLowerCase())
    const ti = header.indexOf('title')
    const ui = header.indexOf('url')
    const si = header.indexOf('status')
    const gi = header.indexOf('tags')
    const fi = header.indexOf('folder')
    const ci = header.indexOf('createdat')

    // Build folder hierarchy map for lookups
    // Key is the full path like "parent > child", value is the folder ID
    const folderPathMap = new Map<string, string>()

    // Helper to build full path for a folder
    function getFolderPath(folderId: string): string {
      const path: string[] = []
      let current = folders.find(f => f.id === folderId)
      while (current) {
        path.unshift(current.name)
        current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined
      }
      return path.join(' > ')
    }

    // Build the initial map with existing folders
    folders.forEach(f => {
      const fullPath = getFolderPath(f.id)
      folderPathMap.set(fullPath.toLowerCase(), f.id)
    })

    // Helper to find or create folder hierarchy
    async function findOrCreateFolderHierarchy(folderPath: string): Promise<string | null> {
      if (!folderPath) return null

      // Check if full path already exists
      const pathKey = folderPath.toLowerCase()
      if (folderPathMap.has(pathKey)) {
        return folderPathMap.get(pathKey)!
      }

      // Split path and create hierarchy
      const parts = folderPath.split('>').map(p => p.trim()).filter(Boolean)
      if (parts.length === 0) return null

      let parentId: string | null = null
      let currentPath = ''

      for (let i = 0; i < parts.length; i++) {
        const folderName = parts[i]
        currentPath = parts.slice(0, i + 1).join(' > ')
        const currentPathKey = currentPath.toLowerCase()

        // Check if this level exists
        if (folderPathMap.has(currentPathKey)) {
          parentId = folderPathMap.get(currentPathKey)!
        } else {
          // Create this level
          const res = await sendMessage({ type: 'CREATE_FOLDER', name: folderName, parentId })
          if (res.ok && 'folder' in res) {
            parentId = res.folder.id
            folderPathMap.set(currentPathKey, res.folder.id)
            // Update folders array so subsequent lookups work
            folders.push(res.folder)
          } else {
            return null
          }
        }
      }

      return parentId
    }

    const out: Array<{ url: string; title?: string; tags?: string[]; createdAt?: number; folderId?: string | null }> = []
    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r]
      const url = ui >= 0 ? cols[ui]?.trim() : ''
      if (!url) continue
      const title = ti >= 0 ? cols[ti]?.trim() : undefined
      const tagsStr = gi >= 0 ? cols[gi] || '' : ''
      const createdAt = ci >= 0 ? Date.parse(cols[ci] || '') : undefined
      const tags = Array.from(new Set(tagsStr.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)))

      // Handle folder hierarchy
      let folderId: string | null = null
      if (fi >= 0) {
        const folderPath = cols[fi]?.trim()
        if (folderPath) {
          folderId = await findOrCreateFolderHierarchy(folderPath)
        }
      }

      out.push({ url, title, tags, createdAt: isNaN(createdAt ?? NaN) ? undefined : createdAt, folderId })
    }
    return out
  }

  const fileRef = React.useRef<HTMLInputElement | null>(null)

  function parseTags(input: string) {
    return Array.from(new Set(input.split(',').map((s) => s.trim()).filter(Boolean)))
  }

  async function runConcurrent(tasks: Array<() => Promise<any>>, concurrency = 8) {
    let i = 0
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (i < tasks.length) {
        const cur = i++
        try { await tasks[cur]() } catch {}
      }
    })
    await Promise.all(workers)
  }

  // Folder operations
  async function handleCreateFolder(name: string, color?: string, parentId?: string | null) {
    const res = await sendMessage({
      type: 'CREATE_FOLDER',
      name,
      parentId: parentId ?? createFolderParentId,
      color
    })
    if (res.ok && 'folder' in res) {
      toast(`Created folder "${name}"`)
      await refreshFolders()

      // If we're creating a folder to move items into, do that now
      if (moveAfterCreate && selectedIds.length > 0) {
        await bulkMoveToFolder(res.folder.id)
        setMoveAfterCreate(false)
      }

      // If we're creating a folder to stash tabs into, do that now
      if (stashAfterCreate) {
        await stashTabs(stashAfterCreate.tabIds, stashAfterCreate.closeAfter, res.folder.id)
        setStashAfterCreate(null)
      }
    }
  }

  async function handleRenameFolder(name: string) {
    if (!renameFolderId) return
    await sendMessage({ type: 'UPDATE_FOLDER', id: renameFolderId, patch: { name } })
    toast('Folder renamed')
    await refreshFolders()
  }


  async function handleChangeColor(color: string | undefined) {
    if (!changeColorFolderId) return
    // Use null instead of undefined to ensure the property is included in the message
    await sendMessage({ type: 'UPDATE_FOLDER', id: changeColorFolderId, patch: { color: color ?? null } })
    toast('Folder color changed')
    await refreshFolders()
  }

  async function handleDrop(folderId: string | null, event: React.DragEvent) {
    event.preventDefault()
    const data = event.dataTransfer.getData('application/tab-stash-items')
    if (data) {
      const items = JSON.parse(data) as Array<{ id: string; tabId?: number }>

      // Check if these are Open Windows tabs (have tabId property)
      if (items.some(item => item.tabId)) {
        // Handle Open Windows tabs - convert to tab IDs and stash them
        const tabIds = items.filter(item => item.tabId).map(item => item.tabId!)
        if (tabIds.length > 0) {
          await stashTabs(tabIds, closeAfterStashInWindows, folderId) // Use the "Close after stash?" setting
        }
      } else {
        // Handle regular stashed tabs - move between folders
        const itemIds = items.map(item => item.id)
        const res = await sendMessage({ type: 'MOVE_ITEMS_TO_FOLDER', itemIds, folderId })
        if (res.ok && 'moved' in res) {
          toast(`Moved ${res.moved} ${pluralize(res.moved, 'tab', 'tabs')}`)
          clearSelection()
          await refresh()
        }
      }
    }
  }

  async function handleImportConfirm(options: {
    importDuplicates: boolean
    destinationFolderId: string | null
    createNewFolder?: string
    useCsvFolders?: boolean
  }) {
    if (!pendingImport) return

    let targetFolderId = options.destinationFolderId

    // Create new folder if requested
    if (options.createNewFolder) {
      const res = await sendMessage({
        type: 'CREATE_FOLDER',
        name: options.createNewFolder,
        parentId: null
      })
      if (res.ok && 'folder' in res) {
        targetFolderId = res.folder.id
        await refreshFolders()
      } else {
        toast('Failed to create folder')
        return
      }
    }

    // Filter out duplicates if user chose to skip them
    let itemsToImport = pendingImport.items
    if (!options.importDuplicates && pendingImport.duplicates.length > 0) {
      const duplicateUrls = new Set(pendingImport.duplicates.map(d => d.url))
      itemsToImport = itemsToImport.filter(item => !duplicateUrls.has(item.url))
    }

    // For CSV: if NOT using CSV folders, override all folderIds with target
    if (pendingImport.fileType === 'csv' && !options.useCsvFolders) {
      itemsToImport = itemsToImport.map(item => ({ ...item, folderId: targetFolderId }))
    }
    // For txt/md: set all items to target folder
    else if (pendingImport.fileType === 'txt' || pendingImport.fileType === 'md') {
      itemsToImport = itemsToImport.map(item => ({ ...item, folderId: targetFolderId }))
    }

    if (itemsToImport.length === 0) {
      toast('No items to import')
      setImportDialogOpen(false)
      setPendingImport(null)
      return
    }

    // Import items
    const res = await sendMessage({
      type: 'IMPORT_ITEMS',
      items: itemsToImport,
      allowDuplicates: options.importDuplicates
    })
    if (res.ok && 'imported' in res) {
      const skipped = pendingImport.duplicates.length > 0 && !options.importDuplicates
        ? ` (${pendingImport.duplicates.length} ${pluralize(pendingImport.duplicates.length, 'duplicate', 'duplicates')} skipped)`
        : ''
      toast(`Imported ${res.imported} ${pluralize(res.imported, 'tab', 'tabs')}${res.updated > 0 ? `, updated ${res.updated}` : ''}${skipped}`)
      await refreshFolders()
      await refresh()
    }

    setImportDialogOpen(false)
    setPendingImport(null)
  }

  const currentFolder = folders.find(f => f.id === renameFolderId)
  const changeColorFolder = folders.find(f => f.id === changeColorFolderId)
  const createFolderParent = folders.find(f => f.id === createFolderParentId)

  return (
    <div className="flex h-screen">
      {/* Folder Sidebar */}
      <div className="border-r bg-muted/20 p-4 overflow-y-auto relative" style={{ width: `${sidebarWidth}px` }}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <img
              src="/branding/logo.png"
              alt="Logo"
              className={cn("w-8", fistSmashing && "animate-fist-smash")}
              onAnimationEnd={() => setFistSmashing(false)}
            />
            <span>Tab Smash</span>
          </h2>
        </div>
        <FolderTree
          folders={folders}
          selectedFolderId={selectedFolderId}
          selectedFolderIds={selectedFolderIds}
          folderStats={folderStats}
          onSelectFolder={(folderId) => {
            setSelectedFolderId(folderId)
            clearSelection()
            setQ('') // Clear search when navigating to a different folder
            // Only clear folder multi-select state for special views (all, trash)
            // For regular folders, preserve multi-select state to enable shift-click
            if (folderId === 'all' || folderId === 'trash' || folderId === null) {
              clearFolderSelection()
            }
          }}
          onClearFolderSelection={clearFolderSelection}
          onFolderClick={handleFolderClick}
          onCreateFolder={(parentId) => {
            setCreateFolderParentId(parentId)
            setCreateFolderOpen(true)
          }}
          onRenameFolder={(folderId) => {
            setRenameFolderId(folderId)
            setRenameFolderOpen(true)
          }}
          onDeleteFolder={async (folderId) => {
            // Move folder to trash
            const res = await sendMessage({
              type: 'UPDATE_FOLDER',
              id: folderId,
              patch: { parentId: '__trash__' }
            })
            if (res.ok) {
              toast('Moved folder to Trash')
              await refreshFolders()
              // If viewing the deleted folder, switch to All view
              if (selectedFolderId === folderId) {
                setSelectedFolderId('all')
              }
            }
          }}
          onChangeColor={(folderId) => {
            setChangeColorFolderId(folderId)
            setChangeColorOpen(true)
          }}
          onDrop={handleDrop}
          onMoveFolder={async (folderId, newParentId) => {
            const res = await sendMessage({
              type: 'UPDATE_FOLDER',
              id: folderId,
              patch: { parentId: newParentId }
            })
            if (res.ok) {
              const message = newParentId === '__trash__' ? 'Moved folder to Trash' : 'Moved folder'
              toast(message)
              await refreshFolders()
            }
          }}
          onReorderFolders={async (folderIds, parentId) => {
            const res = await sendMessage({
              type: 'REORDER_FOLDERS',
              folderIds,
              parentId
            })
            if (res.ok) {
              toast(`Reordered folders`)
              await refreshFolders()
            }
          }}
          folderExpandedStates={folderExpandedStates}
          onToggleFolderExpanded={handleToggleFolderExpanded}
        />

        {/* Tags Item */}
        <div className="mt-6">
          <button
            className={cn(
              "w-full text-left px-2 py-1.5 rounded text-sm font-medium hover:bg-muted transition-colors",
              selectedFolderId === 'tags' && "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
            )}
            onClick={() => {
              setSelectedFolderId('tags')
              clearSelection()
              clearFolderSelection()
            }}
          >
            Tags
          </button>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="w-1 bg-border hover:bg-blue-500 cursor-col-resize transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Main Content */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {getFolderBreadcrumbs().map((crumb, index, arr) => (
            <React.Fragment key={crumb.id || 'root'}>
              <button
                className="hover:underline cursor-pointer flex items-center gap-2"
                onClick={() => {
                  setSelectedFolderId(crumb.id)
                  clearSelection()
                }}
              >
                {crumb.name}
                {crumb.color && (
                  <span
                    className="size-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: crumb.color }}
                  />
                )}
              </button>
              {index < arr.length - 1 && <span className="text-muted-foreground">›</span>}
            </React.Fragment>
          ))}
        </h1>

      {/* Hide search/filter/export UI when viewing Tags */}
      {selectedFolderId !== 'tags' && (
        <div className="flex gap-2 items-center flex-wrap">
        <div className="flex gap-2 items-center">
          <div className="w-[280px] shrink-0">
            <Input ref={searchInputRef} placeholder={getSearchPlaceholder()} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {/* Show "Search only in folder" checkbox when in a specific folder AND user has entered a search term */}
          {/* Don't show for Archive since Archive search is already Archive-only by default */}
          {q && selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'trash' && selectedFolderId !== 'archive' && selectedFolderId !== 'tags' && selectedFolderId !== 'windows' && (
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Checkbox
                checked={searchOnlyInFolder}
                onCheckedChange={(checked) => setSearchOnlyInFolder(!!checked)}
              />
              <span>Search only in {getCurrentFolderName()}?</span>
            </label>
          )}
        </div>
        <div className="min-w-[240px] shrink-0 hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-start gap-2 overflow-hidden">
                {selectedTags.length === 0 ? (
                  <span className="text-muted-foreground">Filter by tags</span>
                ) : (
                  <div className="flex gap-1 flex-wrap items-center">
                    {selectedTags.slice(0, 3).map((t) => (
                      <Badge key={t} className="flex items-center gap-1">
                        {t}
                        <span
                          role="button"
                          aria-label={`Remove ${t}`}
                          className="cursor-pointer opacity-70 hover:opacity-100"
                          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedTags((arr) => arr.filter((x) => x !== t)) }}
                        >×</span>
                      </Badge>
                    ))}
                    {selectedTags.length > 3 && (
                      <Badge variant="secondary">+{selectedTags.length - 3}</Badge>
                    )}
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[240px] bg-background border shadow-lg z-[1000]">
              {uniqueTags.length === 0 ? (
                <DropdownMenuItem disabled>No tags</DropdownMenuItem>
              ) : (
                uniqueTags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={selectedTags.includes(t)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) => {
                      const checked = !!v
                      setSelectedTags((prev) => {
                        if (checked) return Array.from(new Set([...prev, t]))
                        return prev.filter((x) => x !== t)
                      })
                    }}
                  >
                    {t}
                  </DropdownMenuCheckboxItem>
                ))
              )}
              {selectedTags.length > 0 && (
                <>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setSelectedTags([])}>Clear selection</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedFolderId === 'trash' && (
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                if (confirm('Are you sure you want to permanently delete all items in Trash? This cannot be undone.')) {
                  const res = await sendMessage({ type: 'EMPTY_TRASH' })
                  if (res.ok && 'deleted' in res) {
                    toast(`Deleted ${res.deleted} ${pluralize(res.deleted, 'tab', 'tabs')} from Trash`)
                    await refresh()
                  }
                }
              }}
              disabled={items.length === 0 && folders.filter(f => f.parentId === '__trash__').length === 0}
            >
              Empty Trash
            </Button>
          )}
          {selectedFolderId !== 'windows' && (
          <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-background border shadow-lg z-[1000]">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Export {getCurrentFolderName()}</div>
              <DropdownMenuItem onClick={exportCurrentViewTXT}>.txt (URLs only)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportCurrentViewMD}>.md (Markdown)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportCurrentViewCSV}>.csv (With metadata)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Full Backup</div>
              <DropdownMenuItem onClick={exportFullJSON}>.json (Complete database)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={async (e) => {
            const f = e.currentTarget.files?.[0]
            if (!f) return
            const text = await f.text()
            const ext = f.name.split('.').pop()?.toLowerCase() as 'txt' | 'md' | 'csv' | 'json' | undefined

            if (!ext || !['txt', 'md', 'csv', 'json'].includes(ext)) {
              toast('Unsupported file type')
              if (fileRef.current) fileRef.current.value = ''
              return
            }

            let itemsToImport: Array<{ url: string; title?: string; tags?: string[]; createdAt?: number; folderId?: string | null }> = []

            if (ext === 'json') {
              // Parse JSON full backup - handle this separately without dialog for now
              try {
                const data = JSON.parse(text)
                if (data.version === 1 && data.items && data.folders) {
                  // Full backup format - restore folders first, then items
                  // Step 1: Create folders (with proper parent-child relationships)
                  const folderMap = new Map<string, string>() // oldId -> newId

                  // Sort folders by hierarchy (parents before children)
                  const sortedFolders = [...data.folders].sort((a: any, b: any) => {
                    const aDepth = data.folders.filter((f: any) => {
                      let current = a
                      while (current.parentId) {
                        if (current.parentId === f.id) return true
                        current = data.folders.find((x: any) => x.id === current.parentId)
                        if (!current) break
                      }
                      return false
                    }).length
                    const bDepth = data.folders.filter((f: any) => {
                      let current = b
                      while (current.parentId) {
                        if (current.parentId === f.id) return true
                        current = data.folders.find((x: any) => x.id === current.parentId)
                        if (!current) break
                      }
                      return false
                    }).length
                    return aDepth - bDepth
                  })

                  // Create folders in order
                  for (const folder of sortedFolders) {
                    const parentId = folder.parentId ? folderMap.get(folder.parentId) : null
                    const res = await sendMessage({
                      type: 'CREATE_FOLDER',
                      name: folder.name,
                      parentId: parentId || null,
                      color: folder.color
                    })
                    if (res.ok && 'folder' in res) {
                      folderMap.set(folder.id, res.folder.id)
                    }
                  }

                  // Step 2: Import items with mapped folder IDs
                  const itemsWithMappedFolders = data.items.map((item: any) => ({
                    ...item,
                    folderId: item.folderId ? (folderMap.get(item.folderId) || null) : null
                  }))

                  const res = await sendMessage({
                    type: 'IMPORT_ITEMS',
                    items: itemsWithMappedFolders,
                    allowDuplicates: false
                  })
                  if (res.ok && 'imported' in res) {
                    toast(`Restored ${res.imported} ${pluralize(res.imported, 'tab', 'tabs')} and ${sortedFolders.length} ${pluralize(sortedFolders.length, 'folder', 'folders')}${res.updated > 0 ? `, updated ${res.updated}` : ''}`)
                    await refreshFolders()
                    await refresh()
                  }
                  if (fileRef.current) fileRef.current.value = ''
                  return
                } else {
                  toast('Invalid JSON format')
                  if (fileRef.current) fileRef.current.value = ''
                  return
                }
              } catch (err) {
                console.error('JSON import error:', err)
                toast('Failed to parse JSON')
                if (fileRef.current) fileRef.current.value = ''
                return
              }
            } else if (ext === 'csv') {
              try {
                itemsToImport = await parseCSV(text)
              } catch (err) {
                console.error('CSV parse error:', err)
                toast('Failed to parse CSV')
                if (fileRef.current) fileRef.current.value = ''
                return
              }
            } else if (ext === 'txt') {
              const lines = text.split('\n').map(l => l.trim()).filter(l => l && (l.startsWith('http://') || l.startsWith('https://')))
              itemsToImport = lines.map(url => ({ url }))
            } else if (ext === 'md') {
              // Parse markdown links: - [title](url)
              const lines = text.split('\n')
              const urls: string[] = []
              for (const line of lines) {
                // Match markdown link format: [text](url)
                const matches = line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g)
                for (const match of matches) {
                  urls.push(match[2]) // match[2] is the URL
                }
              }
              itemsToImport = urls.map(url => ({ url }))
            }

            if (!itemsToImport.length) {
              toast('No items found')
              if (fileRef.current) fileRef.current.value = ''
              return
            }

            // Check for existing URLs
            const urls = itemsToImport.map(item => item.url)
            const checkRes = await sendMessage({ type: 'CHECK_EXISTING_URLS', urls })

            if (!checkRes.ok || !('existing' in checkRes)) {
              toast('Failed to check for duplicates')
              if (fileRef.current) fileRef.current.value = ''
              return
            }

            // Map existing URLs to folder names (backend now returns folder names directly)
            const duplicates = checkRes.existing.map(existing => ({
              url: existing.url,
              existsIn: existing.folderName
            }))

            // Show import dialog
            setPendingImport({ items: itemsToImport, duplicates, fileType: ext })
            setImportDialogOpen(true)
            // Don't reset file input here - do it after import completes or dialog closes
          }} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Import</Button>
          </>
          )}
        </div>
      </div>
      )}

      {/* Hide SelectionBar when viewing Tags or Open Windows */}
      {selectedFolderId !== 'tags' && selectedFolderId !== 'windows' && (
        <div className={selectedIds.length === 0 ? 'opacity-30 pointer-events-none' : ''}>
          <SelectionBar
            count={selectedIds.length}
            onRestore={restoreAll}
            onRestoreNewWindow={restoreAllNewWindow}
            onTrash={bulkMoveToTrash}
            onClear={clearSelection}
            trashCount={(selectedFolderId === 'trash' || selectedFolderId === 'archive') ? 0 : selectedIds.length}
            onMoveToFolder={bulkMoveToFolder}
            onBulkTag={() => setBulkTagOpen(true)}
            onBulkRemoveTags={() => setBulkRemoveTagsOpen(true)}
            onRefreshMetadata={bulkRefreshMetadata}
            onEditTitle={openBulkEditTitleDialog}
            folders={folders}
            onCreateNewFolder={() => {
              setMoveAfterCreate(true)
              setCreateFolderParentId(null)
              setCreateFolderOpen(true)
            }}
            availableTagsInSelection={getAvailableTagsFromSelection()}
            folderExpandedStates={folderExpandedStates}
            onToggleFolderExpanded={handleToggleFolderExpanded}
          />
        </div>
      )}

      {/* Open Windows View */}
      {selectedFolderId === 'windows' ? (
        <div className="space-y-4">

          {/* Tab Selection Bar */}
          <TabSelectionBar
            count={tabSelection.selectedIds.length}
            onStash={async (folderId, closeAfter) => {
              await stashTabs(tabSelection.selectedIds, closeAfter, folderId)
            }}
            onClear={tabSelection.clearSelection}
            folders={folders}
            onCreateNewFolder={(closeAfter) => {
              setStashAfterCreate({ tabIds: tabSelection.selectedIds, closeAfter })
              setCreateFolderOpen(true)
            }}
            onCloseInChrome={closeSelectedTabsInChrome}
            onExpandAll={expandAllWindows}
            onCollapseAll={collapseAllWindows}
            browserName={browserName}
            folderExpandedStates={folderExpandedStates}
            onToggleFolderExpanded={handleToggleFolderExpanded}
          />

          {/* Chrome Color Indicator */}
          <div className="h-2 flex overflow-hidden rounded-sm">
            <div className="flex-1" style={{ backgroundColor: '#0873ef' }}></div>
            <div className="flex-1" style={{ backgroundColor: '#34a853' }}></div>
            <div className="flex-1" style={{ backgroundColor: '#fa9c0f' }}></div>
            <div className="flex-1" style={{ backgroundColor: '#f32b26' }}></div>
            <div className="flex-1" style={{ backgroundColor: '#4285f4' }}></div>
          </div>

          {windows.length === 0 ? (
            <p className="text-muted-foreground">No open windows found.</p>
          ) : (
            <div className="space-y-3">
              {windows.map((window, windowIndex) => (
                <WindowGroup
                  key={window.windowId}
                  window={window}
                  windowIndex={(window as any).originalIndex !== undefined ? (window as any).originalIndex : windowIndex}
                  tabSelection={tabSelection}
                  onStashTabs={stashTabs}
                  allTabs={allTabs}
                  isSearching={!!dq}
                  onRefreshWindows={refreshWindows}
                  allExpanded={allWindowsExpanded}
                  onDragStart={handleOpenTabsDragStart}
                  windowExpandedStates={windowExpandedStates}
                  onToggleWindowExpanded={handleToggleWindowExpanded}
                />
              ))}
            </div>
          )}
        </div>
      ) : selectedFolderId === 'tags' ? (
        /* Tags View */
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Click a tag to filter All Tabs by that tag. Click the X to delete a tag from all tabs.
          </p>
          {uniqueTags.length === 0 ? (
            <p className="text-muted-foreground">No tags yet. Add tags to your tabs to see them here.</p>
          ) : (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
              {uniqueTags.map((tag) => {
                const count = tagCounts.get(tag) || 0
                return (
                  <div
                    key={tag}
                    className="flex items-center gap-2 py-1 break-inside-avoid"
                  >
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={() => {
                        // Switch to All Tabs and filter by this tag
                        setSelectedFolderId('all')
                        clearSelection()
                        clearFolderSelection()
                        setSelectedTags([tag])
                      }}
                    >
                      {tag}
                    </span>
                    <span className="text-muted-foreground text-sm">{count}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        if (!confirm(`Delete tag "${tag}" from all ${count} ${pluralize(count, 'tab', 'tabs')}?`)) return

                        // Get all items with this tag
                        const itemsWithTag = items.filter(it => it.tags?.includes(tag))
                        const itemIds = itemsWithTag.map(it => it.id)

                        if (itemIds.length > 0) {
                          const res = await sendMessage({ type: 'BULK_REMOVE_TAGS', itemIds, tags: [tag] })
                          if (res.ok && 'tagged' in res) {
                            toast(`Removed tag "${tag}" from ${res.tagged} ${pluralize(res.tagged, 'tab', 'tabs')}`)
                            await refresh()
                          }
                        }
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Item Table View */
        <>
      {/* Removed inline tag cloud; using compact multi-select above */}

      <Table ref={tableRef}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <div className="pl-2">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={(v) => {
                    if (v) {
                      selectAll()
                    } else {
                      clearSelection()
                    }
                  }}
                  aria-label="Select all"
                />
              </div>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1.5" onClick={() => toggleSort('title')}>
                <span>Title</span>
                {sortKey === 'title' && sortDir === 'asc' && <ChevronDown className="size-4 text-blue-500" />}
                {sortKey === 'title' && sortDir === 'desc' && <ChevronUp className="size-4 text-blue-500" />}
                {sortKey !== 'title' && <ChevronsUpDown className="size-4 text-muted-foreground" />}
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1.5" onClick={() => toggleSort('domain')}>
                <span>URL</span>
                {sortKey === 'domain' && sortDir === 'asc' && <ChevronDown className="size-4 text-blue-500" />}
                {sortKey === 'domain' && sortDir === 'desc' && <ChevronUp className="size-4 text-blue-500" />}
                {sortKey !== 'domain' && <ChevronsUpDown className="size-4 text-muted-foreground" />}
              </Button>
            </TableHead>
            {(selectedFolderId === 'all' || dq) && (
              <TableHead className="w-[120px]">
                <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1.5" onClick={() => toggleSort('folder')}>
                  <span>Folder</span>
                  {sortKey === 'folder' && sortDir === 'asc' && <ChevronDown className="size-4 text-blue-500" />}
                  {sortKey === 'folder' && sortDir === 'desc' && <ChevronUp className="size-4 text-blue-500" />}
                  {sortKey !== 'folder' && <ChevronsUpDown className="size-4 text-muted-foreground" />}
                </Button>
              </TableHead>
            )}
            <TableHead className="w-[80px]">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1.5" onClick={() => toggleSort('tag')}>
                  <span>Tags</span>
                  {sortKey === 'tag' && sortDir === 'asc' && <ChevronDown className="size-4 text-blue-500" />}
                  {sortKey === 'tag' && sortDir === 'desc' && <ChevronUp className="size-4 text-blue-500" />}
                  {sortKey !== 'tag' && <ChevronsUpDown className="size-4 text-muted-foreground" />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={selectedTags.length > 0 ? "text-blue-500" : "text-muted-foreground"}>
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto bg-background border shadow-lg z-[2000]">
                    {uniqueTags.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No tags</div>
                    ) : (
                      uniqueTags.map((tag) => (
                        <DropdownMenuCheckboxItem
                          key={tag}
                          checked={selectedTags.includes(tag)}
                          onCheckedChange={() => toggleTag(tag)}
                        >
                          {tag}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableHead>
            <TableHead className="w-[100px]">
              <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1.5" onClick={() => toggleSort('createdAt')}>
                <span>Added</span>
                {sortKey === 'createdAt' && sortDir === 'asc' && <ChevronDown className="size-4 text-blue-500" />}
                {sortKey === 'createdAt' && sortDir === 'desc' && <ChevronUp className="size-4 text-blue-500" />}
                {sortKey !== 'createdAt' && <ChevronsUpDown className="size-4 text-muted-foreground" />}
              </Button>
            </TableHead>
            <TableHead className="text-right w-[56px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((it, index) => (
            <TableRow
              key={it.id}
              className={cn(
                "cursor-pointer select-none",
                selectedIds.includes(it.id) ? "bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40" : "hover:bg-muted/50"
              )}
              draggable={true}
              onDragStart={(e) => {
                // If item is selected, drag all selected items. Otherwise, drag just this item.
                const itemsToDrag = selectedIds.includes(it.id) ? selectedIds : [it.id]
                draggedItemsRef.current = itemsToDrag
                // Format as array of objects with id property (expected by handleDrop)
                const dragData = itemsToDrag.map(id => ({ id }))
                e.dataTransfer.setData('application/tab-stash-items', JSON.stringify(dragData))
                e.dataTransfer.effectAllowed = 'move'

                // Create custom drag image with count badge
                const dragPreview = document.createElement('div')
                dragPreview.style.position = 'absolute'
                dragPreview.style.top = '-1000px'
                dragPreview.style.left = '-1000px'
                dragPreview.style.padding = '12px 16px'
                dragPreview.style.backgroundColor = 'white'
                dragPreview.style.border = '2px solid #3b82f6'
                dragPreview.style.borderRadius = '8px'
                dragPreview.style.fontFamily = 'system-ui, -apple-system, sans-serif'
                dragPreview.style.fontSize = '14px'
                dragPreview.style.fontWeight = '500'
                dragPreview.style.color = '#1f2937'
                dragPreview.style.whiteSpace = 'nowrap'
                dragPreview.style.maxWidth = '300px'
                dragPreview.style.overflow = 'hidden'
                dragPreview.style.textOverflow = 'ellipsis'
                dragPreview.style.display = 'flex'
                dragPreview.style.alignItems = 'center'
                dragPreview.style.gap = '8px'

                // Stack effect for multiple items
                if (itemsToDrag.length > 1) {
                  dragPreview.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 4px 4px 0 0 rgba(59, 130, 246, 0.2), 8px 8px 0 0 rgba(59, 130, 246, 0.1)'
                } else {
                  dragPreview.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }

                // Add count badge for multiple items
                if (itemsToDrag.length > 1) {
                  const badge = document.createElement('span')
                  badge.style.backgroundColor = '#3b82f6'
                  badge.style.color = 'white'
                  badge.style.padding = '2px 8px'
                  badge.style.borderRadius = '9999px'
                  badge.style.fontSize = '12px'
                  badge.style.fontWeight = '600'
                  badge.textContent = itemsToDrag.length.toString()
                  dragPreview.appendChild(badge)
                }

                // Add item title/URL
                const title = document.createElement('span')
                title.style.flex = '1'
                title.style.overflow = 'hidden'
                title.style.textOverflow = 'ellipsis'
                title.textContent = itemsToDrag.length > 1
                  ? `${itemsToDrag.length} items`
                  : (it.title || it.url)
                dragPreview.appendChild(title)

                document.body.appendChild(dragPreview)
                e.dataTransfer.setDragImage(dragPreview, 20, 20)

                // Clean up after drag starts
                setTimeout(() => {
                  document.body.removeChild(dragPreview)
                }, 0)
              }}
              onDragOver={(e) => {
                // Only handle reordering when in manual sort mode and dragging items (not folders)
                if (sortKey !== 'manual' || !e.dataTransfer.types.includes('application/tab-stash-items')) {
                  return
                }

                e.preventDefault()
                e.stopPropagation()

                // Determine if cursor is in top half or bottom half of row
                const rect = e.currentTarget.getBoundingClientRect()
                const midpoint = rect.top + rect.height / 2
                const isTopHalf = e.clientY < midpoint

                // Check if this drop would actually move items
                // Get dragged item IDs from the ref (set in onDragStart)
                const currentOrder = sorted.map(item => item.id)
                const draggedIds = draggedItemsRef.current

                // Calculate where items would end up if dropped here
                const dropIndex = isTopHalf ? index : index + 1
                let adjustedDropIndex = dropIndex
                for (const draggedId of draggedIds) {
                  const originalIndex = currentOrder.indexOf(draggedId)
                  if (originalIndex < dropIndex) {
                    adjustedDropIndex--
                  }
                }

                // Find original positions of dragged items
                const originalPositions = draggedIds.map(id => currentOrder.indexOf(id)).sort((a, b) => a - b)

                // Check if drop would be a no-op
                // Items would end up at positions [adjustedDropIndex, adjustedDropIndex + 1, ...]
                const finalPositions = draggedIds.map((_, i) => adjustedDropIndex + i)
                const wouldMove = !originalPositions.every((pos, i) => pos === finalPositions[i])

                // Only show indicator if drop would actually move items
                if (wouldMove) {
                  // Calculate the Y position where the line should appear
                  // Offset by 13px to account for table styling and center properly
                  const dropY = isTopHalf ? rect.top - 13 : rect.bottom - 13

                  // Get the table bounds to constrain the line width
                  const tableRect = tableRef.current?.getBoundingClientRect()
                  if (tableRect) {
                    setItemDropIndicator({
                      y: dropY,
                      left: tableRect.left,
                      right: tableRect.right
                    })
                  }
                } else {
                  setItemDropIndicator(null)
                }
              }}
              onDragLeave={() => {
                setItemDropIndicator(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setItemDropIndicator(null)

                // Only handle reordering in manual sort mode
                if (sortKey !== 'manual') return

                const draggedIdsStr = e.dataTransfer.getData('application/tab-stash-items')
                if (!draggedIdsStr) return

                const draggedIds: string[] = JSON.parse(draggedIdsStr)

                // Calculate new order
                const currentOrder = sorted.map(item => item.id)
                const newOrder = [...currentOrder]

                // Remove dragged items
                const filtered = newOrder.filter(id => !draggedIds.includes(id))

                // Determine drop position
                const rect = e.currentTarget.getBoundingClientRect()
                const midpoint = rect.top + rect.height / 2
                const isTopHalf = e.clientY < midpoint
                const dropIndex = isTopHalf ? index : index + 1

                // Adjust drop index for items that were removed before it
                let adjustedDropIndex = dropIndex
                for (const draggedId of draggedIds) {
                  const originalIndex = currentOrder.indexOf(draggedId)
                  if (originalIndex < dropIndex) {
                    adjustedDropIndex--
                  }
                }

                // Insert dragged items at drop position
                filtered.splice(adjustedDropIndex, 0, ...draggedIds)

                // Send reorder message
                sendMessage({
                  type: 'REORDER_ITEMS',
                  itemIds: filtered,
                  folderId: selectedFolderId === 'trash' ? 'trash' : (selectedFolderId === 'all' ? null : selectedFolderId)
                }).then(() => {
                  refresh()
                })
              }}
              onClick={(e) => {
                // Allow clicks on the row to toggle selection (matching checkbox behavior)
                if ((e.target as HTMLElement).closest('button, a, input')) {
                  return // Don't select if clicking on interactive elements
                }

                // Handle shift-click for range selection
                if (e.shiftKey && lastClickedIndexRef.current !== null) {
                  selectRange(lastClickedIndexRef.current, index)
                  lastClickedIndexRef.current = index
                } else {
                  toggleItem(it.id)
                  lastClickedIndexRef.current = index
                }
              }}
            >
              <TableCell>
                <div
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()

                    // Handle shift-click on checkbox for range selection
                    if (e.shiftKey && lastClickedIndexRef.current !== null) {
                      selectRange(lastClickedIndexRef.current, index)
                      lastClickedIndexRef.current = index
                    } else {
                      toggleItem(it.id)
                      lastClickedIndexRef.current = index
                    }
                  }}
                >
                  <Checkbox
                    checked={!!selected[it.id]}
                    onCheckedChange={() => {}}
                  />
                </div>
              </TableCell>
              <TableCell className="max-w-[420px]">
                <div className="flex items-center gap-2 min-w-0">
                  {isSafeFaviconUrl(it.favicon) ? (
                    <img
                      src={it.favicon}
                      alt=""
                      className="size-4 flex-shrink-0"
                      onError={(e) => {
                        // Hide image but maintain spacing
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  ) : (
                    <div className="size-4 flex-shrink-0" />
                  )}
                  <a
                    href={it.url}
                    className="font-medium truncate text-left hover:underline cursor-pointer inline-block max-w-full align-middle"
                    onClick={async (e) => {
                      e.preventDefault()
                      // Command/Ctrl-click opens in background
                      const openInBackground = e.metaKey || e.ctrlKey
                      await sendMessage({ type: 'OPEN_OR_FOCUS_URL', url: it.url, openInBackground })
                    }}
                  >
                    {it.title || it.url}
                  </a>
                </div>
              </TableCell>
              <TableCell className="text-xs text-gray-500 max-w-[300px]">
                <div className="truncate">{formatUrl(it.url)}</div>
              </TableCell>
              {(selectedFolderId === 'all' || dq) && (
                <TableCell className="text-xs">
                  {it.folderId ? (
                    <span className="flex items-center gap-1.5">
                      {folders.find(f => f.id === it.folderId)?.color && (
                        <span
                          className="size-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: folders.find(f => f.id === it.folderId)?.color }}
                        />
                      )}
                      <span className="truncate">{getFolderNameById(it.folderId)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Unfiled</span>
                  )}
                </TableCell>
              )}
              <TableCell className="relative w-[80px]">
                <div className="flex gap-1 flex-wrap items-center">
                  {(it.tags || []).slice(0,3).map((t) => (
                    <Badge key={t} className="flex items-center gap-1">
                      {t}
                      <span
                        role="button"
                        aria-label={`Remove ${t}`}
                        className="cursor-pointer opacity-70 hover:opacity-100"
                        onClick={() => setRemoveTag({ id: it.id, tag: t })}
                      >×</span>
                    </Badge>
                  ))}
                  {/* limit display to 3 tags; no more/less */}
                </div>
                {editingRowId === it.id && (
                  <div ref={editorRef} className="absolute left-0 right-0 top-0 z-[100] bg-transparent p-2">
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        value={editTags[it.id] ?? ''}
                        onChange={(e) => setEditTags((m) => ({ ...m, [it.id]: e.target.value }))}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const raw = editTags[it.id] ?? ''
                            const add = parseTags(raw)
                            const existing = it.tags || []
                            const available = Math.max(0, 3 - existing.length)
                            const candidate = add.filter((t) => !(existing as string[]).includes(t))
                            if (available <= 0) {
                              const notAdded = candidate
                          if (notAdded.length) toast('Max 3 tags', { description: `These were not added: ${notAdded.join(', ')}` })
                              setEditingRowId(null)
                              return
                            }
                            const toAdd = candidate.slice(0, available)
                            const overflow = candidate.slice(available)
                            if (toAdd.length === 0) { setEditingRowId(null); return }
                            const merged = [...existing, ...toAdd]
                            await sendMessage({ type: 'UPDATE_ITEM', id: it.id, patch: { tags: merged } })
                            toast(`Added ${toAdd.length} tag(s)`)
                            if (overflow.length) toast('Max 3 tags', { description: `These were not added: ${overflow.join(', ')}` })
                            setEditingRowId(null)
                            await refresh()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingRowId(null)
                            setEditTags((m) => ({ ...m, [it.id]: (it.tags || []).join(' ') }))
                          }
                        }}
                        placeholder="Tags (comma separated)"
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            aria-label="Editing shortcuts"
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-help"
                          >
                            <Info className="size-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Enter to save · Esc to cancel</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs text-gray-500">{fmtDate(it.createdAt)}</TableCell>
              <TableCell className="text-right w-[56px]">
                <div className="inline-flex items-center justify-end w-full">
                  <RowActions
                    onTrash={async () => { await moveItemToTrash(it.id) }}
                    onDelete={async () => { await deleteItemPermanently(it.id) }}
                    isInTrash={selectedFolderId === 'trash'}
                  />
                  {/* Edit and delete buttons removed (menu contains Trash) */}
            </div>
          </TableCell>
        </TableRow>
          ))}
    </TableBody>
      </Table>
        </>
      )}

      {/* Drop indicator for reordering */}
      {itemDropIndicator && sortKey === 'manual' && (
        <div
          className="fixed h-0.5 bg-blue-500 pointer-events-none z-50"
          style={{
            left: `${itemDropIndicator.left}px`,
            top: `${itemDropIndicator.y}px`,
            width: `${itemDropIndicator.right - itemDropIndicator.left}px`
          }}
        />
      )}

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => !o && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} {pluralize(selectedIds.length, 'tab', 'tabs')}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected tabs will be permanently removed from your stash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await bulkDelete()
                setBulkDeleteOpen(false)
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove tag confirm */}
      <AlertDialog open={!!removeTag} onOpenChange={(o) => !o && setRemoveTag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove tag?</AlertDialogTitle>
            <AlertDialogDescription>{removeTag?.tag}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRemoveTag(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              if (!removeTag) return
              const item = items.find((i) => i.id === removeTag.id)
              const next = (item?.tags || []).filter((x) => x !== removeTag.tag)
              await sendMessage({ type: 'UPDATE_ITEM', id: removeTag.id, patch: { tags: next } })
              toast('Removed tag', { description: removeTag.tag })
              setRemoveTag(null)
              await refresh()
            }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Folder Dialogs */}
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onConfirm={handleCreateFolder}
        parentName={createFolderParent?.name}
        folders={folders}
        initialParentId={createFolderParentId}
      />

      <RenameFolderDialog
        open={renameFolderOpen}
        onOpenChange={setRenameFolderOpen}
        onConfirm={handleRenameFolder}
        currentName={currentFolder?.name || ''}
      />

      <ChangeColorDialog
        open={changeColorOpen}
        onOpenChange={setChangeColorOpen}
        onConfirm={handleChangeColor}
        currentColor={changeColorFolder?.color}
        folderName={changeColorFolder?.name || ''}
      />

      <BulkTagDialog
        open={bulkTagOpen}
        onOpenChange={setBulkTagOpen}
        onConfirm={bulkAddTags}
        selectedCount={selectedIds.length}
      />

      <BulkRemoveTagsDialog
        open={bulkRemoveTagsOpen}
        onOpenChange={setBulkRemoveTagsOpen}
        onConfirm={bulkRemoveTags}
        selectedCount={selectedIds.length}
        availableTags={getAvailableTagsFromSelection()}
      />

      {/* Edit Title Dialog */}
      <Dialog open={editTitleOpen} onOpenChange={setEditTitleOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Title</DialogTitle>
            <DialogDescription>
              Enter a new title for this tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Enter new title"
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveEditedTitle()
                }
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTitleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEditedTitle} disabled={!editTitleValue.trim()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open)
          if (!open) {
            // Clear pending import when dialog closes (via cancel or after import)
            setPendingImport(null)
            // Reset file input so same file can be re-selected
            if (fileRef.current) fileRef.current.value = ''
          }
        }}
        onConfirm={handleImportConfirm}
        totalUrls={pendingImport?.items.length || 0}
        duplicates={pendingImport?.duplicates || []}
        folders={folders}
        fileType={pendingImport?.fileType || 'txt'}
        folderExpandedStates={folderExpandedStates}
        onToggleFolderExpanded={handleToggleFolderExpanded}
      />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <Dashboard />
    <Toaster richColors />
  </TooltipProvider>
)
