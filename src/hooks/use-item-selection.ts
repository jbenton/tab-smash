import { useState, useCallback } from 'react'
import type { Item } from '@/shared/types'

export interface UseItemSelectionOptions {
  items: Item[]
}

export function useItemSelection({ items }: UseItemSelectionOptions) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)

  const handleItemClick = useCallback(
    (itemId: string, index: number, event: React.MouseEvent) => {
      if (event.shiftKey && lastClickedIndex !== null) {
        // Range selection: select all items from lastClickedIndex to index
        const start = Math.min(lastClickedIndex, index)
        const end = Math.max(lastClickedIndex, index)
        const rangeIds = items.slice(start, end + 1).map(item => item.id)

        setSelected(prev => {
          const next = { ...prev }
          rangeIds.forEach(id => {
            next[id] = true
          })
          return next
        })
      } else if (event.ctrlKey || event.metaKey) {
        // Toggle single item (Ctrl/Cmd + click)
        setSelected(prev => ({ ...prev, [itemId]: !prev[itemId] }))
      } else {
        // Single select (replace selection)
        setSelected({ [itemId]: true })
      }

      setLastClickedIndex(index)
    },
    [items, lastClickedIndex]
  )

  const selectAll = useCallback(() => {
    const all: Record<string, boolean> = {}
    items.forEach(item => {
      all[item.id] = true
    })
    setSelected(all)
  }, [items])

  const clearSelection = useCallback(() => {
    setSelected({})
    setLastClickedIndex(null)
  }, [])

  const toggleItem = useCallback((itemId: string) => {
    setSelected(prev => ({ ...prev, [itemId]: !prev[itemId] }))
  }, [])

  const selectRange = useCallback((startIndex: number, endIndex: number) => {
    const start = Math.min(startIndex, endIndex)
    const end = Math.max(startIndex, endIndex)
    const rangeIds = items.slice(start, end + 1).map(item => item.id)

    setSelected(prev => {
      const next = { ...prev }
      rangeIds.forEach(id => {
        next[id] = true
      })
      return next
    })
  }, [items])

  const selectedIds = Object.entries(selected)
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => id)

  const selectedItems = items.filter(item => selected[item.id])

  const isAllSelected = items.length > 0 && items.every(item => selected[item.id])
  const isSomeSelected = selectedIds.length > 0 && !isAllSelected

  return {
    selected,
    selectedIds,
    selectedItems,
    isAllSelected,
    isSomeSelected,
    handleItemClick,
    selectAll,
    clearSelection,
    toggleItem,
    selectRange,
    setSelected
  }
}
