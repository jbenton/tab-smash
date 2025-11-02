// @ts-ignore - Chrome APIs available in extension context
declare const chrome: any
// IndexedDB removed - migrated to Chrome Bookmarks API
import type { BgMessage, BgResponse } from '../shared/messaging'
import type { Item, TabSummary, TabWithStatus, Folder } from '../shared/types'
import { normalizeUrl, sha256Hex } from '../shared/url'
import {
  findOrCreateTabStashRoot,
  findOrCreateFolder,
  itemToBookmark,
  bookmarkToItem,
  folderToBookmark,
  encodeMetadataToHash,
  decodeMetadataFromHash,
  stripMetadataFromUrl,
  getTabStashFolderStructure,
  createBookmarkFolderHierarchy,
  findBookmarkFolderForItem,
  moveBookmarkToTrash,
  emptyTrash,
  ROOT_FOLDER_NAME,
  UNFILED_FOLDER_NAME,
  TRASH_FOLDER_NAME,
  ARCHIVE_FOLDER_NAME
} from '../shared/bookmarks'
import {
  getMigrationStatus,
  migrateFromIndexedDB,
  cleanupIndexedDB,
  addMetadataToExistingBookmarks,
  addFaviconsToExistingBookmarks,
  convertTabXpertUrls
} from '../shared/migration'
import { processTabXpertUrl } from '../shared/tabxpert'
// Sync removed in v1
import { getSettings } from '../shared/settings'

// Metadata refresh queue - processes items needing title/favicon updates
let metadataQueue: string[] = []
let isProcessingMetadata = false
let forceRefreshSet = new Set<string>() // Items that should be refreshed regardless of current metadata

// Bookmark tree cache - dramatically speeds up folder/item operations
let bookmarkTreeCache: { tree: chrome.bookmarks.BookmarkTreeNode[], timestamp: number } | null = null
const CACHE_TTL = 5000 // Cache for 5 seconds max

function invalidateBookmarkCache() {
  bookmarkTreeCache = null
}

async function getCachedBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const now = Date.now()
  if (bookmarkTreeCache && (now - bookmarkTreeCache.timestamp) < CACHE_TTL) {
    return bookmarkTreeCache.tree
  }
  const tree = await chrome.bookmarks.getTree()
  bookmarkTreeCache = { tree, timestamp: now }
  return tree
}

/**
 * Decode HTML entities in a string (e.g., &#8211; → —, &nbsp; → space, &#x27; → ')
 * Manual decoder to avoid CSP violations from DOMParser loading external resources
 */
function decodeHtmlEntities(text: string): string {
  // Named entities map
  const entities: Record<string, string> = {
    'amp': '&',
    'lt': '<',
    'gt': '>',
    'quot': '"',
    'apos': "'",
    'nbsp': '\u00A0',
    'ndash': '\u2013',
    'mdash': '\u2014',
    'lsquo': '\u2018',
    'rsquo': '\u2019',
    'ldquo': '\u201C',
    'rdquo': '\u201D',
    'hellip': '\u2026',
    'trade': '\u2122',
    'copy': '\u00A9',
    'reg': '\u00AE'
  }

  return text
    .replace(/&([a-z]+);/gi, (match, entity) => entities[entity.toLowerCase()] || match)
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
}

