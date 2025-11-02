import React from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function RowActions({ onTrash, onDelete, isInTrash }: {
  onTrash?: () => void | Promise<void>
  onDelete?: () => void | Promise<void>
  isInTrash?: boolean
}) {
  const action = isInTrash ? onDelete : onTrash
  const tooltipText = isInTrash ? 'Delete' : 'Trash'
  const ariaLabel = isInTrash ? 'Delete permanently' : 'Move to trash'

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={ariaLabel} onClick={action}>
            <X className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-background text-foreground border border-border shadow-md z-[1000]">
          <p className="text-sm">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
