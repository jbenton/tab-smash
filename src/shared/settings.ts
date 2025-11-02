export interface Settings {
  staleDays: number
  closeAfterStash: boolean
  closePinned: boolean
  stripAllParams: boolean
  stripTrackingParams: boolean
}

export const defaultSettings: Settings = {
  staleDays: 30,
  closeAfterStash: true,
  closePinned: false,
  stripAllParams: false,
  stripTrackingParams: true
}

export async function getSettings(): Promise<Settings> {
  const obj = await chrome.storage.local.get(defaultSettings)
  return { ...defaultSettings, ...obj }
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch)
}

// Folder expansion state persistence
const FOLDER_STATES_KEY = 'folderExpandedStates'

export async function getFolderExpandedStates(): Promise<Record<string, boolean>> {
  const result = await chrome.storage.local.get(FOLDER_STATES_KEY)
  return result[FOLDER_STATES_KEY] || {}
}

export async function setFolderExpandedState(folderId: string, isExpanded: boolean): Promise<void> {
  const states = await getFolderExpandedStates()
  states[folderId] = isExpanded
  await chrome.storage.local.set({ [FOLDER_STATES_KEY]: states })
}

// Window expansion state persistence
const WINDOW_STATES_KEY = 'windowExpandedStates'

export async function getWindowExpandedStates(): Promise<Record<number, boolean>> {
  const result = await chrome.storage.local.get(WINDOW_STATES_KEY)
  return result[WINDOW_STATES_KEY] || {}
}

export async function setWindowExpandedState(windowId: number, isExpanded: boolean): Promise<void> {
  const states = await getWindowExpandedStates()
  states[windowId] = isExpanded
  await chrome.storage.local.set({ [WINDOW_STATES_KEY]: states })
}
