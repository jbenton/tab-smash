import React, { useState, useMemo, useEffect } from 'react'
import { Folder as FolderType } from '@/shared/types'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreHorizontal, FolderPlus, Trash2, Archive, Edit, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFolderExpandedStates, setFolderExpandedState } from '@/shared/settings'

interface FolderTreeProps {
  folders: FolderType[]
  selectedFolderId: string | null | 'all' | 'trash' | 'archive' | 'windows'
  selectedFolderIds: string[]
  folderStats: Record<string, number>
  onSelectFolder: (folderId: string | null | 'all' | 'trash' | 'archive' | 'windows') => void
  onFolderClick: (folderId: string, index: number, event?: React.MouseEvent) => void
  onClearFolderSelection: () => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (folderId: string) => void
  onDeleteFolder: (folderId: string) => void
  onChangeColor: (folderId: string) => void
  onDrop?: (folderId: string | null, event: React.DragEvent) => void
  onMoveFolder?: (folderId: string, newParentId: string) => void
  onReorderFolders?: (folderIds: string[], parentId: string | null) => void
  folderExpandedStates: Record<string, boolean>
  onToggleFolderExpanded: (folderId: string, isExpanded: boolean) => void
}

interface FolderNodeProps {
  folder: FolderType
  folders: FolderType[]
  level: number
  index: number
  selectedFolderId: string | null | 'all' | 'trash' | 'archive' | 'windows'
  selectedFolderIds: string[]
  itemCount: number
  folderStats: Record<string, number>
  onSelect: () => void
  onFolderClick: (folderId: string, index: number, event?: React.MouseEvent) => void
  onCreateSubfolder: () => void
  onRename: () => void
  onDelete: () => void
  onChangeColor: () => void
  onDrop?: (event: React.DragEvent) => void
  onSelectFolder: (folderId: string | null | 'all' | 'trash' | 'archive' | 'windows') => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (folderId: string) => void
  onDeleteFolder: (folderId: string) => void
  onChangeColorFolder: (folderId: string) => void
  onDropFolder?: (folderId: string | null, event: React.DragEvent) => void
  onMoveFolder?: (folderId: string, newParentId: string) => void
  onReorderFolders?: (folderIds: string[], parentId: string | null) => void
  folderExpandedStates: Record<string, boolean>
  onToggleFolderExpanded: (folderId: string, isExpanded: boolean) => void
}

