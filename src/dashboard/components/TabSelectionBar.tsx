import React from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChevronDown, FolderInput, X, Maximize2, Minimize2, Trash2 } from 'lucide-react'
import type { Folder } from '@/shared/types'
import { cn } from '@/lib/utils'
import { FolderMenuWithDisclosure } from './FolderMenuWithDisclosure'

export function TabSelectionBar({
  count,
  onStash,
  onClear,
  folders,
  onCreateNewFolder,
  onCloseInChrome,
  onExpandAll,
  onCollapseAll,
  browserName = 'Chrome',
  folderExpandedStates,
  onToggleFolderExpanded,
}: {
  count: number
  onStash: (folderId: string | null, closeAfter: boolean) => void | Promise<void>
  onClear: () => void
  folders: Folder[]
  onCreateNewFolder: (closeAfter: boolean) => void
  onCloseInChrome?: () => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  browserName?: string
  folderExpandedStates: Record<string, boolean>
  onToggleFolderExpanded: (folderId: string, isExpanded: boolean) => void
}) {
  const [moveDropdownOpen, setMoveDropdownOpen] = React.useState(false)
  const [closeAfterStash, setCloseAfterStash] = React.useState(true)
  // Local folder state that initializes from sidebar but doesn't sync back
  const [localFolderStates, setLocalFolderStates] = React.useState<Record<string, boolean>>({})

  // Initialize local state when dropdown opens
  React.useEffect(() => {
    if (moveDropdownOpen) {
      setLocalFolderStates({ ...folderExpandedStates })
    }
  }, [moveDropdownOpen, folderExpandedStates])

  const hasSelection = count > 0

  return (
    <div className={cn(
      "sticky top-0 z-10 flex items-center justify-between p-3 border-b",
      hasSelection
        ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900"
        : "bg-muted border-border"
    )}>
      <div className="flex items-center gap-3">
        <span className={cn(
          "text-sm font-medium",
          hasSelection
            ? "text-blue-900 dark:text-blue-100"
            : "text-muted-foreground"
        )}>
          {count} {count === 1 ? 'tab' : 'tabs'} selected
        </span>
        <div className="flex items-center gap-3">
          {/* Stash in Folder */}
          <DropdownMenu open={moveDropdownOpen} onOpenChange={setMoveDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasSelection}
                className="h-8 text-xs bg-background"
              >
                <FolderInput className="mr-1 size-3" />
                Stash in Folder
                <ChevronDown className="ml-1 size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[600px] min-w-[280px] overflow-y-auto bg-background border shadow-lg z-[2000]"
            >
              <DropdownMenuItem
                onClick={() => {
                  setMoveDropdownOpen(false)
                  onCreateNewFolder(closeAfterStash)
                }}
                className="font-medium"
              >
                <FolderInput className="mr-2 size-4" />
                Create New Folder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onStash(null, closeAfterStash)
                  setMoveDropdownOpen(false)
                }}
                className="border-t mt-1 pt-2"
              >
                Unfiled
              </DropdownMenuItem>
              <FolderMenuWithDisclosure
                folders={folders}
                folderExpandedStates={localFolderStates}
                onToggleFolderExpanded={(folderId, isExpanded) => {
                  setLocalFolderStates(prev => ({ ...prev, [folderId]: isExpanded }))
                }}
                onFolderClick={(folderId) => {
                  onStash(folderId, closeAfterStash)
                  setMoveDropdownOpen(false)
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Just Stash (to Unfiled) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onStash(null, closeAfterStash)}
            disabled={!hasSelection}
            className="h-8 text-xs bg-background"
          >
            Just Stash
          </Button>

          {/* Close in Browser */}
          {onCloseInChrome && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCloseInChrome}
              disabled={!hasSelection}
              className="h-8 text-xs bg-background"
            >
              <Trash2 className="mr-1 size-3" />
              Close in {browserName}
            </Button>
          )}

          {/* Expand All / Collapse All */}
          {(onExpandAll || onCollapseAll) && (
            <>
              {onExpandAll && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExpandAll}
                  className="h-8 text-xs bg-background"
                >
                  <Maximize2 className="mr-1 size-3" />
                  Expand All
                </Button>
              )}
              {onCollapseAll && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCollapseAll}
                  className="h-8 text-xs bg-background"
                >
                  <Minimize2 className="mr-1 size-3" />
                  Collapse All
                </Button>
              )}
            </>
          )}

          {/* Close After Stash Switch */}
          <div className="flex items-center gap-2 pl-3 border-l border-border/60">
            <Label
              htmlFor="close-after-stash"
              className={cn(
                "text-xs cursor-pointer",
                hasSelection ? "" : "text-muted-foreground"
              )}
            >
              Close after stash?
            </Label>
            <Switch
              id="close-after-stash"
              checked={closeAfterStash}
              onCheckedChange={setCloseAfterStash}
              disabled={!hasSelection}
            />
          </div>
        </div>
      </div>

      {hasSelection && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className={cn(
            "h-8 px-2",
            hasSelection
              ? "text-blue-900 dark:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-900"
              : "text-muted-foreground"
          )}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  )
}
