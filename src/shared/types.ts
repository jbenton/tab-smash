export interface Item {
  id: string
  url: string
  urlHash: string
  title?: string
  favicon?: string
  createdAt: number
  lastSeenAt: number
  timesAdded: number
  notes?: string
  tags?: string[]
  folderId: string | null  // null = unfiled
  sortOrder: number        // for manual ordering within folder
}

export interface Folder {
  id: string
  name: string
  parentId: string | null  // null = root level
  color?: string          // hex color for visual distinction
  sortOrder: number       // for manual ordering of folders
  createdAt: number
}

export interface StashResult {
  added: number
  updated: number
  closed?: number
}

export interface TabSummary {
  id: number
  url: string
  title?: string
  favIconUrl?: string
  pinned?: boolean
  groupId?: number
}

export interface TabWithStatus extends TabSummary {
  urlHash: string
  stashed: boolean
  itemId?: string
  stashable: boolean
}

export interface WindowWithTabs {
  windowId: number
  tabs: TabSummary[]
  focused: boolean
}
