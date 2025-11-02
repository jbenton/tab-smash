import React from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { Folder } from '@/shared/types'

interface FolderMenuWithDisclosureProps {
  folders: Folder[]
  folderExpandedStates: Record<string, boolean>
  onToggleFolderExpanded: (folderId: string, isExpanded: boolean) => void
  onFolderClick: (folderId: string) => void
  level?: number
}

export function FolderMenuWithDisclosure({
  folders,
  folderExpandedStates,
  onToggleFolderExpanded,
  onFolderClick,
  level = 0
}: FolderMenuWithDisclosureProps) {
  const renderFolder = (folder: Folder, currentLevel: number): React.ReactNode[] => {
    const children = folders.filter(f => f.parentId === folder.id).sort((a, b) => a.sortOrder - b.sortOrder)
    const hasChildren = children.length > 0
    const isExpanded = folderExpandedStates[folder.id] ?? false
    const indent = currentLevel * 16 // 16px per level

    const result: React.ReactNode[] = [
      <DropdownMenuItem
        key={folder.id}
        onSelect={(e) => {
          // Prevent menu from closing
          e.preventDefault()
        }}
        className="flex items-center gap-2 cursor-pointer"
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {hasChildren ? (
          <button
            className="p-0 hover:bg-muted rounded flex-shrink-0 -ml-1"
            onClick={(e) => {
              e.stopPropagation()
              onToggleFolderExpanded(folder.id, !isExpanded)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <span
          className="flex items-center gap-2 flex-1"
          onClick={() => onFolderClick(folder.id)}
        >
          {folder.color && (
            <span
              className="size-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: folder.color }}
            />
          )}
          <span className="truncate">{folder.name}</span>
        </span>
      </DropdownMenuItem>
    ]

    // Recursively add children if expanded
    if (hasChildren && isExpanded) {
      children.forEach(child => {
        result.push(...renderFolder(child, currentLevel + 1))
      })
    }

    return result
  }

  const rootFolders = folders.filter(f => f.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <>
      {rootFolders.flatMap(folder => renderFolder(folder, level))}
    </>
  )
}
