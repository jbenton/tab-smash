import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Folder } from '@/shared/types'

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string, color?: string, parentId?: string | null) => void
  parentName?: string
  folders: Folder[]
  initialParentId?: string | null
}

export function CreateFolderDialog({ open, onOpenChange, onConfirm, parentName, folders, initialParentId }: CreateFolderDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>()
  const [parentId, setParentId] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onConfirm(name.trim(), color, parentId)
      setName('')
      setColor(undefined)
      setParentId(null)
      onOpenChange(false)
    }
  }

  useEffect(() => {
    if (open) {
      setParentId(initialParentId ?? null)
    } else {
      setName('')
      setColor(undefined)
      setParentId(null)
    }
  }, [open, initialParentId])

  const colors = [
    { value: '#3b82f6', label: 'Blue' },
    { value: '#10b981', label: 'Green' },
    { value: '#f59e0b', label: 'Orange' },
    { value: '#ef4444', label: 'Red' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#6366f1', label: 'Indigo' },
    { value: '#14b8a6', label: 'Teal' }
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your tabs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter folder name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-folder">Parent folder (optional)</Label>
              <Select value={parentId ?? 'null'} onValueChange={(v) => setParentId(v === 'null' ? null : v)}>
                <SelectTrigger id="parent-folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">Top level</SelectItem>
                  {folders.map(folder => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-color">Color (optional)</Label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="size-8 rounded border-2 border-gray-300 hover:border-gray-400"
                  onClick={() => setColor(undefined)}
                >
                  <span className="sr-only">None</span>
                </button>
                {colors.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className="size-8 rounded border-2"
                    style={{
                      backgroundColor: c.value,
                      borderColor: color === c.value ? '#000' : 'transparent'
                    }}
                    onClick={() => setColor(c.value)}
                    title={c.label}
                  >
                    <span className="sr-only">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface RenameFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
  currentName: string
}

export function RenameFolderDialog({ open, onOpenChange, onConfirm, currentName }: RenameFolderDialogProps) {
  const [name, setName] = useState(currentName)

  useEffect(() => {
    setName(currentName)
  }, [currentName, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && name !== currentName) {
      onConfirm(name.trim())
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>
              Enter a new name for this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rename-folder">Folder name</Label>
            <Input
              id="rename-folder"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              autoFocus
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || name === currentName}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (action: 'delete_items' | 'move_to_parent' | 'move_to_unfiled') => void
  folderName: string
  itemCount: number
  hasSubfolders: boolean
}

export function DeleteFolderDialog({
  open,
  onOpenChange,
  onConfirm,
  folderName,
  itemCount,
  hasSubfolders
}: DeleteFolderDialogProps) {
  const [action, setAction] = useState<'delete_items' | 'move_to_parent' | 'move_to_unfiled'>('move_to_unfiled')

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder "{folderName}"?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              This folder contains {itemCount} tab(s){hasSubfolders && ' and has subfolders'}.
              {hasSubfolders && ' Subfolders will be moved to the parent level.'}
            </p>
            {itemCount > 0 && (
              <div className="space-y-2">
                <Label>What should happen to the items?</Label>
                <Select value={action} onValueChange={(v) => setAction(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="move_to_unfiled">Move to Unfiled</SelectItem>
                    <SelectItem value="move_to_parent">Move to parent folder</SelectItem>
                    <SelectItem value="delete_items">Delete all items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(action)}
          >
            Delete folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ChangeColorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (color: string | undefined) => void
  currentColor?: string
  folderName: string
}

export function ChangeColorDialog({
  open,
  onOpenChange,
  onConfirm,
  currentColor,
  folderName
}: ChangeColorDialogProps) {
  const [color, setColor] = useState<string | undefined>(currentColor)

  useEffect(() => {
    setColor(currentColor)
  }, [currentColor, open])

  const colors = [
    { value: '#3b82f6', label: 'Blue' },
    { value: '#10b981', label: 'Green' },
    { value: '#f59e0b', label: 'Orange' },
    { value: '#ef4444', label: 'Red' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#6366f1', label: 'Indigo' },
    { value: '#14b8a6', label: 'Teal' }
  ]

  const handleSubmit = () => {
    onConfirm(color)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change color for "{folderName}"</DialogTitle>
          <DialogDescription>
            Choose a color to help identify this folder.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="size-10 rounded border-2 hover:border-gray-400"
              style={{
                borderColor: color === undefined ? '#000' : '#d1d5db'
              }}
              onClick={() => setColor(undefined)}
            >
              <span className="text-xs">None</span>
            </button>
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                className="size-10 rounded border-2"
                style={{
                  backgroundColor: c.value,
                  borderColor: color === c.value ? '#000' : 'transparent'
                }}
                onClick={() => setColor(c.value)}
                title={c.label}
              >
                <span className="sr-only">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface BulkTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (tags: string[]) => void
  selectedCount: number
}

export function BulkTagDialog({ open, onOpenChange, onConfirm, selectedCount }: BulkTagDialogProps) {
  const [tagsInput, setTagsInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
    if (tags.length > 0) {
      onConfirm(tags)
      setTagsInput('')
      onOpenChange(false)
    }
  }

  useEffect(() => {
    if (!open) setTagsInput('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add tags to {selectedCount} tab(s)</DialogTitle>
            <DialogDescription>
              Enter tags separated by commas to add to the selected tabs.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-tags">Tags (comma separated)</Label>
            <Input
              id="bulk-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3"
              autoFocus
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!tagsInput.trim()}>
              Add Tags
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface BulkRemoveTagsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (tags: string[]) => void
  selectedCount: number
  availableTags: string[]
}

export function BulkRemoveTagsDialog({ open, onOpenChange, onConfirm, selectedCount, availableTags }: BulkRemoveTagsDialogProps) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())

  const handleToggleTag = (tag: string) => {
    const newSelected = new Set(selectedTags)
    if (newSelected.has(tag)) {
      newSelected.delete(tag)
    } else {
      newSelected.add(tag)
    }
    setSelectedTags(newSelected)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedTags.size > 0) {
      onConfirm(Array.from(selectedTags))
      setSelectedTags(new Set())
      onOpenChange(false)
    }
  }

  useEffect(() => {
    if (!open) setSelectedTags(new Set())
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Remove tags from {selectedCount} tab(s)</DialogTitle>
            <DialogDescription>
              Select which tags to remove from the selected tabs.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {availableTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags to remove from selected tabs.</p>
            ) : (
              <>
                <Label>Select tags to remove:</Label>
                <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto">
                  {availableTags.map((tag) => (
                    <label key={tag} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedTags.has(tag)}
                        onChange={() => handleToggleTag(tag)}
                        className="size-4"
                      />
                      <span className="text-sm">{tag}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={selectedTags.size === 0 || availableTags.length === 0}>
              Remove Tags
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
