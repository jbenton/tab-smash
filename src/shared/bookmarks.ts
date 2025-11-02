// @ts-ignore - Chrome APIs available in extension context
declare const chrome: any
import type { Item, Folder } from './types'
import { processTabXpertUrl } from './tabxpert'

export interface BookmarkMetadata {
  id: string
  tags?: string[]
  notes?: string
  favicon?: string
  timesAdded?: number
  created: number
  lastSeen: number
  folderId?: string | null
  sortOrder?: number
}

export const TAB_STASH_HASH_PREFIX = '#tab-stash:'
export const ROOT_FOLDER_NAME = 'Tab Stash'
export const UNFILED_FOLDER_NAME = 'Unfiled'
export const TRASH_FOLDER_NAME = 'Trash'
export const ARCHIVE_FOLDER_NAME = 'Archive'

// Browser-compatible base64 encoding/decoding
function base64Encode(str: string): string {
  try {
    // Try browser API first
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
  } catch {
    // Fallback for environments without btoa
    return Buffer.from(str, 'utf-8').toString('base64')
  }
}

function base64Decode(str: string): string {
  try {
    // Try browser API first
    return decodeURIComponent(Array.from(atob(str), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
  } catch {
    // Fallback for environments without atob
    return Buffer.from(str, 'base64').toString('utf-8')
  }
}

export function encodeMetadataToHash(item: Item): string {
  const metadata: BookmarkMetadata = {
    id: item.id,
    tags: item.tags,
    notes: item.notes,
    favicon: item.favicon,
    timesAdded: item.timesAdded,
    created: item.createdAt,
    lastSeen: item.lastSeenAt,
    folderId: item.folderId,
    sortOrder: item.sortOrder
  }
  const jsonString = JSON.stringify(metadata)
  const encoded = base64Encode(jsonString)
  return TAB_STASH_HASH_PREFIX + encoded
}

export function decodeMetadataFromHash(url: string): BookmarkMetadata | null {
  const hashIndex = url.indexOf(TAB_STASH_HASH_PREFIX)
  if (hashIndex === -1) return null

  try {
    const encoded = url.slice(hashIndex + TAB_STASH_HASH_PREFIX.length)
    const decoded = base64Decode(encoded)
    return JSON.parse(decoded) as BookmarkMetadata
  } catch {
    return null
  }
}

export function stripMetadataFromUrl(url: string): string {
  const hashIndex = url.indexOf(TAB_STASH_HASH_PREFIX)
  return hashIndex === -1 ? url : url.slice(0, hashIndex)
}

export async function findOrCreateTabStashRoot(): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const bookmarkTree = await chrome.bookmarks.getTree()

  // First, search for ANY existing Tab Stash folder in the entire bookmark tree
  function findTabStashInTree(nodes: chrome.bookmarks.BookmarkTreeNode[]): chrome.bookmarks.BookmarkTreeNode | null {
    for (const node of nodes) {
      if (!node.url && node.title === ROOT_FOLDER_NAME) {
        return node
      }
      if (node.children) {
        const found = findTabStashInTree(node.children)
        if (found) return found
      }
    }
    return null
  }

  const existingTabStash = findTabStashInTree(bookmarkTree)
  if (existingTabStash) {
    return existingTabStash
  }

  // If no existing Tab Stash folder found, create one in the traditional location
  // Find the "Other bookmarks" folder - try multiple methods
  let otherBookmarks: chrome.bookmarks.BookmarkTreeNode | undefined

  // Method 1: Try by ID "2" (traditional Chrome ID)
  otherBookmarks = bookmarkTree[0].children?.find((node: any) => node.id === '2')

  if (!otherBookmarks) {
    // Method 2: Try by title "Other bookmarks"
    otherBookmarks = bookmarkTree[0].children?.find((node: any) => node.title === 'Other bookmarks')
  }

  if (!otherBookmarks) {
    // Method 3: Use the first non-"Bookmarks bar" folder
    otherBookmarks = bookmarkTree[0].children?.find((node: any) => node.title !== 'Bookmarks bar' && !node.url)
  }

  if (!otherBookmarks) {
    // Method 4: Create Tab Stash in the root bookmarks folder
    otherBookmarks = bookmarkTree[0]
  }

  // Create new root folder
  const tabStashRoot = await chrome.bookmarks.create({
    parentId: otherBookmarks.id,
    title: ROOT_FOLDER_NAME
  })

  // Create default folders
  await chrome.bookmarks.create({
    parentId: tabStashRoot.id,
    title: UNFILED_FOLDER_NAME
  })

  await chrome.bookmarks.create({
    parentId: tabStashRoot.id,
    title: TRASH_FOLDER_NAME
  })

  return tabStashRoot
}

export async function findOrCreateFolder(folderName: string, parentId: string): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const children = await chrome.bookmarks.getChildren(parentId)
  const existing = children.find((child: any) => child.title === folderName && !child.url)

  if (existing) {
    return existing
  }

  return await chrome.bookmarks.create({
    parentId,
    title: folderName
  })
}

export function itemToBookmark(item: Item): chrome.bookmarks.CreateDetails {
  const urlWithMetadata = item.url + encodeMetadataToHash(item)

  return {
    url: urlWithMetadata,
    title: item.title || item.url
  }
}

