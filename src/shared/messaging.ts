// Message types between UI <-> background
import type { StashResult, Item, TabSummary, TabWithStatus, Folder, WindowWithTabs } from './types'

export type BgMessage =
  | { type: 'PING' }
  | { type: 'GET_TABS'; currentWindow?: boolean; windowId?: number }
  | { type: 'GET_TABS_STATUS'; currentWindow?: boolean; windowId?: number }
  | { type: 'GET_ALL_WINDOWS' }
  | { type: 'STASH_TABS'; tabIds?: number[]; tags?: string[]; close?: boolean; preserveActive?: boolean; folderId?: string | null }
  | { type: 'GET_ITEMS'; limit?: number; folderId?: string | null; includeTrash?: boolean; includeArchive?: boolean }
  | { type: 'SEARCH_ITEMS'; q: string; folderId?: string }
  | { type: 'UPDATE_ITEM'; id: string; patch: Partial<Item> }
  | { type: 'DELETE_ITEM'; id: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'OPEN_OR_FOCUS_URL'; url: string; openInBackground?: boolean }
  | { type: 'IMPORT_ITEMS'; items: Array<{ url: string; title?: string; tags?: string[]; createdAt?: number; folderId?: string | null }>; allowDuplicates?: boolean }
  | { type: 'CLOSE_TABS'; tabIds: number[]; includePinned?: boolean }
  | { type: 'GET_FOLDERS' }
  | { type: 'GET_FOLDERS_WITH_STATS' }
  | { type: 'CREATE_FOLDER'; name: string; parentId?: string | null; color?: string }
  | { type: 'UPDATE_FOLDER'; id: string; patch: Partial<Folder> }
  | { type: 'DELETE_FOLDER'; id: string; action: 'delete_items' | 'move_to_parent' | 'move_to_unfiled' }
  | { type: 'MOVE_ITEMS_TO_FOLDER'; itemIds: string[]; folderId: string | null }
  | { type: 'BULK_ADD_TAGS'; itemIds: string[]; tags: string[] }
  | { type: 'BULK_REMOVE_TAGS'; itemIds: string[]; tags: string[] }
  | { type: 'GET_FOLDER_STATS' }
  | { type: 'REORDER_ITEMS'; itemIds: string[]; folderId: string | null | 'trash' }
  | { type: 'REORDER_FOLDERS'; folderIds: string[]; parentId: string | null }
  | { type: 'REFRESH_METADATA'; itemIds: string[] }
  | { type: 'CHECK_EXISTING_URLS'; urls: string[] }

export type BgResponse =
  | { ok: true; pong: true }
  | { ok: true; tabs: TabSummary[] }
  | { ok: true; tabStatus: TabWithStatus[] }
  | { ok: true; windows: WindowWithTabs[] }
  | { ok: true; stash: StashResult }
  | { ok: true; items: Item[] }
  | { ok: true; updated: true }
  | { ok: true; deleted: true } | { ok: true; deleted: number }
  | { ok: true; opened?: boolean; focused?: boolean }
  | { ok: true; imported: number; updated: number }
  | { ok: true; closed: number }
  | { ok: true; folders: Folder[]; trashFolderId: string }
  | { ok: true; folders: Folder[]; trashFolderId: string; archiveFolderId: string; folderStats: Record<string, number> }
  | { ok: true; folder: Folder }
  | { ok: true; moved: number }
  | { ok: true; tagged: number }
  | { ok: true; folderStats: Record<string, number> }
  | { ok: true; reordered: number }
  | { ok: true; queued: number }
  | { ok: true; existing: Array<{ url: string; folderName: string }> }
  | { ok: false; error: string }

export function sendMessage<T extends BgMessage>(msg: T): Promise<BgResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res: BgResponse) => resolve(res))
  })
}
