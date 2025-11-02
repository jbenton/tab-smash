import { useState, useCallback } from 'react'
import type { TabSummary } from '@/shared/types'

export interface UseTabSelectionOptions {
  tabs: TabSummary[]
}

export function useTabSelection({ tabs }: UseTabSelectionOptions) {
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)

  const handleTabClick = useCallback(
    (tabId: number, index: number, event: React.MouseEvent) => {
      if (event.shiftKey && lastClickedIndex !== null) {
        // Range selection: select all tabs from lastClickedIndex to index
        const start = Math.min(lastClickedIndex, index)
        const end = Math.max(lastClickedIndex, index)
        const rangeIds = tabs.slice(start, end + 1).map(tab => tab.id)

        setSelected(prev => {
          const next = { ...prev }
          rangeIds.forEach(id => {
            next[id] = true
          })
          return next
        })
      } else if (event.ctrlKey || event.metaKey) {
        // Toggle single tab (Ctrl/Cmd + click)
        setSelected(prev => ({ ...prev, [tabId]: !prev[tabId] }))
      } else {
        // Normal click: toggle individual tab (don't replace selection)
        setSelected(prev => ({ ...prev, [tabId]: !prev[tabId] }))
      }

      setLastClickedIndex(index)
    },
    [tabs, lastClickedIndex]
  )

  const selectAll = useCallback(() => {
    const all: Record<number, boolean> = {}
    tabs.forEach(tab => {
      all[tab.id] = true
    })
    setSelected(all)
  }, [tabs])

  const clearSelection = useCallback(() => {
    setSelected({})
    setLastClickedIndex(null)
  }, [])

  const toggleTab = useCallback((tabId: number) => {
    setSelected(prev => ({ ...prev, [tabId]: !prev[tabId] }))
  }, [])

  const selectRange = useCallback((startIndex: number, endIndex: number) => {
    const start = Math.min(startIndex, endIndex)
    const end = Math.max(startIndex, endIndex)
    const rangeIds = tabs.slice(start, end + 1).map(tab => tab.id)

    setSelected(prev => {
      const next = { ...prev }
      rangeIds.forEach(id => {
        next[id] = true
      })
      return next
    })
  }, [tabs])

  const selectedIds = Object.entries(selected)
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => Number(id))

  const selectedTabs = tabs.filter(tab => selected[tab.id])

  const isAllSelected = tabs.length > 0 && tabs.every(tab => selected[tab.id])
  const isSomeSelected = selectedIds.length > 0 && !isAllSelected

  return {
    selected,
    selectedIds,
    selectedTabs,
    isAllSelected,
    isSomeSelected,
    handleTabClick,
    selectAll,
    clearSelection,
    toggleTab,
    selectRange,
    setSelected
  }
}