export function bookmarkToItem(node: chrome.bookmarks.BookmarkTreeNode): Item | null {
  if (!node.url) return null

  const metadata = decodeMetadataFromHash(node.url)
  let cleanUrl = stripMetadataFromUrl(node.url)

  if (!metadata) {
    // No valid metadata - create a fallback item
    // This handles bookmarks with truncated or missing metadata
    const now = Date.now()
    return {
      id: node.id, // Use bookmark ID as fallback
      url: cleanUrl,
      urlHash: '', // Will be calculated by background service
      title: node.title || cleanUrl,
      favicon: undefined,
      createdAt: node.dateAdded || now,
      lastSeenAt: now,
      timesAdded: 1,
      notes: undefined,
      tags: [],
      folderId: null, // Will be determined by physical location
      sortOrder: node.dateAdded || now
    }
  }

  return {
    id: metadata.id,
    url: cleanUrl,
    urlHash: '', // Will be calculated by background service
    title: node.title,
    favicon: metadata.favicon,
    createdAt: metadata.created,
    lastSeenAt: metadata.lastSeen,
    timesAdded: metadata.timesAdded || 1,
    notes: metadata.notes,
    tags: metadata.tags,
    folderId: metadata.folderId ?? null,
    sortOrder: metadata.sortOrder ?? node.dateAdded ?? 0
  }
}

export function folderToBookmark(folder: Folder): chrome.bookmarks.CreateDetails {
  return {
    title: folder.name,
    dateAdded: folder.createdAt
  }
}

export async function getBookmarkFolderPath(folderId: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const path: chrome.bookmarks.BookmarkTreeNode[] = []
  let currentId = folderId

  while (currentId) {
    const folder = await chrome.bookmarks.get(currentId)
    if (folder.length === 0) break

    path.unshift(folder[0])
    currentId = folder[0].parentId || ''

    // Stop at Tab Stash root
    if (folder[0].title === ROOT_FOLDER_NAME) break
  }

  return path
}

export async function getTabStashFolderStructure(): Promise<{ folders: chrome.bookmarks.BookmarkTreeNode[], items: chrome.bookmarks.BookmarkTreeNode[] }> {
  const root = await findOrCreateTabStashRoot()
  const folders: chrome.bookmarks.BookmarkTreeNode[] = []
  const items: chrome.bookmarks.BookmarkTreeNode[] = []

  // Fetch entire tree once instead of making hundreds of getChildren calls
  const tree = await chrome.bookmarks.getTree()

  // Find the Tab Stash root in the tree
  function findNodeById(nodes: chrome.bookmarks.BookmarkTreeNode[], targetId: string): chrome.bookmarks.BookmarkTreeNode | null {
    for (const node of nodes) {
      if (node.id === targetId) return node
      if (node.children) {
        const found = findNodeById(node.children, targetId)
        if (found) return found
      }
    }
    return null
  }

  const rootNode = findNodeById(tree, root.id)
  if (!rootNode || !rootNode.children) {
    return { folders, items }
  }

  // Traverse in memory (no more API calls)
  function traverse(node: chrome.bookmarks.BookmarkTreeNode) {
    if (!node.children) return

    for (const child of node.children) {
      if (child.url) {
        // This is a bookmark (item)
        items.push(child)
      } else {
        // This is a folder
        folders.push(child)
        // Recursively traverse subfolders
        traverse(child)
      }
    }
  }

  traverse(rootNode)
  return { folders, items }
}

export async function createBookmarkFolderHierarchy(folderName: string, parentId: string | null = null): Promise<string> {
  const root = await findOrCreateTabStashRoot()

  let actualParentId: string
  if (!parentId) {
    // Create under Unfiled by default
    const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
    actualParentId = unfiled.id
  } else {
    actualParentId = parentId
  }

  // Handle nested folders (e.g., "AI Research/Vision Models")
  const parts = folderName.split('/')
  let currentParentId = actualParentId

  for (const part of parts) {
    const folder = await findOrCreateFolder(part.trim(), currentParentId)
    currentParentId = folder.id
  }

  return currentParentId
}

export async function findBookmarkFolderForItem(metadata: BookmarkMetadata): Promise<string> {
  const root = await findOrCreateTabStashRoot()

  if (metadata.folderId === null || metadata.folderId === undefined) {
    const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
    return unfiled.id
  }

  // Try to find folder by metadata.folderId (stored as folder title temporarily)
  // This is a simplified approach - in a full implementation, we'd maintain a mapping
  const allFolders = await chrome.bookmarks.getSubTree(root.id)

  function findFolderRecursively(nodes: chrome.bookmarks.BookmarkTreeNode[], targetId: string): chrome.bookmarks.BookmarkTreeNode | null {
    for (const node of nodes) {
      if (!node.url && node.title === targetId) {
        return node
      }
      if (node.children) {
        const found = findFolderRecursively(node.children, targetId)
        if (found) return found
      }
    }
    return null
  }

  const folder = findFolderRecursively(allFolders[0]?.children || [], metadata.folderId)
  if (folder) {
    return folder.id
  }

  // If not found, create under Unfiled
  const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
  return unfiled.id
}

export async function moveBookmarkToTrash(bookmarkId: string): Promise<void> {
  const root = await findOrCreateTabStashRoot()
  const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
  await chrome.bookmarks.move(bookmarkId, { parentId: trash.id })
}

export async function emptyTrash(): Promise<void> {
  const root = await findOrCreateTabStashRoot()
  const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)
  const trashItems = await chrome.bookmarks.getChildren(trash.id)

  for (const item of trashItems) {
    await chrome.bookmarks.remove(item.id)
  }
}