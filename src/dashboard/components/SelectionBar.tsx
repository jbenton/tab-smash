import React from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu'
import { FolderInput, Tag, FolderPlus, TagsIcon, ChevronDown, RefreshCw, Edit, Filter, X } from 'lucide-react'
import type { Folder } from '@/shared/types'
import { Badge } from '@/components/ui/badge'
import { FolderMenuWithDisclosure } from './FolderMenuWithDisclosure'

export function SelectionBar({
  count,
  onRestore,
  onRestoreNewWindow,
  onTrash,
  onClear,
  trashCount,
  onMoveToFolder,
  onBulkTag,
  onBulkRemoveTags,
  onRefreshMetadata,
  onEditTitle,
  folders,
  onCreateNewFolder,
  availableTagsInSelection,
  uniqueTags,
  selectedTags,
  onToggleTag,
  folderExpandedStates,
  onToggleFolderExpanded,
}: {
  count: number
  onRestore: () => void | Promise<void>
  onRestoreNewWindow: () => void | Promise<void>
  onTrash: () => void | Promise<void>
  onClear: () => void
  trashCount: number
  onMoveToFolder: (folderId: string | null) => void | Promise<void>
  onBulkTag: () => void
  onBulkRemoveTags: () => void
  onRefreshMetadata: () => void | Promise<void>
  onEditTitle: () => void
  folders: Folder[]
  onCreateNewFolder: () => void
  availableTagsInSelection: string[]
  folderExpandedStates: Record<string, boolean>
  onToggleFolderExpanded: (folderId: string, isExpanded: boolean) => void
}) {
  const [moveDropdownOpen, setMoveDropdownOpen] = React.useState(false)
  // Local folder state that initializes from sidebar but doesn't sync back
  const [localFolderStates, setLocalFolderStates] = React.useState<Record<string, boolean>>({})

  // Initialize local state when dropdown opens
  React.useEffect(() => {
    if (moveDropdownOpen) {
      setLocalFolderStates({ ...folderExpandedStates })
    }
  }, [moveDropdownOpen, folderExpandedStates])

  return (
    <div className="flex gap-2 items-center flex-wrap mt-2 p-3 bg-muted/50 rounded-lg">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="h-4 w-px bg-border" />

      {/* Move to Folder */}
      <DropdownMenu open={moveDropdownOpen} onOpenChange={setMoveDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary">
            <FolderInput className="size-4 mr-2" />
            Move to Folder
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-[600px] min-w-[280px] overflow-y-auto bg-background border shadow-lg z-[2000]"
          onEscapeKeyDown={() => setMoveDropdownOpen(false)}
          onPointerDownOutside={() => setMoveDropdownOpen(false)}
        >
          <DropdownMenuItem onClick={() => {
            setMoveDropdownOpen(false)
            onCreateNewFolder()
          }}>
            <FolderPlus className="size-4 mr-2" />
            New folder...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={async () => {
            setMoveDropdownOpen(false)
            await onMoveToFolder(null)
          }}>
            Unfiled
          </DropdownMenuItem>
          <FolderMenuWithDisclosure
            folders={folders}
            folderExpandedStates={localFolderStates}
            onToggleFolderExpanded={(folderId, isExpanded) => {
              setLocalFolderStates(prev => ({ ...prev, [folderId]: isExpanded }))
            }}
            onFolderClick={async (folderId) => {
              setMoveDropdownOpen(false)
              await onMoveToFolder(folderId)
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Bulk Tag */}
      <Button size="sm" variant="secondary" onClick={onBulkTag}>
        <Tag className="size-4 mr-2" />
        Add Tags
      </Button>

      {/* Bulk Remove Tags - only show if selection has tags */}
      {availableTagsInSelection.length > 0 && (
        <Button size="sm" variant="secondary" onClick={onBulkRemoveTags}>
          <TagsIcon className="size-4 mr-2" />
          Remove Tags
        </Button>
      )}

      {/* Edit dropdown menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary">
            <Edit className="size-4 mr-2" />
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-background border shadow-lg z-[2000]">
          <DropdownMenuItem onClick={onRefreshMetadata}>
            <RefreshCw className="size-4 mr-2" />
            Refresh Metadata
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEditTitle}>
            <Edit className="size-4 mr-2" />
            Edit Title
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>


      {/* Actions */}
      <Button size="sm" variant="secondary" onClick={onTrash} disabled={!trashCount}>
        Move to Trash ({trashCount})
      </Button>

      {/* Open button with dropdown */}
      <div className="flex">
        <Button size="sm" variant="secondary" onClick={onRestore} className="rounded-r-none border-r-0">
          Open ({count})
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="rounded-l-none px-2">
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-background border shadow-lg z-[2000]">
            <DropdownMenuItem onClick={onRestoreNewWindow}>
              Open in New Window
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear Selection
        </Button>
      </div>
    </div>
  )
}
