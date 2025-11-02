import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ChevronDown, FolderPlus } from 'lucide-react'
import type { Folder } from '@/shared/types'
import { cn } from '@/lib/utils'
import { FolderMenuWithDisclosure } from './FolderMenuWithDisclosure'

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

interface DuplicateInfo {
  url: string
  existsIn: string // folder name or "Unfiled"
}

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (options: {
    importDuplicates: boolean
    destinationFolderId: string | null
    createNewFolder?: string
    useCsvFolders?: boolean
  }) => void
  totalUrls: number
  duplicates: DuplicateInfo[]
  folders: Folder[]
  fileType: 'txt' | 'md' | 'csv' | 'json'
  folderExpandedStates: Record<string, boolean>
  onToggleFolderExpanded: (folderId: string, isExpanded: boolean) => void
}

export function ImportDialog({
  open,
  onOpenChange,
  onConfirm,
  totalUrls,
  duplicates,
  folders,
  fileType,
  folderExpandedStates,
  onToggleFolderExpanded
}: ImportDialogProps) {
  const [importDuplicates, setImportDuplicates] = React.useState(false)
  const [destinationFolder, setDestinationFolder] = React.useState<string>('unfiled')
  const [destinationFolderName, setDestinationFolderName] = React.useState<string>('Unfiled')
  const [newFolderName, setNewFolderName] = React.useState('')
  const [useCsvFolders, setUseCsvFolders] = React.useState(true)
  const [folderDropdownOpen, setFolderDropdownOpen] = React.useState(false)
  // Local folder state that initializes from sidebar but doesn't sync back
  const [localFolderStates, setLocalFolderStates] = React.useState<Record<string, boolean>>({})

  // Initialize local state when dropdown opens
  React.useEffect(() => {
    if (folderDropdownOpen) {
      setLocalFolderStates({ ...folderExpandedStates })
    }
  }, [folderDropdownOpen, folderExpandedStates])

  const newUrls = totalUrls - duplicates.length
  const hasDuplicates = duplicates.length > 0

  // Build flat folder list with hierarchy for display
  const flatFolders = React.useMemo(() => {
    function flattenFolders(parentId: string | null = null, depth: number = 0): Array<{ folder: Folder; depth: number }> {
      const children = folders.filter(f => f.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)
      const result: Array<{ folder: Folder; depth: number }> = []
      for (const child of children) {
        result.push({ folder: child, depth })
        result.push(...flattenFolders(child.id, depth + 1))
      }
      return result
    }
    return flattenFolders(null, 0)
  }, [folders])

  // Group duplicates by folder for display
  const duplicatesByFolder = React.useMemo(() => {
    const groups = new Map<string, number>()
    for (const dup of duplicates) {
      groups.set(dup.existsIn, (groups.get(dup.existsIn) || 0) + 1)
    }
    return Array.from(groups.entries()).sort((a, b) => b[1] - a[1])
  }, [duplicates])

  const handleConfirm = () => {
    let folderId: string | null = null
    let createFolder: string | undefined

    if (destinationFolder === 'unfiled') {
      folderId = null
    } else if (destinationFolder === 'new') {
      if (!newFolderName.trim()) return
      createFolder = newFolderName.trim()
      folderId = null // Will be set after folder creation
    } else {
      folderId = destinationFolder
    }

    onConfirm({
      importDuplicates,
      destinationFolderId: folderId,
      createNewFolder: createFolder,
      useCsvFolders: fileType === 'csv' ? useCsvFolders : undefined
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import {totalUrls} {pluralize(totalUrls, 'tab', 'tabs')}</DialogTitle>
          <DialogDescription>
            Choose where to import these tabs and how to handle duplicates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Duplicate detection */}
          {hasDuplicates && (
            <div className="rounded-md border p-3 bg-muted/50">
              <p className="text-sm font-medium mb-2">
                {duplicates.length} {pluralize(duplicates.length, 'URL', 'URLs')} already exist in Tab Stash:
              </p>
              <div className="text-xs text-muted-foreground space-y-1 mb-3">
                {duplicatesByFolder.map(([folderName, count]) => (
                  <div key={folderName}>
                    • {count} in <span className="font-medium">{folderName}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="import-duplicates"
                  checked={importDuplicates}
                  onCheckedChange={(checked) => setImportDuplicates(!!checked)}
                />
                <Label htmlFor="import-duplicates" className="text-sm cursor-pointer">
                  Import duplicates anyway
                </Label>
              </div>
            </div>
          )}

          {newUrls > 0 && (
            <p className="text-sm text-muted-foreground">
              {newUrls} new {pluralize(newUrls, 'URL', 'URLs')} will be imported.
            </p>
          )}

          {/* CSV folder structure option */}
          {fileType === 'csv' && (
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="use-csv-folders"
                  checked={useCsvFolders}
                  onCheckedChange={(checked) => setUseCsvFolders(!!checked)}
                />
                <Label htmlFor="use-csv-folders" className="text-sm cursor-pointer">
                  Use folder structure from CSV
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {useCsvFolders
                  ? 'Tabs will be organized according to the folder column in the CSV'
                  : 'All tabs will be imported to the destination folder below'}
              </p>
            </div>
          )}

          {/* Folder selection (hidden for CSV if using CSV folders) */}
          {(fileType !== 'csv' || !useCsvFolders) && (
            <div className="space-y-2">
              <Label>Destination folder</Label>
              <DropdownMenu open={folderDropdownOpen} onOpenChange={setFolderDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {destinationFolder === 'new' ? 'Create new folder' : destinationFolderName}
                    <ChevronDown className="size-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="max-h-[600px] min-w-[280px] overflow-y-auto bg-background border shadow-lg z-[2000]"
                  align="start"
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setDestinationFolder('unfiled')
                      setDestinationFolderName('Unfiled')
                      setFolderDropdownOpen(false)
                    }}
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
                      const folder = folders.find(f => f.id === folderId)
                      if (folder) {
                        setDestinationFolder(folderId)
                        setDestinationFolderName(folder.name)
                        setFolderDropdownOpen(false)
                      }
                    }}
                  />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setDestinationFolder('new')
                      setDestinationFolderName('Create new folder')
                      setFolderDropdownOpen(false)
                    }}
                  >
                    <FolderPlus className="size-4 mr-2" />
                    Create new folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {destinationFolder === 'new' && (
                <Input
                  placeholder="New folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={destinationFolder === 'new' && !newFolderName.trim()}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