async function processMetadataQueue() {
  if (isProcessingMetadata || metadataQueue.length === 0) return
  isProcessingMetadata = true

  while (metadataQueue.length > 0) {
    const itemId = metadataQueue.shift()!
    const isForceRefresh = forceRefreshSet.has(itemId)
    if (isForceRefresh) {
      forceRefreshSet.delete(itemId) // Remove from set after processing
    }

    try {
      // Find the bookmark for this item
      const allBookmarks = await getCachedBookmarkTree()
      let targetBookmark: chrome.bookmarks.BookmarkTreeNode | null = null

      function searchBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
        for (const node of nodes) {
          if (node.url) {
            const metadata = decodeMetadataFromHash(node.url)
            if (metadata && metadata.id === itemId) {
              targetBookmark = node
              return
            }
          }
          if (node.children) {
            searchBookmarks(node.children)
          }
        }
      }

      searchBookmarks(allBookmarks)

      if (!targetBookmark) {
        // Bookmark was deleted - skip silently
        continue
      }

      const item = bookmarkToItem(targetBookmark)
      if (!item) {
        continue
      }

      const cleanUrl = stripMetadataFromUrl(targetBookmark.url!)

      // Check if title is just a URL (not a real page title)
      // Consider it "no real title" if it starts with http:// or https://
      const titleLooksLikeUrl = item.title && (item.title.startsWith('http://') || item.title.startsWith('https://'))
      const hasRealTitle = item.title && !titleLooksLikeUrl

      // Check if metadata is already complete (but skip this check if force refresh)
      if (!isForceRefresh && hasRealTitle && item.favicon) {
        continue
      }

      // Step 1: Check if URL is already open in a tab
      const tabs = await chrome.tabs.query({})
      const settings = await getSettings()
      const normalized = normalizeUrl(cleanUrl, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
      const urlHash = await sha256Hex(normalized)

      // For force refresh, always start fresh (ignore existing metadata)
      // For automatic refresh, start with undefined title only if current title looks like a URL
      let title = isForceRefresh ? undefined : (hasRealTitle ? item.title : undefined)
      let favicon = isForceRefresh ? undefined : item.favicon

      // Look for an open tab with this URL
      for (const tab of tabs) {
        if (!tab.url) continue
        const tabNormalized = normalizeUrl(tab.url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
        const tabHash = await sha256Hex(tabNormalized)
        if (tabHash === urlHash) {
          // Found matching tab - grab metadata
          if (!title && tab.title) {
            title = tab.title
          }
          if (!favicon && tab.favIconUrl) {
            favicon = tab.favIconUrl
          }
          break
        }
      }

      // Step 2: If still missing metadata, try fetching HTML
      // Note: This will often fail due to CORS restrictions. We rely on fallbacks.
      if (!title || !favicon) {
        try {
          // Fetch the page HTML with 5 second timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)

          const response = await fetch(cleanUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; TabStash/1.0)'
            }
          })
          clearTimeout(timeoutId)

          if (response.ok) {
            const html = await response.text()

            // Extract title from <title> tag or og:title meta tag
            if (!title) {
              const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
              if (titleMatch) {
                title = decodeHtmlEntities(titleMatch[1].trim())
              } else {
                // Try og:title as fallback
                const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
                if (ogTitleMatch) {
                  title = decodeHtmlEntities(ogTitleMatch[1].trim())
                }
              }
            }

            // Extract favicon from link tags
            if (!favicon) {
              // Try various favicon link formats
              const faviconMatches = [
                html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i),
                html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)
              ]

              for (const match of faviconMatches) {
                if (match) {
                  let faviconUrl = match[1]
                  // Make relative URLs absolute
                  if (faviconUrl.startsWith('//')) {
                    faviconUrl = 'https:' + faviconUrl
                  } else if (faviconUrl.startsWith('/')) {
                    const urlObj = new URL(cleanUrl)
                    faviconUrl = urlObj.origin + faviconUrl
                  } else if (!faviconUrl.startsWith('http')) {
                    const urlObj = new URL(cleanUrl)
                    faviconUrl = new URL(faviconUrl, urlObj.origin + urlObj.pathname).href
                  }
                  favicon = faviconUrl
                  break
                }
              }
            }
          }
        } catch (e) {
          // CORS errors are expected for most sites - silently continue with fallbacks
        }
      }

      // Step 2.5: Apply fallbacks for missing metadata
      if (!title) {
        // Last resort: use URL itself (not hostname) - should rarely happen now with host_permissions
        title = cleanUrl
      }

      if (!favicon) {
        // Always use Google's favicon service as fallback
        try {
          const urlObj = new URL(cleanUrl)
          favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=128`
        } catch {
          // Invalid URL, skip
        }
      }

      // Step 3: Update bookmark if we got new metadata

      if ((title && title !== item.title) || (favicon && favicon !== item.favicon)) {
        const updatedItem: Item = {
          ...item,
          title: title || item.title,
          favicon: favicon || item.favicon
        }
        const bookmarkDetails = itemToBookmark(updatedItem)
        await chrome.bookmarks.update(targetBookmark.id, {
          title: bookmarkDetails.title,
          url: bookmarkDetails.url
        })

        // Notify dashboard of changes
        try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
      }

    } catch (e) {
      // Silently skip errors in metadata processing
    }

    // Rate limit: wait 2 seconds before processing next item
    if (metadataQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  isProcessingMetadata = false
}

async function queryTabs(currentWindow = true, windowId?: number): Promise<TabSummary[]> {
  const query: chrome.tabs.QueryInfo = windowId !== undefined ? { windowId } : { currentWindow }
  const tabs = await chrome.tabs.query(query)
  return tabs
    .filter((t: any) => t.url && typeof t.id === 'number')
    .map((t: any) => ({
      id: t.id as number,
      url: t.url as string,
      title: t.title as string | undefined,
      favIconUrl: t.favIconUrl as string | undefined,
      pinned: !!t.pinned,
      groupId: typeof t.groupId === 'number' ? (t.groupId as number) : undefined
    }))
}

function isHttpUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://')
}

function isStashableUrl(url: string) {
  if (!url) return false
  // Disallow internal and special schemes
  const lower = url.toLowerCase()
  if (lower.startsWith('view-source:')) return false
  const disallowed = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'devtools://',
    'file://',
    'data:',
    'blob:'
  ]
  if (disallowed.some((p) => lower.startsWith(p))) return false
  return isHttpUrl(lower)
}

async function findBookmarkByUrl(url: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  const bookmarks = await chrome.bookmarks.search({ url })
  return bookmarks.length > 0 ? bookmarks[0] : null
}

async function upsertItemFromTab(tab: TabSummary, tags: string[] = [], unfiledFolderId: string, settings: any): Promise<'add' | 'update' | 'skip'> {
  if (!isHttpUrl(tab.url)) return 'skip'
  const originalUrl = tab.url
  const n = normalizeUrl(originalUrl, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
  const urlHash = await sha256Hex(n)
  const now = Date.now()

  try {
    // Always create a new bookmark - allow duplicate URLs (user may want same URL in multiple folders)
    let item: Item = {
      id: crypto.randomUUID(),
      url: originalUrl,
      urlHash,
      title: tab.title,
      favicon: tab.favIconUrl,
      createdAt: now,
      lastSeenAt: now,
      timesAdded: 1,
      tags: tags,
      folderId: null,
      sortOrder: -now // Negative timestamp so newer items appear first
    }

    // Check if this is a TabXpert URL and convert it
    if (originalUrl.includes('s.tabxpert.com/')) {
      console.log('Tab Stash: Converting TabXpert URL during stash:', originalUrl.substring(0, 100))
      try {
        item = await processTabXpertUrl(item)
        console.log('Tab Stash: TabXpert URL converted to:', item.url.substring(0, 100))
      } catch (error) {
        console.error('Tab Stash: Failed to convert TabXpert URL during stash:', error)
        // Continue with original URL if conversion fails
      }
    }

    const bookmarkDetails = itemToBookmark(item)
    await chrome.bookmarks.create({
      ...bookmarkDetails,
      parentId: unfiledFolderId
    })

    return 'add'
  } catch (error) {
    console.error('Tab Stash: Error stashing tab:', error)
    return 'skip'
  }
}

async function stashTabs(
  tabIds?: number[],
  tags: string[] = [],
  close = false,
  preserveActive = false,
  targetFolderId?: string | null
): Promise<{ added: number; updated: number; closed: number }> {
  const tabs = tabIds && tabIds.length
    ? (await chrome.tabs.query({})).filter((t: any) => tabIds.includes(t.id as number)).map((t: any) => ({
        id: t.id as number,
        url: t.url as string,
        title: t.title as string | undefined,
        favIconUrl: t.favIconUrl as string | undefined,
        pinned: !!t.pinned,
        groupId: typeof t.groupId === 'number' ? (t.groupId as number) : undefined
      }))
    : await queryTabs(true)

  let added = 0
  let updated = 0
  let closed = 0
  const toClose: number[] = []
  const settings = await getSettings()

  // Get target folder once for all tabs (major performance improvement)
  const root = await findOrCreateTabStashRoot()
  let targetFolder: string

  if (targetFolderId === null || targetFolderId === undefined) {
    // Default to Unfiled if no folder specified
    const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
    targetFolder = unfiled.id
  } else {
    // Use specified folder
    targetFolder = targetFolderId
  }

  let activeId: number | undefined
  if (preserveActive) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    activeId = active?.id as number | undefined
  }

  for (const t of tabs) {
    const res = await upsertItemFromTab(t, tags, targetFolder, settings)
    if (res === 'add') added++
    else if (res === 'update') updated++
    if (close && (settings.closePinned || !t.pinned) && t.id !== activeId) toClose.push(t.id)
  }

  if (toClose.length) {
    try { await chrome.tabs.remove(toClose); closed = toClose.length } catch {}
  }
  return { added, updated, closed }
}

chrome.runtime.onInstalled.addListener(async () => {
  // Set default side panel behavior (but we'll override action clicks)
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {})

  // Check if we need to migrate from IndexedDB to bookmarks
  try {
    const migrationStatus = await getMigrationStatus()

    if (migrationStatus.needsMigration) {
      console.log('Starting migration from IndexedDB to bookmarks...')

      const result = await migrateFromIndexedDB()

      if (result.errors.length > 0) {
        console.warn('Migration completed with errors:', result.errors)
      } else {
        console.log(`Migration completed: ${result.itemsMigrated} items, ${result.foldersMigrated} folders`)
      }

      // Optionally cleanup IndexedDB after successful migration
      if (result.itemsMigrated > 0 || result.foldersMigrated > 0) {
        // Uncomment the line below to automatically cleanup after migration
        // await cleanupIndexedDB()
        console.log('IndexedDB data can be safely removed. Run cleanup manually if desired.')
      }
    }

    // Check if secondary migrations have already run
    const { metadataMigrationDone, faviconMigrationDone, tabxpertMigrationDone } = await chrome.storage.local.get([
      'metadataMigrationDone',
      'faviconMigrationDone',
      'tabxpertMigrationDone'
    ])

    // Add metadata to existing bookmarks that don't have it (only run once)
    if (!metadataMigrationDone) {
      console.log('Tab Stash: Checking for bookmarks without metadata...')
      const metadataResult = await addMetadataToExistingBookmarks()
      if (metadataResult.updated > 0) {
        console.log(`Tab Stash: Added metadata to ${metadataResult.updated} existing bookmarks`)
      }
      if (metadataResult.errors.length > 0) {
        console.warn('Tab Stash: Metadata migration had errors:', metadataResult.errors)
      }
      await chrome.storage.local.set({ metadataMigrationDone: true })
    }

    // Add favicons to existing bookmarks (only run once)
    if (!faviconMigrationDone) {
      console.log('Tab Stash: Checking for bookmarks without favicons...')
      const faviconResult = await addFaviconsToExistingBookmarks()
      if (faviconResult.updated > 0) {
        console.log(`Tab Stash: Added favicons to ${faviconResult.updated} existing bookmarks`)
      }
      if (faviconResult.errors.length > 0) {
        console.warn('Tab Stash: Favicon migration had errors:', faviconResult.errors)
      }
      await chrome.storage.local.set({ faviconMigrationDone: true })
    }

    // Convert TabXpert URLs to real URLs (only run once)
    if (!tabxpertMigrationDone) {
      console.log('Tab Stash: Converting TabXpert URLs...')
      const tabxpertResult = await convertTabXpertUrls(processTabXpertUrl)
      if (tabxpertResult.converted > 0) {
        console.log(`Tab Stash: Converted ${tabxpertResult.converted} TabXpert URLs to real URLs`)
      }
      if (tabxpertResult.errors.length > 0) {
        console.warn('Tab Stash: TabXpert URL conversion had errors:', tabxpertResult.errors)
      }
      await chrome.storage.local.set({ tabxpertMigrationDone: true })
    }
  } catch (error) {
    console.error('Migration check failed:', error)
  }
})

// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // For now, always open Dashboard (modifier detection not available in this API)
    // TODO: Chrome doesn't provide modifier info in onClicked, consider context menu alternative

    // Regular click: Open Dashboard in a new popup window
    // Get the current window to match its size
    const currentWindow = await chrome.windows.getCurrent()

    // Check if dashboard window already exists
    const existingWindows = await chrome.windows.getAll({ populate: true })
    const dashboardWindow = existingWindows.find(w => {
      // Check if any tab in this window is the dashboard
      return w.tabs?.some(tab => tab.url?.includes('src/dashboard/index.html'))
    })

    if (dashboardWindow) {
      // Focus existing dashboard window
      await chrome.windows.update(dashboardWindow.id, { focused: true })
    } else {
      // Create new dashboard window matching current window size
      console.log('Creating new dashboard window...')
      console.log('Current window size:', { width: currentWindow.width, height: currentWindow.height })

      const newWindow = await chrome.windows.create({
        url: chrome.runtime.getURL('src/dashboard/index.html'),
        width: currentWindow.width || 1200,
        height: currentWindow.height || 800,
        left: currentWindow.left || 100,
        top: currentWindow.top || 100,
        focused: true,
        type: 'popup'
      })
      console.log('Created dashboard window:', newWindow)
    }
  } catch (error) {
    console.error('Failed to open dashboard:', error)
    console.error('Error details:', error.message, error.stack)
    // Fallback: open dashboard in new tab
    console.log('Falling back to opening in tab...')
    await chrome.tabs.create({
      url: chrome.runtime.getURL('src/dashboard/index.html')
    })
  }
})

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {})
})

// Create context menu for side panel
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-sidepanel',
    title: 'Open Tab Smash Side Panel',
    contexts: ['action']
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-sidepanel') {
    try {
      await chrome.sidePanel.open({ tabId: tab!.id })
    } catch (error) {
      console.error('Failed to open side panel:', error)
    }
  }
})

chrome.runtime.onMessage.addListener((msg: BgMessage, _sender: any, sendResponse: (res: BgResponse) => void) => {
  ;(async () => {
    try {
      switch (msg.type) {
        case 'PING':
          sendResponse({ ok: true, pong: true } satisfies BgResponse)
          break
        case 'GET_TABS': {
          const tabs = await queryTabs(msg.currentWindow !== false, msg.windowId)
          sendResponse({ ok: true, tabs } satisfies BgResponse)
          break
        }
        case 'GET_TABS_STATUS': {
          const tabStatus = await getTabsWithStatus(msg.currentWindow !== false, msg.windowId)
          sendResponse({ ok: true, tabStatus } satisfies BgResponse)
          break
        }
        case 'GET_ALL_WINDOWS': {
          // Get all windows
          const allWindows = await chrome.windows.getAll({ populate: true })

          // Filter out Tab Smash dashboard windows
          const filteredWindows = allWindows.filter(window =>
            !window.tabs?.some(tab => tab.url?.includes('src/dashboard/index.html'))
          )

          // Find the most recently active window (excluding Tab Smash)
          const mostRecentlyActiveWindow = filteredWindows.find(window => window.focused) ||
            filteredWindows.reduce((mostRecent, window) => {
              if (!mostRecent) return window
              return (window.lastFocused || 0) > (mostRecent.lastFocused || 0) ? window : mostRecent
            }, null as chrome.windows.Window | null)

          const mostRecentWindowId = mostRecentlyActiveWindow?.id

          // Map to WindowWithTabs format
          const windows = filteredWindows.map(window => ({
            windowId: window.id!,
            focused: window.id === mostRecentWindowId,
            tabs: (window.tabs || [])
              .filter(tab => tab.id !== undefined && tab.url !== undefined)
              .map(tab => ({
                id: tab.id!,
                url: tab.url!,
                title: tab.title,
                favIconUrl: tab.favIconUrl,
                pinned: tab.pinned,
                groupId: tab.groupId
              }))
          }))

          // Sort: focused window first, then by window ID
          windows.sort((a, b) => {
            if (a.focused && !b.focused) return -1
            if (!a.focused && b.focused) return 1
            return a.windowId - b.windowId
          })

          sendResponse({ ok: true, windows } satisfies BgResponse)
          break
        }
        case 'STASH_TABS': {
          const settings = await getSettings()
          const close = typeof msg.close === 'boolean' ? msg.close : settings.closeAfterStash
          const res = await stashTabs(msg.tabIds, msg.tags || [], close, !!msg.preserveActive, msg.folderId)
          sendResponse({ ok: true, stash: res } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'GET_ITEMS': {
          const { folders, items } = await getTabStashFolderStructure()
          let bookmarkItems: Item[] = []

          // Create folder mapping from bookmark folders to their IDs
          const root = await findOrCreateTabStashRoot()
          const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
          const archive = await findOrCreateFolder(ARCHIVE_FOLDER_NAME, root.id)

          // Find bookmark folder by ID
          function findBookmarkFolderById(folderId: string): chrome.bookmarks.BookmarkTreeNode | undefined {
            return folders.find(f => f.id === folderId)
          }

          // Get settings once for all items
          const settings = await getSettings()

          for (const bookmark of items) {
            const item = bookmarkToItem(bookmark)
            if (!item) continue

            // Set urlHash for compatibility
            const normalized = normalizeUrl(item.url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
            item.urlHash = await sha256Hex(normalized)

            // Determine actual folder based on bookmark location
            let actualFolderId: string | null = null
            let parentFolder = findBookmarkFolderById(bookmark.parentId || '')

            // If this bookmark is in Trash folder, set folderId to trash
            if (parentFolder && parentFolder.title === TRASH_FOLDER_NAME) {
              actualFolderId = trash.id
            }
            // If this bookmark is in Archive folder, set folderId to archive
            else if (parentFolder && parentFolder.title === ARCHIVE_FOLDER_NAME) {
              actualFolderId = archive.id
            }
            // If this bookmark is in Unfiled folder, mark as unfiled
            else if (parentFolder && parentFolder.title === UNFILED_FOLDER_NAME) {
              actualFolderId = null
            }
            // Otherwise, it's in a custom folder
            else {
              actualFolderId = bookmark.parentId || null
            }

            // Update item's folderId to match actual bookmark location (source of truth)
            item.folderId = actualFolderId

            // Apply status filter - include trashed/archived items only if specifically requested
            if (msg.folderId !== undefined) {
              if (msg.folderId === null) {
                // Unfiled items only
                if (actualFolderId !== null) continue
              } else if (msg.folderId === 'trash') {
                // Special case: UI trash folder - show items in Trash bookmark folder
                if (parentFolder && parentFolder.title !== TRASH_FOLDER_NAME) continue
              } else if (msg.folderId === 'archive') {
                // Special case: UI archive folder - show items in Archive bookmark folder
                if (parentFolder && parentFolder.title !== ARCHIVE_FOLDER_NAME) continue
              } else if (msg.folderId === trash.id) {
                // Direct trash folder ID
                if (actualFolderId !== trash.id) continue
              } else if (msg.folderId === archive.id) {
                // Direct archive folder ID
                if (actualFolderId !== archive.id) continue
              } else {
                // Specific folder
                if (actualFolderId !== msg.folderId) continue
              }
            } else {
              // Default: exclude trashed and archived items unless explicitly requested
              if (actualFolderId === trash.id && !msg.includeTrash) continue
              if (actualFolderId === archive.id && !msg.includeArchive) continue
            }

            bookmarkItems.push(item)
          }

          // Sort by creation time (newest first)
          bookmarkItems.sort((a, b) => b.createdAt - a.createdAt)

          // Apply limit
          if (msg.limit) {
            bookmarkItems = bookmarkItems.slice(0, msg.limit)
          }

          sendResponse({ ok: true, items: bookmarkItems } satisfies BgResponse)
          break
        }
        case 'SEARCH_ITEMS': {
          const q = msg.q.toLowerCase()
          const searchFolderId = msg.folderId || null
          const { folders, items } = await getTabStashFolderStructure()
          let bookmarkItems: Item[] = []

          // Get system folders
          const root = await findOrCreateTabStashRoot()
          const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
          const archive = await findOrCreateFolder(ARCHIVE_FOLDER_NAME, root.id)

          // Split query into words for AND matching (all words must appear, but in any order)
          const queryWords = q.trim().split(/\s+/).filter(w => w.length > 0)

          function findBookmarkFolderById(folderId: string): chrome.bookmarks.BookmarkTreeNode | undefined {
            return folders.find(f => f.id === folderId)
          }

          for (const bookmark of items) {
            const item = bookmarkToItem(bookmark)
            if (item) {
              // Set urlHash for compatibility
              const settings = await getSettings()
              const normalized = normalizeUrl(item.url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
              item.urlHash = await sha256Hex(normalized)

              // Determine actual folder based on bookmark location (source of truth)
              let actualFolderId: string | null = null
              let parentFolder = findBookmarkFolderById(bookmark.parentId || '')

              if (parentFolder && parentFolder.title === TRASH_FOLDER_NAME) {
                actualFolderId = trash.id
              } else if (parentFolder && parentFolder.title === UNFILED_FOLDER_NAME) {
                actualFolderId = null
              } else {
                actualFolderId = bookmark.parentId || null
              }

              // Update item's folderId to match actual bookmark location
              item.folderId = actualFolderId

              // Skip trashed items in search (unless specifically searching in trash)
              if (actualFolderId === trash.id && searchFolderId !== trash.id) continue

              // Skip archived items in search (unless specifically searching in archive)
              if (actualFolderId === archive.id && searchFolderId !== archive.id) continue

              // If searching only in a specific folder, filter by folder
              if (searchFolderId && actualFolderId !== searchFolderId) continue

              // Check if item matches search query (all words must appear in any field)
              const searchableText = [
                (item.title || '').toLowerCase(),
                item.url.toLowerCase(),
                ...(item.tags || []).map(t => t.toLowerCase()),
                (item.notes || '').toLowerCase()
              ].join(' ')

              // All query words must appear somewhere in the searchable text
              const allWordsMatch = queryWords.every(word => searchableText.includes(word))

              if (allWordsMatch) {
                bookmarkItems.push(item)
              }
            }
          }

          // Sort by creation time (newest first) and limit results
          bookmarkItems.sort((a, b) => b.createdAt - a.createdAt)
          bookmarkItems = bookmarkItems.slice(0, 200)

          sendResponse({ ok: true, items: bookmarkItems } satisfies BgResponse)
          break
        }
        case 'UPDATE_ITEM': {
          if (msg.type !== 'UPDATE_ITEM') break
          const itemId = msg.id
          // Find the bookmark with this item ID
          const allBookmarks = await getCachedBookmarkTree()
          let targetBookmark: chrome.bookmarks.BookmarkTreeNode | null = null

          function searchBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
            for (const node of nodes) {
              if (node.url) {
                const metadata = decodeMetadataFromHash(node.url)
                if (metadata && metadata.id === itemId) {
                  targetBookmark = node
                  return
                }
              }
              if (node.children) {
                searchBookmarks(node.children)
              }
            }
          }

          searchBookmarks(allBookmarks)

          if (targetBookmark) {
            const existingItem = bookmarkToItem(targetBookmark)
            if (existingItem) {
              const updatedItem: Item = { ...existingItem, ...msg.patch }
              const bookmarkDetails = itemToBookmark(updatedItem)

              // Update bookmark metadata with new item data
              await chrome.bookmarks.update(targetBookmark.id, {
                title: bookmarkDetails.title,
                url: bookmarkDetails.url
              })

              sendResponse({ ok: true, updated: true } satisfies BgResponse)
              try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
              break
            }
          }

          sendResponse({ ok: false, error: 'Item not found' } as BgResponse)
          break
        }
        case 'DELETE_ITEM': {
          if (msg.type !== 'DELETE_ITEM') break
          const itemId = msg.id
          // Find the bookmark with this item ID
          const allBookmarks = await getCachedBookmarkTree()
          let targetBookmark: chrome.bookmarks.BookmarkTreeNode | null = null

          function searchBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
            for (const node of nodes) {
              if (node.url) {
                const metadata = decodeMetadataFromHash(node.url)
                if (metadata && metadata.id === itemId) {
                  targetBookmark = node
                  return
                }
              }
              if (node.children) {
                searchBookmarks(node.children)
              }
            }
          }

          searchBookmarks(allBookmarks)

          if (targetBookmark) {
            // Permanently delete the bookmark
            await chrome.bookmarks.remove(targetBookmark.id)

            sendResponse({ ok: true, deleted: true } satisfies BgResponse)
            try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          } else {
            sendResponse({ ok: false, error: 'Item not found' } as BgResponse)
          }
          break
        }
        case 'EMPTY_TRASH': {
          const root = await findOrCreateTabStashRoot()
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)

          // Get all children of trash folder (both items and folders)
          const trashChildren = await chrome.bookmarks.getChildren(trash.id)

          // Delete all children
          let deletedCount = 0
          for (const child of trashChildren) {
            try {
              if (child.url) {
                // It's a bookmark/item
                await chrome.bookmarks.remove(child.id)
              } else {
                // It's a folder - use removeTree to delete folder and all contents
                await chrome.bookmarks.removeTree(child.id)
              }
              deletedCount++
            } catch (err) {
              console.error('Tab Stash: Error deleting trash item:', err, child)
            }
          }

          sendResponse({ ok: true, deleted: deletedCount } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'IMPORT_ITEMS': {
          const now = Date.now()
          let imported = 0
          let updated = 0
          const itemsNeedingMetadata: string[] = [] // Track items that need metadata fetch
          const settings = await getSettings()
          const root = await findOrCreateTabStashRoot()
          const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)

          // Get all bookmarks to check for existing items
          const allBookmarks = await getCachedBookmarkTree()

          async function findExistingBookmark(url: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
            const normalized = normalizeUrl(url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
            const urlHash = await sha256Hex(normalized)

            async function search(nodes: chrome.bookmarks.BookmarkTreeNode[]): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
              for (const node of nodes) {
                if (node.url) {
                  const metadata = decodeMetadataFromHash(node.url)
                  if (metadata) {
                    const cleanUrl = stripMetadataFromUrl(node.url)
                    const cleanNormalized = normalizeUrl(cleanUrl, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
                    if (await sha256Hex(cleanNormalized) === urlHash) {
                      return node
                    }
                  }
                }
                if (node.children) {
                  const found = await search(node.children)
                  if (found) return found
                }
              }
              return null
            }

            return search(allBookmarks)
          }

          for (const raw of msg.items) {
            try {
              const originalUrl = raw.url
              if (!isHttpUrl(originalUrl)) continue

              // Check for existing bookmark only if duplicates are not allowed
              const existingBookmark = msg.allowDuplicates ? null : await findExistingBookmark(originalUrl)

              if (existingBookmark) {
                // Update existing bookmark
                const existingItem = bookmarkToItem(existingBookmark)
                if (existingItem) {
                  const tags = Array.from(new Set((existingItem.tags || []).concat(raw.tags || [])))
                  const updatedItem: Item = {
                    ...existingItem,
                    title: raw.title ?? existingItem.title,
                    tags,
                    lastSeenAt: now
                  }

                  const bookmarkDetails = itemToBookmark(updatedItem)
                  await chrome.bookmarks.update(existingBookmark.id, {
                    title: bookmarkDetails.title,
                    url: bookmarkDetails.url
                  })
                  updated++
                }
              } else {
                // Create new bookmark
                const normalized = normalizeUrl(originalUrl, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
                const urlHash = await sha256Hex(normalized)

                const item: Item = {
                  id: crypto.randomUUID(),
                  url: originalUrl,
                  urlHash,
                  title: raw.title,
                    createdAt: raw.createdAt ?? now,
                  lastSeenAt: now,
                  timesAdded: 1,
                  tags: raw.tags || [],
                  folderId: raw.folderId ?? null,
                  sortOrder: -(raw.createdAt ?? now) // Negative timestamp so newer items appear first
                }

                // Determine target folder
                let targetFolderId = unfiled.id
                if (raw.folderId) {
                  // Check if this folder exists in bookmarks
                  const { folders } = await getTabStashFolderStructure()
                  const targetFolder = folders.find(f => f.id === raw.folderId)
                  if (targetFolder) {
                    targetFolderId = targetFolder.id
                  }
                }

                const bookmarkDetails = itemToBookmark(item)
                await chrome.bookmarks.create({
                  ...bookmarkDetails,
                  parentId: targetFolderId
                })
                imported++

                // Queue for metadata fetch if missing title or favicon
                if (!item.title || !item.favicon) {
                  itemsNeedingMetadata.push(item.id)
                }
              }
            } catch (error) {
              console.error('Tab Stash: Error importing item', error, raw)
            }
          }

          // Add items needing metadata to the queue
          if (itemsNeedingMetadata.length > 0) {
            const newItems = itemsNeedingMetadata.filter(id => !metadataQueue.includes(id))
            metadataQueue.push(...newItems)

            // Start processing if not already running
            if (!isProcessingMetadata && metadataQueue.length > 0) {
              processMetadataQueue().catch(() => {})
            }
          }

          sendResponse({ ok: true, imported, updated } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'GET_FOLDERS_WITH_STATS': {
          // Combined endpoint that fetches both folders and stats in one call
          const { folders, items } = await getTabStashFolderStructure()
          let folderList: Folder[] = []

          // Get the Tab Stash root folder and system folders
          const root = await findOrCreateTabStashRoot()
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
          const archive = await findOrCreateFolder(ARCHIVE_FOLDER_NAME, root.id)
          const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)

          // Load folder colors from storage
          const { folderColors = {} } = await chrome.storage.local.get('folderColors')

          // Build a map to track folder order within each parent
          const foldersByParent = new Map<string, chrome.bookmarks.BookmarkTreeNode[]>()
          for (const folder of folders) {
            const parentId = folder.parentId || 'root'
            if (!foldersByParent.has(parentId)) {
              foldersByParent.set(parentId, [])
            }
            foldersByParent.get(parentId)!.push(folder)
          }

          // Add custom folders only (skip system folders themselves, but include their children)
          for (const folder of folders) {
            // Skip system folders themselves (Unfiled, Trash, Archive, Root) but NOT their children
            if (folder.title === UNFILED_FOLDER_NAME ||
                folder.title === TRASH_FOLDER_NAME ||
                folder.title === ARCHIVE_FOLDER_NAME ||
                folder.title === ROOT_FOLDER_NAME) {
              continue
            }

            // Convert bookmark hierarchy to UI hierarchy
            // If parent is Tab Stash root, show as top-level (parentId = null)
            // If parent is Trash, show as trash child (parentId = '__trash__')
            // If parent is Archive, show as archive child (parentId = '__archive__')
            // Otherwise, keep the actual parentId for nested folders
            let uiParentId: string | null = folder.parentId === root.id ? null : folder.parentId
            if (folder.parentId === trash.id) {
              uiParentId = '__trash__'
            }
            if (folder.parentId === archive.id) {
              uiParentId = '__archive__'
            }

            // Use the folder's position in the bookmark tree as sortOrder
            const parentKey = folder.parentId || 'root'
            const siblings = foldersByParent.get(parentKey) || []
            const sortOrder = siblings.indexOf(folder)

            const folderItem: Folder = {
              id: folder.id,
              name: folder.title,
              parentId: uiParentId,
              color: folderColors[folder.id],
              sortOrder: sortOrder >= 0 ? sortOrder : 0,
              createdAt: folder.dateAdded || 0
            }
            folderList.push(folderItem)
          }

          // Calculate folder stats
          const stats: Record<string, number> = {}
          for (const bookmark of items) {
            const item = bookmarkToItem(bookmark)
            if (item) {
              const actualParentId = bookmark.parentId || null

              if (actualParentId === trash.id) {
                stats['__trash__'] = (stats['__trash__'] || 0) + 1
              } else if (actualParentId === archive.id) {
                stats['__archive__'] = (stats['__archive__'] || 0) + 1
              } else if (actualParentId === unfiled.id) {
                stats['__unfiled__'] = (stats['__unfiled__'] || 0) + 1
              } else {
                stats[actualParentId] = (stats[actualParentId] || 0) + 1
              }
            }
          }

          sendResponse({ ok: true, folders: folderList, trashFolderId: trash.id, archiveFolderId: archive.id, folderStats: stats } satisfies BgResponse)
          break
        }
        case 'CREATE_FOLDER': {
          const now = Date.now()
          const root = await findOrCreateTabStashRoot()

          let parentId = msg.parentId
          if (!parentId) {
            // If no parent specified, create under root
            parentId = root.id
          }

          const newFolder = await chrome.bookmarks.create({
            parentId,
            title: msg.name
          })

          // Save folder color to storage if provided
          if (msg.color) {
            const { folderColors = {} } = await chrome.storage.local.get('folderColors')
            folderColors[newFolder.id] = msg.color
            await chrome.storage.local.set({ folderColors })
          }

          const folder: Folder = {
            id: newFolder.id,
            name: msg.name,
            parentId: msg.parentId ?? null,
            color: msg.color,
            sortOrder: now,
            createdAt: now
          }

          sendResponse({ ok: true, folder } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_FOLDERS_CHANGED' } as any) } catch {}
          break
        }
        case 'UPDATE_FOLDER': {
          // Handle parentId change (move folder)
          if (msg.patch.parentId !== undefined) {
            let targetParentId = msg.patch.parentId

            // Handle special '__trash__' marker
            if (targetParentId === '__trash__') {
              const root = await findOrCreateTabStashRoot()
              const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
              targetParentId = trash.id
            }

            await chrome.bookmarks.move(msg.id, { parentId: targetParentId })
          }

          // Handle name change (rename folder)
          const updateData: chrome.bookmarks.BookmarkUpdateFieldsType = {}
          if (msg.patch.name) {
            updateData.title = msg.patch.name
          }

          if (Object.keys(updateData).length > 0) {
            await chrome.bookmarks.update(msg.id, updateData)
          }

          // Handle color change
          if ('color' in msg.patch) {
            const { folderColors = {} } = await chrome.storage.local.get('folderColors')
            if (msg.patch.color === undefined || msg.patch.color === null) {
              // Remove color
              delete folderColors[msg.id]
            } else {
              // Set color
              folderColors[msg.id] = msg.patch.color
            }
            await chrome.storage.local.set({ folderColors })
          }

          sendResponse({ ok: true, updated: true } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_FOLDERS_CHANGED' } as any) } catch {}
          break
        }
        case 'DELETE_FOLDER': {
          if (msg.type !== 'DELETE_FOLDER') break

          // Get the folder from bookmarks
          const { folders, items } = await getTabStashFolderStructure()
          const folderToDelete = folders.find(f => f.id === msg.id)

          if (!folderToDelete) {
            sendResponse({ ok: false, error: 'Folder not found' } as BgResponse)
            break
          }

          const root = await findOrCreateTabStashRoot()
          const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)

          // Capture action for use in nested function
          const deleteAction = msg.action

          // Determine target folder for items based on action
          let targetFolderId: string
          if (deleteAction === 'move_to_parent' && folderToDelete.parentId) {
            targetFolderId = folderToDelete.parentId
          } else {
            // Default to unfiled
            targetFolderId = unfiled.id
          }

          // Find all bookmarks in this folder and its subfolders
          async function moveBookmarksFromFolder(folderId: string) {
            const children = await chrome.bookmarks.getChildren(folderId)

            for (const child of children) {
              if (child.url) {
                // This is a bookmark (item)
                const item = bookmarkToItem(child)
                if (item) {
                  if (deleteAction === 'delete_items') {
                    // Move to trash
                    await chrome.bookmarks.move(child.id, { parentId: trash.id })
                    // Update metadata
                    const updatedItem: Item = { ...item, folderId: trash.id }
                    const bookmarkDetails = itemToBookmark(updatedItem)
                    await chrome.bookmarks.update(child.id, { url: bookmarkDetails.url })
                  } else {
                    // Move to target folder
                    await chrome.bookmarks.move(child.id, { parentId: targetFolderId })
                    // Update metadata
                    const updatedItem: Item = { ...item, folderId: targetFolderId === unfiled.id ? null : targetFolderId }
                    const bookmarkDetails = itemToBookmark(updatedItem)
                    await chrome.bookmarks.update(child.id, { url: bookmarkDetails.url })
                  }
                }
              } else if (child.children) {
                // This is a subfolder, recurse
                await moveBookmarksFromFolder(child.id)
                // Move the subfolder itself
                if (deleteAction !== 'delete_items') {
                  await chrome.bookmarks.move(child.id, { parentId: targetFolderId })
                }
              }
            }
          }

          // Move bookmarks from the folder
          await moveBookmarksFromFolder(msg.id)

          // Delete the actual folder and its subfolders
          if (deleteAction === 'delete_items') {
            // Use removeTree to delete folder and all its contents
            await chrome.bookmarks.removeTree(msg.id)
          } else {
            // Need to recursively delete subfolders first (bottom-up)
            async function deleteSubfoldersRecursive(folderId: string) {
              const children = await chrome.bookmarks.getChildren(folderId)
              for (const child of children) {
                if (!child.url) {
                  // It's a subfolder - recursively delete it first
                  await deleteSubfoldersRecursive(child.id)
                  await chrome.bookmarks.remove(child.id)
                }
              }
            }
            await deleteSubfoldersRecursive(msg.id)
            // Now the folder should be empty, safe to delete
            await chrome.bookmarks.remove(msg.id)
          }

          // Clean up folder color from storage
          const { folderColors = {} } = await chrome.storage.local.get('folderColors')
          delete folderColors[msg.id]
          await chrome.storage.local.set({ folderColors })

          sendResponse({ ok: true, deleted: true } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_FOLDERS_CHANGED' } as any) } catch {}
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'MOVE_ITEMS_TO_FOLDER': {
          let moved = 0
          const allBookmarks = await getCachedBookmarkTree()

          // Determine target folder - map UI folder ID to actual bookmark folder ID
          let targetFolderId: string
          const root = await findOrCreateTabStashRoot()

          if (msg.folderId === 'trash') {
            // Move to Trash folder
            const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
            targetFolderId = trash.id
          } else if (msg.folderId === 'archive') {
            // Move to Archive folder
            const archive = await findOrCreateFolder(ARCHIVE_FOLDER_NAME, root.id)
            targetFolderId = archive.id
          } else if (msg.folderId === null) {
            // Move to Unfiled
            const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
            targetFolderId = unfiled.id
          } else {
            // This is a custom folder - the UI should be sending the actual bookmark folder ID
            // but let's verify it exists
            const { folders } = await getTabStashFolderStructure()
            const folderExists = folders.some(f => f.id === msg.folderId)

            if (folderExists) {
              targetFolderId = msg.folderId
            } else {
              // Fallback to Unfiled
              const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
              targetFolderId = unfiled.id
            }
          }

          async function findBookmarkById(nodes: chrome.bookmarks.BookmarkTreeNode[], targetId: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
            for (const node of nodes) {
              if (node.url) {
                const metadata = decodeMetadataFromHash(node.url)
                if (metadata && metadata.id === targetId) {
                  return node
                }
              }
              if (node.children) {
                const found = await findBookmarkById(node.children, targetId)
                if (found) return found
              }
            }
            return null
          }

          for (const itemId of msg.itemIds) {
            const bookmark = await findBookmarkById(allBookmarks, itemId)
            if (bookmark) {
              const item = bookmarkToItem(bookmark)
              if (item) {
                // Move bookmark to new folder
                await chrome.bookmarks.move(bookmark.id, { parentId: targetFolderId })

                // Update the item's folder metadata to match new location
                const updatedItem: Item = {
                  ...item,
                  folderId: msg.folderId
                }
                const bookmarkDetails = itemToBookmark(updatedItem)

                // Update bookmark URL to include new metadata
                await chrome.bookmarks.update(bookmark.id, {
                  url: bookmarkDetails.url
                })

                moved++
              }
            }
          }
          sendResponse({ ok: true, moved } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'BULK_ADD_TAGS': {
          let tagged = 0
          const allBookmarks = await getCachedBookmarkTree()

          async function findBookmarkById(nodes: chrome.bookmarks.BookmarkTreeNode[], targetId: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
            for (const node of nodes) {
              if (node.url) {
                const metadata = decodeMetadataFromHash(node.url)
                if (metadata && metadata.id === targetId) {
                  return node
                }
              }
              if (node.children) {
                const found = await findBookmarkById(node.children, targetId)
                if (found) return found
              }
            }
            return null
          }

          for (const itemId of msg.itemIds) {
            const bookmark = await findBookmarkById(allBookmarks, itemId)
            if (bookmark) {
              const item = bookmarkToItem(bookmark)
              if (item) {
                const existingTags = item.tags || []
                const newTags = Array.from(new Set([...existingTags, ...msg.tags]))
                const updatedItem: Item = { ...item, tags: newTags }
                const bookmarkDetails = itemToBookmark(updatedItem)

                await chrome.bookmarks.update(bookmark.id, {
                  title: bookmarkDetails.title,
                  url: bookmarkDetails.url
                })
                tagged++
              }
            }
          }
          sendResponse({ ok: true, tagged } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'BULK_REMOVE_TAGS': {
          let tagged = 0
          const allBookmarks = await getCachedBookmarkTree()

          async function findBookmarkById(nodes: chrome.bookmarks.BookmarkTreeNode[], targetId: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
            for (const node of nodes) {
              if (node.url) {
                const metadata = decodeMetadataFromHash(node.url)
                if (metadata && metadata.id === targetId) {
                  return node
                }
              }
              if (node.children) {
                const found = await findBookmarkById(node.children, targetId)
                if (found) return found
              }
            }
            return null
          }

          for (const itemId of msg.itemIds) {
            const bookmark = await findBookmarkById(allBookmarks, itemId)
            if (bookmark) {
              const item = bookmarkToItem(bookmark)
              if (item) {
                const existingTags = item.tags || []
                const newTags = existingTags.filter(tag => !msg.tags.includes(tag))
                const updatedItem: Item = { ...item, tags: newTags }
                const bookmarkDetails = itemToBookmark(updatedItem)

                await chrome.bookmarks.update(bookmark.id, {
                  title: bookmarkDetails.title,
                  url: bookmarkDetails.url
                })
                tagged++
              }
            }
          }
          sendResponse({ ok: true, tagged } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'GET_FOLDER_STATS': {
          const { folders, items } = await getTabStashFolderStructure()
          const stats: Record<string, number> = {}

          // Get system folder IDs
          const root = await findOrCreateTabStashRoot()
          const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
          const archive = await findOrCreateFolder(ARCHIVE_FOLDER_NAME, root.id)

          for (const bookmark of items) {
            const item = bookmarkToItem(bookmark)
            if (item) {
              // Use actual bookmark parent ID
              const actualParentId = bookmark.parentId || null

              // Determine which logical folder this belongs to
              let statsKey: string

              if (actualParentId === trash.id) {
                // In Trash folder
                stats['__trash__'] = (stats['__trash__'] || 0) + 1
              } else if (actualParentId === archive.id) {
                // In Archive folder
                stats['__archive__'] = (stats['__archive__'] || 0) + 1
              } else if (actualParentId === unfiled.id) {
                // In Unfiled folder
                stats['__unfiled__'] = (stats['__unfiled__'] || 0) + 1
              } else {
                // In a custom folder - use the actual bookmark folder ID
                stats[actualParentId] = (stats[actualParentId] || 0) + 1
              }
            }
          }

          sendResponse({ ok: true, folderStats: stats } satisfies BgResponse)
          break
        }
        case 'REORDER_ITEMS': {
          const allBookmarks = await getCachedBookmarkTree()

          async function findBookmarkById(nodes: chrome.bookmarks.BookmarkTreeNode[], targetId: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
            for (const node of nodes) {
              if (node.url) {
                const metadata = decodeMetadataFromHash(node.url)
                if (metadata && metadata.id === targetId) {
                  return node
                }
              }
              if (node.children) {
                const found = await findBookmarkById(node.children, targetId)
                if (found) return found
              }
            }
            return null
          }

          // Update sortOrder for each item based on position in array
          let reordered = 0
          for (let i = 0; i < msg.itemIds.length; i++) {
            const itemId = msg.itemIds[i]
            const bookmark = await findBookmarkById(allBookmarks, itemId)
            if (bookmark) {
              const item = bookmarkToItem(bookmark)
              if (item) {
                const updatedItem: Item = {
                  ...item,
                  sortOrder: i
                }
                const bookmarkDetails = itemToBookmark(updatedItem)
                await chrome.bookmarks.update(bookmark.id, {
                  url: bookmarkDetails.url
                })
                reordered++
              }
            }
          }

          sendResponse({ ok: true, reordered } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_ITEMS_CHANGED' } as any) } catch {}
          break
        }
        case 'REORDER_FOLDERS': {
          // Determine the actual parent ID for Chrome bookmarks
          const root = await findOrCreateTabStashRoot()
          const actualParentId = msg.parentId || root.id

          // Reorder folders by moving each to the correct index
          let reordered = 0
          for (let i = 0; i < msg.folderIds.length; i++) {
            const folderId = msg.folderIds[i]
            try {
              // Move folder to position i within its parent
              await chrome.bookmarks.move(folderId, {
                parentId: actualParentId,
                index: i
              })
              reordered++
            } catch (e) {
              // Silently ignore reorder errors
            }
          }

          sendResponse({ ok: true, reordered } satisfies BgResponse)
          try { chrome.runtime.sendMessage({ type: 'EVENT_FOLDERS_CHANGED' } as any) } catch {}
          break
        }
        case 'REFRESH_METADATA': {
          // Add items to metadata refresh queue and mark them for force refresh
          const newItems = msg.itemIds.filter(id => !metadataQueue.includes(id))
          metadataQueue.push(...newItems)
          // Mark all items from REFRESH_METADATA as force refresh (user explicitly requested it)
          msg.itemIds.forEach(id => forceRefreshSet.add(id))
          console.log(`[METADATA] Queued ${newItems.length} new items for force refresh. Total in queue: ${metadataQueue.length}`)
          sendResponse({ ok: true, queued: newItems.length } satisfies BgResponse)

          // Start processing if not already running
          if (!isProcessingMetadata && metadataQueue.length > 0) {
            console.log('[METADATA] Starting metadata fetch queue processor...')
            processMetadataQueue().catch(() => {})
          }
          break
        }
        case 'CHECK_EXISTING_URLS': {
          // Check which URLs already exist in Tab Stash
          const { folders, items } = await getTabStashFolderStructure()
          const settings = await getSettings()

          // Create a map of urlHash -> folderName for all existing items
          const existingMap = new Map<string, string>()

          // Get system folders
          const root = await findOrCreateTabStashRoot()
          const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
          const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)

          function findBookmarkFolderById(folderId: string): chrome.bookmarks.BookmarkTreeNode | undefined {
            return folders.find(f => f.id === folderId)
          }

          for (const bookmark of items) {
            const item = bookmarkToItem(bookmark)
            if (!item) continue

            const normalized = normalizeUrl(item.url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
            const urlHash = await sha256Hex(normalized)

            // Determine actual folder name based on bookmark location
            let folderName = 'Unfiled'
            let parentFolder = findBookmarkFolderById(bookmark.parentId || '')

            if (parentFolder) {
              if (parentFolder.title === TRASH_FOLDER_NAME) {
                folderName = 'Trash'
              } else if (parentFolder.title === UNFILED_FOLDER_NAME) {
                folderName = 'Unfiled'
              } else {
                folderName = parentFolder.title
              }
            }

            existingMap.set(urlHash, folderName)
          }

          // Check which of the provided URLs exist
          const existing: Array<{ url: string; folderName: string }> = []
          for (const url of msg.urls) {
            const normalized = normalizeUrl(url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
            const urlHash = await sha256Hex(normalized)

            if (existingMap.has(urlHash)) {
              existing.push({
                url,
                folderName: existingMap.get(urlHash)!
              })
            }
          }

          sendResponse({ ok: true, existing } satisfies BgResponse)
          break
        }
        // SYNC_NOW removed in v1
        case 'CLOSE_TABS': {
          const settings = await getSettings()
          const includePinned = msg.includePinned ?? settings.closePinned
          const ids = msg.tabIds
          const tabs = await chrome.tabs.query({})
          const toClose = tabs
            .filter((t: any) => ids.includes(t.id as number))
            .filter((t: any) => includePinned || !t.pinned)
            .map((t: any) => t.id as number)
          let closed = 0
          if (toClose.length) {
            try { await chrome.tabs.remove(toClose); closed = toClose.length } catch {}
          }
          sendResponse({ ok: true, closed } satisfies BgResponse)
          break
        }
        case 'OPEN_OR_FOCUS_URL': {
          const settings = await getSettings()
          const openInBackground = msg.openInBackground || false

          // If opening in background, always create new tab (don't focus existing)
          if (openInBackground) {
            await chrome.tabs.create({ url: msg.url, active: false })
            sendResponse({ ok: true, opened: true } satisfies BgResponse)
            break
          }

          // Otherwise, try to focus existing tab or create new one
          const targetNorm = normalizeUrl(msg.url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
          const targetHash = await sha256Hex(targetNorm)
          const tabs = await chrome.tabs.query({})
          for (const t of tabs) {
            const href = (t as any).url as string | undefined
            if (!href) continue
            if (!isHttpUrl(href)) continue
            const norm = normalizeUrl(href, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
            const hash = await sha256Hex(norm)
            if (hash === targetHash) {
              try {
                if (typeof (t as any).windowId === 'number') await chrome.windows.update((t as any).windowId as number, { focused: true })
                if (typeof (t as any).id === 'number') await chrome.tabs.update((t as any).id as number, { active: true })
              } catch {}
              sendResponse({ ok: true, focused: true } satisfies BgResponse)
              return
            }
          }
          await chrome.tabs.create({ url: msg.url })
          sendResponse({ ok: true, opened: true } satisfies BgResponse)
          break
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message' } as BgResponse)
      }
    } catch (e: any) {
      sendResponse({ ok: false, error: String(e?.message || e) } as BgResponse)
    }
  })()
  return true
})

// Keyboard shortcuts/commands
chrome.commands?.onCommand.addListener(async (command: string) => {
  try {
    if (command === 'stash_all_tabs') {
      const settings = await getSettings()
      await stashTabs(undefined, [], settings.closeAfterStash)
    } else if (command === 'open_side_panel') {
      try { await chrome.sidePanel.open({}) } catch {}
    } else if (command === 'open_dashboard') {
      const url = chrome.runtime.getURL('src/dashboard/index.html')
      await chrome.tabs.create({ url })
    } else if (command === 'stash_current_tab') {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (active?.id) await stashTabs([active.id], [], (await getSettings()).closeAfterStash)
    }
  } catch {}
})

// Clicking the toolbar button opens the Side Panel
chrome.action?.onClicked.addListener(async () => {
  try { await chrome.sidePanel.open({}) } catch {}
})
async function findBookmarkByUrlHash(urlHash: string): Promise<Item | null> {
  const allBookmarks = await getCachedBookmarkTree()
  const settings = await getSettings()

  async function searchBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): Promise<Item | null> {
    for (const node of nodes) {
      if (node.url) {
        const metadata = decodeMetadataFromHash(node.url)
        if (metadata) {
          const cleanUrl = stripMetadataFromUrl(node.url)
          const normalized = normalizeUrl(cleanUrl, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
          const hash = await sha256Hex(normalized)
          if (hash === urlHash) {
            return bookmarkToItem(node)
          }
        }
      }
      if (node.children) {
        const found = await searchBookmarks(node.children)
        if (found) return found
      }
    }
    return null
  }

  return await searchBookmarks(allBookmarks)
}

async function getTabsWithStatus(currentWindow = true, windowId?: number): Promise<TabWithStatus[]> {
  const settings = await getSettings()
  const tabs = await queryTabs(currentWindow, windowId)

  // Build a hash map of all stashed items ONCE for efficient lookup
  const hashMap = new Map<string, Item>()
  const allBookmarks = await getCachedBookmarkTree()

  async function buildHashMap(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const node of nodes) {
      if (node.url) {
        const item = bookmarkToItem(node)
        if (item) {
          const cleanUrl = stripMetadataFromUrl(node.url)
          const normalized = normalizeUrl(cleanUrl, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
          const hash = await sha256Hex(normalized)
          hashMap.set(hash, item)
        }
      }
      if (node.children) {
        await buildHashMap(node.children)
      }
    }
  }

  await buildHashMap(allBookmarks)

  // Now process tabs with efficient lookups
  const out: TabWithStatus[] = []
  for (const t of tabs) {
    const stashable = isStashableUrl(t.url)
    let urlHash = ''
    let existing: Item | null = null
    if (stashable) {
      const n = normalizeUrl(t.url, { stripAllParams: settings.stripAllParams, stripTracking: settings.stripTrackingParams })
      urlHash = await sha256Hex(n)
      existing = hashMap.get(urlHash) || null
    }
    out.push({
      ...t,
      urlHash,
      stashed: !!existing,
      itemId: existing?.id,
      stashable
    })
  }
  return out
}

// Invalidate bookmark cache on any bookmark changes
chrome.bookmarks.onCreated.addListener(() => invalidateBookmarkCache())
chrome.bookmarks.onRemoved.addListener(() => invalidateBookmarkCache())
chrome.bookmarks.onChanged.addListener(() => invalidateBookmarkCache())
chrome.bookmarks.onMoved.addListener(() => invalidateBookmarkCache())
