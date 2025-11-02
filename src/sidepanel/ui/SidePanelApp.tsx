import React, { useEffect, useMemo, useState } from 'react'
import { sendMessage } from '../../shared/messaging'
import type { TabWithStatus, Folder } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Switch } from '../../components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { X, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react'

export function SidePanelApp() {
  const [tabs, setTabs] = useState<TabWithStatus[]>([])
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const lastClickedIndexRef = React.useRef<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [closeAfterStash, setCloseAfterStash] = useState(true)
  const [addToFolder, setAddToFolder] = useState(true)
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderSearch, setFolderSearch] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [banner, setBanner] = useState<string>('')
  const [bannerDismissing, setBannerDismissing] = useState(false)
  const [windowId, setWindowId] = useState<number | undefined>(undefined)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [stashAction, setStashAction] = useState<'all' | 'selected' | null>(null)

  useEffect(() => {
    // Get the windowId that this side panel belongs to
    chrome.windows.getCurrent((window: any) => {
      if (window?.id) {
        setWindowId(window.id)
      }
    })
  }, [])

  useEffect(() => {
    if (windowId === undefined) return

    refreshTabs()
    refreshFolders()
    chrome.storage.local.get({ closeAfterStash: true, addToFolder: true, selectedFolderId: null }).then((o: any) => {
      setCloseAfterStash(o.closeAfterStash)
      setAddToFolder(o.addToFolder)
      setSelectedFolderId(o.selectedFolderId)
    })
    // Live update when tabs change
    const debounceRef = { id: 0 as number | undefined }
    const schedule = () => {
      if (debounceRef.id) clearTimeout(debounceRef.id)
      debounceRef.id = window.setTimeout(() => {
        refreshTabs()
        debounceRef.id = undefined
      }, 200)
    }
    const onCreated = () => schedule()
    const onRemoved = () => schedule()
    const onUpdated = (_id: number, changeInfo: any) => {
      if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') schedule()
    }
    const onActivated = () => schedule()
    try {
      chrome.tabs.onCreated.addListener(onCreated)
      chrome.tabs.onRemoved.addListener(onRemoved)
      chrome.tabs.onUpdated.addListener(onUpdated)
      chrome.tabs.onActivated.addListener(onActivated)
    } catch {}
    return () => {
      try {
        chrome.tabs.onCreated.removeListener(onCreated)
        chrome.tabs.onRemoved.removeListener(onRemoved)
        chrome.tabs.onUpdated.removeListener(onUpdated)
        chrome.tabs.onActivated.removeListener(onActivated)
      } catch {}
      if (debounceRef.id) clearTimeout(debounceRef.id)
    }
  }, [windowId])

  // Reset dismiss state whenever a new banner message appears
  useEffect(() => {
    if (banner) setBannerDismissing(false)
  }, [banner])

  // Refresh when side panel becomes visible again (e.g., after sleep/resume)
  useEffect(() => {
    if (windowId === undefined) return

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshTabs()
      }
    }
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    return () => {
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
    }
  }, [windowId])

  // Lightweight polling fallback while visible (handles missed tab events after sleep)
  useEffect(() => {
    if (windowId === undefined) return

    let timer: number | undefined
    const start = () => {
      if (document.visibilityState === 'visible') {
        timer = window.setInterval(() => {
          refreshTabs()
        }, 4000)
      }
    }
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined } }
    start()
    const onVis = () => { stop(); start() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [windowId])

  async function refreshTabs() {
    if (windowId === undefined) return
    const res = await sendMessage({ type: 'GET_TABS_STATUS', windowId })
    if (res.ok && 'tabStatus' in res) setTabs(res.tabStatus)
  }

  async function refreshFolders() {
    const res = await sendMessage({ type: 'GET_FOLDERS' })
    if (res.ok && 'folders' in res) setFolders(res.folders)
  }

  const selCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected])
  // Show ALL open tabs, regardless of stashed status (users can stash the same URL multiple times)
  const newTabs = useMemo(() => tabs.filter((t) => t.stashable), [tabs])

  // Filter folders based on search (include parent folders if children match)
  const filteredFolders = useMemo(() => {
    if (!folderSearch) return folders
    const search = folderSearch.toLowerCase()

    // Find all folders that match the search
    const matchingFolders = new Set<string>()
    folders.forEach(folder => {
      if (folder.name.toLowerCase().includes(search)) {
        matchingFolders.add(folder.id)
      }
    })

    // Include all ancestors of matching folders
    const includedFolders = new Set<string>(matchingFolders)
    matchingFolders.forEach(folderId => {
      let current = folders.find(f => f.id === folderId)
      while (current?.parentId) {
        includedFolders.add(current.parentId)
        current = folders.find(f => f.id === current?.parentId)
      }
    })

    return folders.filter(f => includedFolders.has(f.id))
  }, [folders, folderSearch])

  // Build folder tree structure
  const folderTree = useMemo(() => {
    const buildTree = (parentId: string | null): Folder[] => {
      return filteredFolders
        .filter(f => f.parentId === parentId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    }
    return buildTree(null)
  }, [filteredFolders])

  // Track which folders are expanded
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Expand all folders by default when folders are loaded
  useEffect(() => {
    const foldersWithChildren = new Set<string>()
    folders.forEach(folder => {
      if (folders.some(f => f.parentId === folder.id)) {
        foldersWithChildren.add(folder.id)
      }
    })
    setExpandedFolders(foldersWithChildren)
  }, [folders])

  // Helper to check if a folder has children
  const hasChildren = (folderId: string) => {
    return filteredFolders.some(f => f.parentId === folderId)
  }

  // Toggle folder expansion
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  // Recursively render folder tree with indentation
  const renderFolderTree = (folders: Folder[], depth = 0): React.ReactNode => {
    return folders.map(folder => {
      const children = filteredFolders.filter(f => f.parentId === folder.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      const hasKids = children.length > 0
      const isExpanded = expandedFolders.has(folder.id)

      return (
        <React.Fragment key={folder.id}>
          <button
            className={"w-full flex items-center gap-2 py-2 text-sm hover:bg-muted text-left " + (selectedFolderId === folder.id ? 'bg-blue-100 dark:bg-blue-900/40' : '')}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => {
              setSelectedFolderId(folder.id)
              chrome.storage.local.set({ selectedFolderId: folder.id })
            }}
          >
            {hasKids ? (
              <button
                className="size-4 flex items-center justify-center hover:bg-muted-foreground/20 rounded"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolder(folder.id)
                }}
              >
                {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              </button>
            ) : (
              <span className="size-4" />
            )}
            <span className="flex-1">{folder.name}</span>
            {folder.color && (
              <span
                className="size-2 rounded-full mr-2"
                style={{ backgroundColor: folder.color }}
              />
            )}
          </button>
          {hasKids && isExpanded && renderFolderTree(children, depth + 1)}
        </React.Fragment>
      )
    })
  }

  function handleTabClick(tabId: number, index: number, event: React.MouseEvent) {
    if (event.shiftKey && lastClickedIndexRef.current !== null) {
      // Range selection
      const start = Math.min(lastClickedIndexRef.current, index)
      const end = Math.max(lastClickedIndexRef.current, index)
      const rangeIds = newTabs.slice(start, end + 1).map(t => t.id)

      setSelected(prev => {
        const next = { ...prev }
        rangeIds.forEach(id => {
          next[id] = true
        })
        return next
      })
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle single tab
      setSelected(prev => ({ ...prev, [tabId]: !prev[tabId] }))
    } else {
      // Single select (replace selection)
      setSelected({ [tabId]: true })
    }

    lastClickedIndexRef.current = index
  }

  function stashAll() {
    // If "Add to folder" is enabled, show folder picker first
    if (addToFolder) {
      setStashAction('all')
      setShowFolderPicker(true)
    } else {
      // Stash immediately without folder selection
      performStash('all')
    }
  }

  function stashSelected() {
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
    if (!ids.length) return

    // If "Add to folder" is enabled, show folder picker first
    if (addToFolder) {
      setStashAction('selected')
      setShowFolderPicker(true)
    } else {
      // Stash immediately without folder selection
      performStash('selected')
    }
  }

  async function performStash(action: 'all' | 'selected') {
    setLoading(true)

    const ids = action === 'all'
      ? newTabs.map((t) => t.id)
      : Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k))

    const folderId = addToFolder ? selectedFolderId : null
    const res = await sendMessage({ type: 'STASH_TABS', tabIds: ids, tags: [], close: closeAfterStash, folderId })
    setLoading(false)

    if (res.ok) {
      if (action === 'selected') {
        setSelected({})
      }
      if ('stash' in res) {
        const n = res.stash.added
        setBanner(`${n} item${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} been stashed.`)
      }
      await refreshTabs()
      setFolderSearch('') // Clear search after stashing
      setShowFolderPicker(false) // Close modal
      setStashAction(null)
    }
  }

  async function handleFolderInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && folderSearch.trim()) {
      // Create new folder if no exact match exists
      const exactMatch = folders.find(f => f.name.toLowerCase() === folderSearch.toLowerCase())
      if (!exactMatch) {
        const res = await sendMessage({ type: 'CREATE_FOLDER', name: folderSearch.trim() })
        if (res.ok && 'folder' in res) {
          setSelectedFolderId(res.folder.id)
          chrome.storage.local.set({ selectedFolderId: res.folder.id })
          await refreshFolders()
          setFolderSearch('')
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 min-w-[360px]">
      <div className="grid grid-cols-3 gap-2 items-center">
        <Button className="w-full" size="sm" onClick={stashAll} disabled={loading}>
          {loading ? 'Stashing…' : `Stash All (${newTabs.length})`}
        </Button>
        <Button className="w-full" size="sm" variant="secondary" onClick={stashSelected} disabled={loading || selCount === 0}>
          Stash Selected ({selCount})
        </Button>
        <Button
          className="w-full"
          size="sm"
          variant="outline"
          onClick={async () => {
            await chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
            window.close()
          }}
        >
          Dashboard →
        </Button>
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap w-1/2">
          <Switch checked={closeAfterStash} onCheckedChange={(v) => { setCloseAfterStash(!!v); chrome.storage.local.set({ closeAfterStash: !!v }) }} />
          Close after stash
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap w-1/2">
          <Switch checked={addToFolder} onCheckedChange={(v) => { setAddToFolder(!!v); chrome.storage.local.set({ addToFolder: !!v }) }} />
          Add to folder
        </label>
      </div>

      {/* Tagging is dashboard-only */}

      {banner ? (
        <Alert className={"relative transition-opacity duration-200 " + (bannerDismissing ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
          <button
            aria-label="Dismiss"
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            onClick={() => { setBannerDismissing(true); window.setTimeout(() => setBanner(''), 200) }}
          >
            <X className="size-4" />
          </button>
          <AlertDescription>{banner}</AlertDescription>
          <div className="mt-2">
            <Button
              size="sm"
              onClick={async () => {
                await chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
                window.close()
              }}
            >
              Open dashboard →
            </Button>
          </div>
        </Alert>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <div className="pl-2">
                <Checkbox
                  checked={newTabs.length > 0 && newTabs.every(t => selected[t.id])}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      // Select all
                      const all: Record<number, boolean> = {}
                      newTabs.forEach(t => { all[t.id] = true })
                      setSelected(all)
                    } else {
                      // Deselect all
                      setSelected({})
                    }
                  }}
                />
              </div>
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Domain</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {newTabs.map((t, index) => (
            <TableRow
              key={t.id}
              className="cursor-pointer select-none"
              onClick={(e) => {
                // Don't trigger row click if clicking on interactive elements
                if ((e.target as HTMLElement).closest('button, a, input')) {
                  return
                }
                handleTabClick(t.id, index, e)
              }}
            >
              <TableCell className="py-2" onClick={(e) => {
                e.stopPropagation()
                // Handle shift-click on checkbox for range selection
                if (e.shiftKey && lastClickedIndexRef.current !== null) {
                  // Range selection
                  const start = Math.min(lastClickedIndexRef.current, index)
                  const end = Math.max(lastClickedIndexRef.current, index)
                  const rangeIds = newTabs.slice(start, end + 1).map(t => t.id)

                  setSelected(prev => {
                    const next = { ...prev }
                    rangeIds.forEach(id => {
                      next[id] = true
                    })
                    return next
                  })
                  lastClickedIndexRef.current = index
                } else {
                  // Normal click - toggle
                  setSelected((s) => ({ ...s, [t.id]: !s[t.id] }))
                  lastClickedIndexRef.current = index
                }
              }}>
                <Checkbox
                  checked={!!selected[t.id]}
                  onCheckedChange={() => {}}
                />
              </TableCell>
              <TableCell className="max-w-[300px] min-w-0 py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="inline-block max-w-[300px] truncate font-medium text-left hover:underline align-middle cursor-pointer"
                      onClick={async () => { await sendMessage({ type: 'OPEN_OR_FOCUS_URL', url: t.url }) }}
                    >
                      {t.title || t.url}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[520px] break-words">{t.title || t.url}</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="text-xs text-gray-500 py-2">{new URL(t.url).host}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Folder picker modal */}
      <Dialog open={showFolderPicker} onOpenChange={setShowFolderPicker}>
        <DialogContent aria-describedby={undefined} className="max-w-md h-screen max-h-screen top-0 translate-y-0 rounded-none border-x-0 border-t-0 flex flex-col gap-0 p-0">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle>Select folder</DialogTitle>
          </DialogHeader>
          <div className="px-6 pt-2 flex-1 overflow-hidden flex flex-col gap-3 pb-4">
            <Input
              placeholder="Type to search or create folder..."
              value={folderSearch}
              onChange={(e) => setFolderSearch(e.target.value)}
              onKeyDown={handleFolderInputKeyDown}
              className="text-sm"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto border rounded-md">
              {/* New Folder option */}
              {folderSearch.trim() && !folders.some(f => f.name.toLowerCase() === folderSearch.toLowerCase()) && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left border-b"
                  onClick={async () => {
                    const res = await sendMessage({ type: 'CREATE_FOLDER', name: folderSearch.trim() })
                    if (res.ok && 'folder' in res) {
                      setSelectedFolderId(res.folder.id)
                      chrome.storage.local.set({ selectedFolderId: res.folder.id })
                      await refreshFolders()
                      setFolderSearch('')
                    }
                  }}
                >
                  <FolderPlus className="size-4" />
                  <span>Create "{folderSearch.trim()}"</span>
                </button>
              )}

              {/* Unfiled option */}
              <button
                className={"w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left " + (selectedFolderId === null ? 'bg-blue-100 dark:bg-blue-900/40' : '')}
                onClick={() => {
                  setSelectedFolderId(null)
                  chrome.storage.local.set({ selectedFolderId: null })
                }}
              >
                <span className="size-4" />
                <span>Unfiled</span>
              </button>

              {/* Hierarchical folder tree */}
              {renderFolderTree(folderTree)}
            </div>
          </div>
          <DialogFooter className="p-6 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setShowFolderPicker(false)
                setStashAction(null)
                setFolderSearch('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (stashAction) {
                  performStash(stashAction)
                }
              }}
              disabled={loading}
            >
              {loading ? 'Stashing…' : 'Stash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
