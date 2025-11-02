// @ts-ignore - Chrome APIs available in extension context
declare const chrome: any
import { db } from './db'
import {
  findOrCreateTabStashRoot,
  findOrCreateFolder,
  itemToBookmark,
  folderToBookmark,
  UNFILED_FOLDER_NAME,
  TRASH_FOLDER_NAME
} from './bookmarks'
import type { Item, Folder } from './types'

export interface MigrationResult {
  itemsMigrated: number
  foldersMigrated: number
  errors: string[]
}

export async function hasIndexedDBData(): Promise<boolean> {
  try {
    const itemCount = await db.items.count()
    const folderCount = await db.folders.count()
    return itemCount > 0 || folderCount > 0
  } catch {
    return false
  }
}

export async function hasBookmarkData(): Promise<boolean> {
  try {
    const root = await findOrCreateTabStashRoot()
    const children = await chrome.bookmarks.getChildren(root.id)
    return children.length > 0
  } catch {
    return false
  }
}

export async function migrateFromIndexedDB(): Promise<MigrationResult> {
  const result: MigrationResult = {
    itemsMigrated: 0,
    foldersMigrated: 0,
    errors: []
  }

  try {
    // Check if we have data to migrate
    const hasData = await hasIndexedDBData()
    if (!hasData) {
      return result
    }

    // Create Tab Stash root structure
    const root = await findOrCreateTabStashRoot()
    const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
    const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)

    // First, migrate folders
    const folders = await db.folders.orderBy('sortOrder').toArray()
    const folderIdMap = new Map<string, string>() // Maps old DB folder ID to new bookmark folder ID

    for (const folder of folders) {
      try {
        let parentId = root.id

        // If folder has a parent, find the corresponding bookmark folder
        if (folder.parentId) {
          const mappedParentId = folderIdMap.get(folder.parentId)
          if (mappedParentId) {
            parentId = mappedParentId
          } else {
            // Parent folder might not exist yet, put at root for now
            result.errors.push(`Folder "${folder.name}" references unknown parent, placing at root`)
          }
        }

        const bookmarkFolder = await chrome.bookmarks.create({
          parentId,
          title: folder.name
        })

        folderIdMap.set(folder.id, bookmarkFolder.id)
        result.foldersMigrated++
      } catch (error) {
        result.errors.push(`Failed to migrate folder "${folder.name}": ${error}`)
      }
    }

    // Then, migrate items
    const items = await db.items.orderBy('sortOrder').toArray()

    for (const item of items) {
      try {
        // Determine target folder
        let targetFolderId = unfiled.id

        if (item.folderId && folderIdMap.has(item.folderId)) {
          targetFolderId = folderIdMap.get(item.folderId)!
        }

        const bookmarkDetails = itemToBookmark(item)
        await chrome.bookmarks.create({
          ...bookmarkDetails,
          parentId: targetFolderId
        })

        result.itemsMigrated++
      } catch (error) {
        result.errors.push(`Failed to migrate item "${item.title || item.url}": ${error}`)
      }
    }

    return result
  } catch (error) {
    result.errors.push(`Migration failed: ${error}`)
    return result
  }
}

export async function cleanupIndexedDB(): Promise<void> {
  try {
    await db.delete()
  } catch (error) {
    console.error('Failed to cleanup IndexedDB:', error)
  }
}

export async function getMigrationStatus(): Promise<{
  hasIndexedDBData: boolean
  hasBookmarkData: boolean
  needsMigration: boolean
}> {
  const hasIndexedDB = await hasIndexedDBData()
  const hasBookmarks = await hasBookmarkData()

  return {
    hasIndexedDBData: hasIndexedDB,
    hasBookmarkData: hasBookmarks,
    needsMigration: hasIndexedDB && !hasBookmarks
  }
}

export async function addMetadataToExistingBookmarks(): Promise<{ updated: number, errors: string[] }> {
  const result = { updated: 0, errors: [] }

  try {
    const root = await findOrCreateTabStashRoot()
    console.log('Tab Stash: addMetadataToExistingBookmarks - scanning folder', root.id)

    // Recursively find all bookmarks in the Tab Stash folder
    async function processFolder(folderId: string, folderPath: string[] = []) {
      const children = await chrome.bookmarks.getChildren(folderId)

      for (const child of children) {
        if (child.url) {
          // This is a bookmark
          const { decodeMetadataFromHash, encodeMetadataToHash, itemToBookmark } = await import('./bookmarks')
          const metadata = decodeMetadataFromHash(child.url)

          if (!metadata) {
            // No metadata - need to add it
            console.log('Tab Stash: Adding metadata to bookmark:', child.title, child.url?.substring(0, 100))

            try {
              const now = Date.now()

              // Determine folder from bookmark location
              let determinedFolderId: string | null = null
              const unfiled = await findOrCreateFolder(UNFILED_FOLDER_NAME, root.id)
              const trash = await findOrCreateFolder(TRASH_FOLDER_NAME, root.id)

              if (folderId === unfiled.id) {
                determinedFolderId = null
              } else if (folderId === trash.id) {
                determinedFolderId = trash.id
              } else if (folderId !== root.id) {
                determinedFolderId = folderId
              }

              // Create item with metadata
              const item: Item = {
                id: crypto.randomUUID(),
                url: child.url,
                urlHash: '', // Will be filled by itemToBookmark
                title: child.title || child.url,
                favicon: undefined,
                createdAt: child.dateAdded || now,
                lastSeenAt: now,
                timesAdded: 1,
                tags: [],
                notes: undefined,
                folderId: determinedFolderId,
                sortOrder: child.dateAdded || now
              }

              const bookmarkDetails = itemToBookmark(item)

              // Update the bookmark with metadata
              await chrome.bookmarks.update(child.id, {
                url: bookmarkDetails.url
              })

              result.updated++
              console.log('Tab Stash: Added metadata to bookmark', child.id)
            } catch (error) {
              const errorMsg = `Failed to add metadata to "${child.title}": ${error}`
              result.errors.push(errorMsg)
              console.error('Tab Stash:', errorMsg)
            }
          }
        } else {
          // This is a folder - recurse
          await processFolder(child.id, [...folderPath, child.title])
        }
      }
    }

    await processFolder(root.id)

    console.log('Tab Stash: addMetadataToExistingBookmarks complete -', result.updated, 'bookmarks updated')
    return result
  } catch (error) {
    result.errors.push(`Migration failed: ${error}`)
    console.error('Tab Stash: addMetadataToExistingBookmarks failed:', error)
    return result
  }
}