function FolderNode({
  folder,
  folders,
  level,
  index,
  selectedFolderId,
  selectedFolderIds,
  itemCount,
  folderStats,
  onSelect,
  onFolderClick,
  onCreateSubfolder,
  onRename,
  onDelete,
  onChangeColor,
  onDrop,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onChangeColorFolder,
  onDropFolder,
  onMoveFolder,
  onReorderFolders,
  folderExpandedStates,
  onToggleFolderExpanded
}: FolderNodeProps) {
  // Use persistent state, defaulting to collapsed (false)
  const isOpen = folderExpandedStates[folder.id] ?? false
  const [isDragOver, setIsDragOver] = useState(false)
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null)
  const children = folders.filter(f => f.parentId === folder.id).sort((a, b) => a.sortOrder - b.sortOrder)
  const hasChildren = children.length > 0
  const isSelected = selectedFolderId === folder.id
  const isMultiSelected = selectedFolderIds.includes(folder.id)

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    console.log('🔵 MULTI-FOLDER DRAG START:', {
      folderId: folder.id,
      isMultiSelected,
      selectedFolderIds,
      selectedFolderIdsLength: selectedFolderIds.length
    })
    // If this folder is part of a multi-selection, drag all selected folders
    if (isMultiSelected && selectedFolderIds.length > 1) {
      console.log('🔵 MULTI-FOLDER: Setting multi-folder data:', selectedFolderIds)
      e.dataTransfer.setData('application/tab-stash-folders', JSON.stringify(selectedFolderIds))
    } else {
      console.log('🔵 MULTI-FOLDER: Setting single folder data:', folder.id)
      e.dataTransfer.setData('application/tab-stash-folder', folder.id)
    }
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Only handle folder dragging for reordering (both single and multi)
    if (e.dataTransfer.types.includes('application/tab-stash-folder') ||
        e.dataTransfer.types.includes('application/tab-stash-folders')) {
      const rect = e.currentTarget.getBoundingClientRect()
      const relativeY = e.clientY - rect.top
      const height = rect.height

      // Divide into three zones: top 25%, middle 50%, bottom 25%
      if (relativeY < height * 0.25) {
        setDropPosition('before')
        setIsDragOver(false)
      } else if (relativeY > height * 0.75) {
        setDropPosition('after')
        setIsDragOver(false)
      } else {
        setDropPosition('inside')
        setIsDragOver(true)
      }
    } else if (e.dataTransfer.types.includes('application/tab-stash-items')) {
      // Items can only be dropped inside folders
      setDropPosition('inside')
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    setDropPosition(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const position = dropPosition
    setIsDragOver(false)
    setDropPosition(null)

    // Check if we're dropping folder(s)
    const draggedFoldersStr = e.dataTransfer.getData('application/tab-stash-folders')
    const draggedFolderId = e.dataTransfer.getData('application/tab-stash-folder')

    console.log('🔵 MULTI-FOLDER DROP:', {
      draggedFoldersStr,
      draggedFolderId,
      position,
      targetFolder: folder.id
    })

    if (draggedFoldersStr || draggedFolderId) {
      // Get list of dragged folder IDs
      const draggedFolderIds = draggedFoldersStr ? JSON.parse(draggedFoldersStr) : [draggedFolderId]
      console.log('🔵 MULTI-FOLDER: Processing folder IDs:', draggedFolderIds)

      // Don't allow dropping a folder onto itself
      if (draggedFolderIds.includes(folder.id)) return

      // Check if target is a descendant of any dragged folder (prevent circular reference)
      for (const folderId of draggedFolderIds) {
        let current = folder
        while (current.parentId) {
          if (current.parentId === folderId) return
          current = folders.find(f => f.id === current.parentId)!
          if (!current) break
        }
      }

      if (position === 'inside') {
        // Make them subfolders
        console.log('🔵 MULTI-FOLDER: Moving folders inside:', draggedFolderIds, 'to parent:', folder.id)
        for (const folderId of draggedFolderIds) {
          onMoveFolder?.(folderId, folder.id)
        }
      } else if (position === 'before' || position === 'after') {
        console.log('🔵 MULTI-FOLDER: Reordering folders:', position, draggedFolderIds)
        // Reorder at the same level
        // Get all siblings (folders with the same parent as this folder)
        const siblings = folders.filter(f => f.parentId === folder.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
        const targetIndex = siblings.findIndex(f => f.id === folder.id)

        if (targetIndex !== -1) {
          // Remove the dragged folders from the list if they're already siblings
          const filteredSiblings = siblings.filter(f => !draggedFolderIds.includes(f.id))

          // Calculate new position
          const insertIndex = position === 'before'
            ? filteredSiblings.findIndex(f => f.id === folder.id)
            : filteredSiblings.findIndex(f => f.id === folder.id) + 1

          // Insert the dragged folders at the new position
          const draggedFolders = draggedFolderIds.map(id => folders.find(f => f.id === id)!).filter(Boolean)
          filteredSiblings.splice(insertIndex, 0, ...draggedFolders)

          // Call the reorder callback
          const newOrder = filteredSiblings.map(f => f.id)
          console.log('🔵 MULTI-FOLDER: Calling onReorderFolders with:', newOrder, 'parentId:', folder.parentId)
          onReorderFolders?.(newOrder, folder.parentId)
        }
      }
    } else {
      // Dropping items onto folder (existing behavior)
      onDrop?.(e)
    }
  }

  return (
    <div className="relative">
      {/* Drop indicator - before */}
      {dropPosition === 'before' && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 pointer-events-none z-50"
          style={{ top: '-1px', marginLeft: level > 0 ? `${level * 8}px` : '0px' }}
        />
      )}

      <div
        draggable
        onDragStart={handleDragStart}
        className={cn(
          'flex items-center gap-2 py-1 rounded cursor-pointer group',
          isSelected && 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40',
          isMultiSelected && 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40',
          !isSelected && !isMultiSelected && 'hover:bg-muted/50',
          isDragOver && 'bg-blue-100 dark:bg-blue-900'
        )}
        style={
          level > 0
            ? { marginLeft: `${level * 8}px`, paddingLeft: '8px', paddingRight: '8px' }
            : { paddingLeft: hasChildren ? '0px' : '8px', paddingRight: '8px' }
        }
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={(e) => {
          console.log('🔵 MULTI-FOLDER CLICK:', {
            folderId: folder.id,
            index,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey
          })
          // Always update multi-select state
          onFolderClick(folder.id, index, e)
          // Also update main selection for non-modifier clicks
          if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
            onSelect()
          }
        }}
      >
        {/* Chevron for expandable folders - positioned in left margin */}
        {hasChildren ? (
          <button
            className="p-0 hover:bg-muted rounded flex-shrink-0"
            style={{ marginLeft: '-.5rem', marginRight: '-.25rem' }}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFolderExpanded(folder.id, !isOpen)
            }}
          >
            {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        ) : level > 0 ? (
          <span className="w-3 flex-shrink-0" style={{ marginLeft: '-.5rem', marginRight: '-.25rem' }} />
        ) : null}

        {/* Folder icon */}
        <div className="flex-shrink-0">
          {isSelected ? (
            <FolderOpen className="size-4" />
          ) : (
            <Folder className="size-4" />
          )}
        </div>

        {/* Folder name - takes up available space */}
        <span className="text-sm truncate flex-1">{folder.name}</span>

        {/* Folder actions menu - shows color dot by default, menu icon on hover */}
        <div className="relative size-6 flex items-center justify-center flex-shrink-0">
          {/* Color dot - hidden on hover if folder has color */}
          {folder.color && (
            <span
              className="size-2 rounded-full absolute group-hover:opacity-0 transition-opacity pointer-events-none"
              style={{ backgroundColor: folder.color }}
            />
          )}
          {/* Menu button - shows on hover */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-background border shadow-lg z-[2000]">
              <DropdownMenuItem onClick={onCreateSubfolder}>
                <FolderPlus className="size-4 mr-2" />
                New subfolder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>
                <Edit className="size-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onChangeColor}>
                <Palette className="size-4 mr-2" />
                Change color
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete}>
                <Trash2 className="size-4 mr-2" />
                Move to Trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Item count - right side, with tabular-nums for alignment */}
        <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums min-w-[2ch] text-right">{itemCount}</span>
      </div>

      {/* Drop indicator - after */}
      {dropPosition === 'after' && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 pointer-events-none z-50"
          style={{ bottom: hasChildren && isOpen ? 'auto' : '-1px', top: hasChildren && isOpen ? 'auto' : 'calc(100% - 1px)', marginLeft: level > 0 ? `${level * 8}px` : '0px' }}
        />
      )}

      {hasChildren && isOpen && (
        <div>
          {children.map((child, childIndex) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              level={level + 1}
              index={childIndex}
              selectedFolderId={selectedFolderId}
              selectedFolderIds={selectedFolderIds}
              itemCount={folderStats[child.id] || 0}
              folderStats={folderStats}
              onSelect={() => onSelectFolder(child.id)}
              onFolderClick={onFolderClick}
              onCreateSubfolder={() => onCreateFolder(child.id)}
              onRename={() => onRenameFolder(child.id)}
              onDelete={() => onDeleteFolder(child.id)}
              onChangeColor={() => onChangeColorFolder(child.id)}
              onDrop={(e) => onDropFolder?.(child.id, e)}
              onSelectFolder={onSelectFolder}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onChangeColorFolder={onChangeColorFolder}
              onDropFolder={onDropFolder}
              onMoveFolder={onMoveFolder}
              onReorderFolders={onReorderFolders}
              folderExpandedStates={folderExpandedStates}
              onToggleFolderExpanded={onToggleFolderExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree({
  folders,
  selectedFolderId,
  selectedFolderIds,
  folderStats,
  onSelectFolder,
  onFolderClick,
  onClearFolderSelection,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onChangeColor,
  onDrop,
  onMoveFolder,
  onReorderFolders,
  folderExpandedStates,
  onToggleFolderExpanded
}: FolderTreeProps) {
  const [isDragOverUnfiled, setIsDragOverUnfiled] = useState(false)
  const [isDragOverTrash, setIsDragOverTrash] = useState(false)
  const [isDragOverArchive, setIsDragOverArchive] = useState(false)
  // Use persistent state for trash folder expansion, defaulting to collapsed
  const isTrashOpen = folderExpandedStates['__trash__'] ?? false

  // Build folder hierarchy
  const folderTree = useMemo(() => {
    const folderMap = new Map(folders.map(f => [f.id, { ...f, children: [] as FolderType[] }]))
    const rootFolders: FolderType[] = []

    folders.forEach(folder => {
      const node = folderMap.get(folder.id)!
      if (folder.parentId === null) {
        rootFolders.push(node)
      } else {
        const parent = folderMap.get(folder.parentId)
        if (parent) {
          parent.children.push(node)
        }
      }
    })

    return rootFolders.sort((a, b) => a.sortOrder - b.sortOrder)
  }, [folders])

  const unfiledCount = folderStats['__unfiled__'] || 0
  // Exclude trash and archive from total count
  const totalCount = Object.entries(folderStats)
    .filter(([key]) => key !== '__trash__' && key !== '__archive__')
    .reduce((sum, [, count]) => sum + count, 0)

  // Get trash children (folders with parentId = '__trash__')
  const trashChildren = folders.filter(f => f.parentId === '__trash__').sort((a, b) => a.sortOrder - b.sortOrder)

  // Get archive children (folders with parentId = '__archive__')
  const archiveChildren = folders.filter(f => f.parentId === '__archive__').sort((a, b) => a.sortOrder - b.sortOrder)
  const isArchiveOpen = folderExpandedStates['__archive__'] ?? false

  const renderFolder = (folder: FolderType, level: number, index: number): React.ReactNode => {
    const itemCount = folderStats[folder.id] || 0

    return (
      <FolderNode
        key={folder.id}
        folder={folder}
        folders={folders}
        level={level}
        index={index}
        selectedFolderId={selectedFolderId}
        selectedFolderIds={selectedFolderIds}
        itemCount={itemCount}
        folderStats={folderStats}
        onSelect={() => onSelectFolder(folder.id)}
        onFolderClick={onFolderClick}
        onCreateSubfolder={() => onCreateFolder(folder.id)}
        onRename={() => onRenameFolder(folder.id)}
        onDelete={() => onDeleteFolder(folder.id)}
        onChangeColor={() => onChangeColor(folder.id)}
        onDrop={(e) => onDrop?.(folder.id, e)}
        onSelectFolder={onSelectFolder}
        onCreateFolder={onCreateFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onChangeColorFolder={onChangeColor}
        onDropFolder={onDrop}
        onMoveFolder={onMoveFolder}
        onReorderFolders={onReorderFolders}
        folderExpandedStates={folderExpandedStates}
        onToggleFolderExpanded={onToggleFolderExpanded}
      />
    )
  }

  return (
    <div className="space-y-1">
      {/* Open Windows */}
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded cursor-pointer',
          selectedFolderId === 'windows' ? 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40' : 'hover:bg-muted/50'
        )}
        onClick={() => {
          onSelectFolder('windows')
          // Clear multi-select state since this is a special view
          onClearFolderSelection()
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 flex-shrink-0">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="M3 9h18"/>
        </svg>
        <span className="text-sm flex-1">Open Windows</span>
      </div>

      {/* Divider after Open Windows */}
      <div className="h-2" />

      {/* All Tabs */}
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded cursor-pointer',
          selectedFolderId === 'all' ? 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40' : 'hover:bg-muted/50'
        )}
        onClick={() => {
          onSelectFolder('all')
          // Clear multi-select state since this is a special view
          onClearFolderSelection()
        }}
      >
        <Folder className="size-4 flex-shrink-0" />
        <span className="text-sm flex-1">All Tabs</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">{totalCount}</span>
      </div>

      {/* Unfiled Items */}
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded cursor-pointer',
          selectedFolderId === null ? 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40' : 'hover:bg-muted/50',
          isDragOverUnfiled && 'bg-blue-100 dark:bg-blue-900'
        )}
        onClick={() => {
          onSelectFolder(null)
          // Clear multi-select state since this is a special view
          onClearFolderSelection()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOverUnfiled(true)
        }}
        onDragLeave={() => setIsDragOverUnfiled(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOverUnfiled(false)
          onDrop?.(null, e)
        }}
      >
        <Folder className="size-4 flex-shrink-0" />
        <span className="text-sm flex-1">Unfiled</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">{unfiledCount}</span>
      </div>

      {/* Trash */}
      <div>
        <div
          className={cn(
            'flex items-center gap-2 py-1 rounded cursor-pointer group',
            selectedFolderId === 'trash' ? 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40' : 'hover:bg-muted/50',
            isDragOverTrash && 'bg-blue-100 dark:bg-blue-900'
          )}
          style={{ paddingLeft: trashChildren.length > 0 ? '0px' : '8px', paddingRight: '8px' }}
          onDragOver={(e) => {
            // Accept both folders (single and multi) and items
            if (e.dataTransfer.types.includes('application/tab-stash-folder') ||
                e.dataTransfer.types.includes('application/tab-stash-folders') ||
                e.dataTransfer.types.includes('application/tab-stash-items')) {
              e.preventDefault()
              setIsDragOverTrash(true)
            }
          }}
          onDragLeave={() => setIsDragOverTrash(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setIsDragOverTrash(false)

            // Check if dropping folder(s)
            const draggedFoldersStr = e.dataTransfer.getData('application/tab-stash-folders')
            const draggedFolderId = e.dataTransfer.getData('application/tab-stash-folder')

            if (draggedFoldersStr || draggedFolderId) {
              // Get list of dragged folder IDs
              const draggedFolderIds = draggedFoldersStr ? JSON.parse(draggedFoldersStr) : [draggedFolderId]

              // Move all folders to Trash
              for (const folderId of draggedFolderIds) {
                onMoveFolder?.(folderId, '__trash__')
              }
            } else {
              // Dropping items into trash (existing behavior)
              onDrop?.('trash', e)
            }
          }}
          onClick={() => {
            onSelectFolder('trash')
            // Clear multi-select state since this is a special view
            onClearFolderSelection()
          }}
        >
          {/* Chevron for expandable trash */}
          {trashChildren.length > 0 ? (
            <button
              className="p-0 hover:bg-muted rounded flex-shrink-0"
              style={{ marginLeft: '-.5rem', marginRight: '-.25rem' }}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFolderExpanded('__trash__', !isTrashOpen)
              }}
            >
              {isTrashOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
          ) : null}

          <Trash2 className="size-4 flex-shrink-0" />
          <span className="text-sm flex-1">Trash</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{folderStats['__trash__'] || 0}</span>
        </div>

        {/* Trash children */}
        {trashChildren.length > 0 && isTrashOpen && (
          <div>
            {trashChildren.map((child, index) => (
              <FolderNode
                key={child.id}
                folder={child}
                folders={folders}
                level={1}
                index={index}
                selectedFolderId={selectedFolderId}
                selectedFolderIds={selectedFolderIds}
                itemCount={folderStats[child.id] || 0}
                folderStats={folderStats}
                onSelect={() => onSelectFolder(child.id)}
                onFolderClick={onFolderClick}
                onCreateSubfolder={() => onCreateFolder(child.id)}
                onRename={() => onRenameFolder(child.id)}
                onDelete={() => onDeleteFolder(child.id)}
                onChangeColor={() => onChangeColor(child.id)}
                onDrop={(e) => onDrop?.(child.id, e)}
                onSelectFolder={onSelectFolder}
                onCreateFolder={onCreateFolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onChangeColorFolder={onChangeColor}
                onDropFolder={onDrop}
                onMoveFolder={onMoveFolder}
                onReorderFolders={onReorderFolders}
                folderExpandedStates={folderExpandedStates}
                onToggleFolderExpanded={onToggleFolderExpanded}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Folder button */}
      <div className="pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => onCreateFolder(null)}
        >
          <FolderPlus className="size-4 mr-2" />
          New Folder
        </Button>
      </div>

      {/* Folder tree */}
      <div className="pt-2">
        {folderTree.map((folder, index) => renderFolder(folder, 0, index))}
      </div>

      {/* Archive */}
      <div className="pt-4 mt-4 border-t border-border">
        <div
          className={cn(
            'flex items-center gap-2 py-1 rounded cursor-pointer group',
            selectedFolderId === 'archive' ? 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40' : 'hover:bg-muted/50',
            isDragOverArchive && 'bg-blue-100 dark:bg-blue-900'
          )}
          style={{ paddingLeft: archiveChildren.length > 0 ? '0px' : '8px', paddingRight: '8px' }}
          onDragOver={(e) => {
            // Accept both folders (single and multi) and items
            if (e.dataTransfer.types.includes('application/tab-stash-folder') ||
                e.dataTransfer.types.includes('application/tab-stash-folders') ||
                e.dataTransfer.types.includes('application/tab-stash-items')) {
              e.preventDefault()
              setIsDragOverArchive(true)
            }
          }}
          onDragLeave={() => setIsDragOverArchive(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setIsDragOverArchive(false)

            // Check if dropping folder(s)
            const draggedFoldersStr = e.dataTransfer.getData('application/tab-stash-folders')
            const draggedFolderId = e.dataTransfer.getData('application/tab-stash-folder')

            if (draggedFoldersStr || draggedFolderId) {
              // Get list of dragged folder IDs
              const draggedFolderIds = draggedFoldersStr ? JSON.parse(draggedFoldersStr) : [draggedFolderId]

              // Move all folders to Archive
              for (const folderId of draggedFolderIds) {
                onMoveFolder?.(folderId, '__archive__')
              }
            } else {
              // Dropping items into archive
              onDrop?.('archive', e)
            }
          }}
          onClick={() => {
            onSelectFolder('archive')
            onClearFolderSelection()
          }}
        >
          {/* Chevron for expandable archive */}
          {archiveChildren.length > 0 ? (
            <button
              className="p-0 hover:bg-muted rounded flex-shrink-0"
              style={{ marginLeft: '-.5rem', marginRight: '-.25rem' }}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFolderExpanded('__archive__', !isArchiveOpen)
              }}
            >
              {isArchiveOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
          ) : null}

          <Archive className="size-4 flex-shrink-0" />
          <span className="text-sm flex-1">Archive</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{folderStats['__archive__'] || 0}</span>
        </div>

        {/* Archive children */}
        {archiveChildren.length > 0 && isArchiveOpen && (
          <div>
            {archiveChildren.map((child, index) => (
              <FolderNode
                key={child.id}
                folder={child}
                folders={folders}
                level={1}
                index={index}
                selectedFolderId={selectedFolderId}
                selectedFolderIds={selectedFolderIds}
                itemCount={folderStats[child.id] || 0}
                folderStats={folderStats}
                onSelect={() => onSelectFolder(child.id)}
                onFolderClick={onFolderClick}
                onCreateSubfolder={() => onCreateFolder(child.id)}
                onRename={() => onRenameFolder(child.id)}
                onDelete={() => onDeleteFolder(child.id)}
                onChangeColor={() => onChangeColor(child.id)}
                onDrop={(e) => onDrop?.(child.id, e)}
                onSelectFolder={onSelectFolder}
                onCreateFolder={onCreateFolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onChangeColorFolder={onChangeColor}
                onDropFolder={onDrop}
                onMoveFolder={onMoveFolder}
                onReorderFolders={onReorderFolders}
                folderExpandedStates={folderExpandedStates}
                onToggleFolderExpanded={onToggleFolderExpanded}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
