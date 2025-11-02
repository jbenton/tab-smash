import Dexie, { Table } from 'dexie'
import type { Item, Folder } from './types'

export class TabStashDB extends Dexie {
  items!: Table<Item, string>
  folders!: Table<Folder, string>

  constructor() {
    super('tab-stash-db')
    this.version(1).stores({
      // id is primary key, urlHash indexed for dedupe, status and dates for queries
      items: '&id, urlHash, status, createdAt, lastSeenAt'
    })
    // Version 2: Add folders table and folderId/sortOrder to items
    this.version(2).stores({
      items: '&id, urlHash, status, createdAt, lastSeenAt, folderId',
      folders: '&id, parentId, sortOrder, createdAt'
    }).upgrade(async tx => {
      // Migration: add folderId and sortOrder to existing items
      await tx.table('items').toCollection().modify(item => {
        if (!item.folderId) item.folderId = null
        if (typeof item.sortOrder !== 'number') item.sortOrder = 0
      })
    })
    // Version 3: Remove status field (no longer used, trashed determined by folderId)
    this.version(3).stores({
      items: '&id, urlHash, createdAt, lastSeenAt, folderId',
      folders: '&id, parentId, sortOrder, createdAt'
    }).upgrade(async tx => {
      // Migration: remove status field from existing items
      await tx.table('items').toCollection().modify(item => {
        delete (item as any).status
      })
    })
  }
}

export const db = new TabStashDB()