export async function addFaviconsToExistingBookmarks(): Promise<{ updated: number, errors: string[] }> {
  const result = { updated: 0, errors: [] }

  try {
    const root = await findOrCreateTabStashRoot()
    console.log('Tab Stash: addFaviconsToExistingBookmarks - scanning folder', root.id)

    // Recursively find all bookmarks in the Tab Stash folder
    async function processFolder(folderId: string) {
      const children = await chrome.bookmarks.getChildren(folderId)

      for (const child of children) {
        if (child.url) {
          // This is a bookmark
          const { decodeMetadataFromHash, stripMetadataFromUrl, itemToBookmark, bookmarkToItem } = await import('./bookmarks')
          const metadata = decodeMetadataFromHash(child.url)

          if (metadata && !metadata.favicon) {
            // Has metadata but no favicon - add it
            console.log('Tab Stash: Adding favicon to bookmark:', child.title)

            try {
              const cleanUrl = stripMetadataFromUrl(child.url)

              // Extract domain from URL
              let domain = ''
              try {
                const url = new URL(cleanUrl)
                domain = url.hostname
              } catch {
                console.log('Tab Stash: Invalid URL, skipping:', cleanUrl.substring(0, 100))
                continue
              }

              // Use Google's favicon service
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`

              // Convert bookmark to Item and update with favicon
              const item = bookmarkToItem(child)
              if (item) {
                item.favicon = faviconUrl
                const bookmarkDetails = itemToBookmark(item)

                // Update the bookmark with new metadata including favicon
                await chrome.bookmarks.update(child.id, {
                  url: bookmarkDetails.url
                })

                result.updated++
                console.log('Tab Stash: Added favicon to bookmark', child.id, domain)
              }
            } catch (error) {
              const errorMsg = `Failed to add favicon to "${child.title}": ${error}`
              result.errors.push(errorMsg)
              console.error('Tab Stash:', errorMsg)
            }
          }
        } else {
          // This is a folder - recurse
          await processFolder(child.id)
        }
      }
    }

    await processFolder(root.id)

    console.log('Tab Stash: addFaviconsToExistingBookmarks complete -', result.updated, 'bookmarks updated')
    return result
  } catch (error) {
    result.errors.push(`Favicon migration failed: ${error}`)
    console.error('Tab Stash: addFaviconsToExistingBookmarks failed:', error)
    return result
  }
}

// Pass the processTabXpertUrl function to the migration to avoid dynamic imports
export async function convertTabXpertUrls(processTabXpertUrl: (item: any) => Promise<any>): Promise<{ converted: number, errors: string[] }> {
  const result = { converted: 0, errors: [] }

  try {
    const root = await findOrCreateTabStashRoot()
    console.log('Tab Stash: convertTabXpertUrls - scanning folder', root.id)

    // Recursively find all bookmarks in the Tab Stash folder
    async function processFolder(folderId: string) {
      const children = await chrome.bookmarks.getChildren(folderId)

      for (const child of children) {
        if (child.url) {
          // This is a bookmark
          const { stripMetadataFromUrl, itemToBookmark, bookmarkToItem } = await import('./bookmarks')
          const cleanUrl = stripMetadataFromUrl(child.url)

          // Check if this is a TabXpert URL
          if (cleanUrl.includes('s.tabxpert.com/')) {
            console.log('Tab Stash: Converting TabXpert URL:', child.title, cleanUrl.substring(0, 100))

            try {
              // Convert bookmark to Item, process TabXpert URL, then update bookmark
              const item = bookmarkToItem(child)
              if (item) {
                // Process TabXpert URL conversion using the passed function
                const convertedItem = await processTabXpertUrl(item)

                // Check if URL was actually converted
                if (convertedItem.url !== item.url) {
                  const bookmarkDetails = itemToBookmark(convertedItem)

                  // Update the bookmark with converted URL and new metadata
                  await chrome.bookmarks.update(child.id, {
                    url: bookmarkDetails.url,
                    title: bookmarkDetails.title
                  })

                  result.converted++
                  console.log('Tab Stash: Converted TabXpert URL', child.id, cleanUrl.substring(0, 100), '→', convertedItem.url.substring(0, 100))
                } else {
                  console.log('Tab Stash: TabXpert URL did not need conversion:', child.title)
                }
              }
            } catch (error) {
              const errorMsg = `Failed to convert TabXpert URL "${child.title}": ${error}`
              result.errors.push(errorMsg)
              console.error('Tab Stash:', errorMsg)
            }
          }
        } else {
          // This is a folder - recurse
          await processFolder(child.id)
        }
      }
    }

    await processFolder(root.id)

    console.log('Tab Stash: convertTabXpertUrls complete -', result.converted, 'URLs converted')
    return result
  } catch (error) {
    result.errors.push(`TabXpert URL conversion failed: ${error}`)
    console.error('Tab Stash: convertTabXpertUrls failed:', error)
    return result
  }
}