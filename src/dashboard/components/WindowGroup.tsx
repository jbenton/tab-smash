import React from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { WindowWithTabs } from '@/shared/types'
import type { useTabSelection } from '@/hooks/use-tab-selection'
import { cn } from '@/lib/utils'

// Validate if a favicon URL is safe to load (prevents CSP violations from HTML pages)
function isSafeFaviconUrl(url: string | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)

    // Allow data URLs
    if (parsed.protocol === 'data:') return true

    // Blocklist: domains known to return HTML 404 pages for favicon requests
    const blockedDomains = ['every.to']
    if (blockedDomains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))) {
      return false
    }

    // Allow trusted favicon services
    const trustedHosts = [
      'gstatic.com',
      'googleapis.com',
      'google.com',
      'favicon.ico',
      'chrome://favicon'
    ]
    if (trustedHosts.some(host => parsed.hostname.includes(host))) return true

    // Allow URLs with common image extensions
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp', '.gif']
    const pathname = parsed.pathname.toLowerCase()
    if (imageExtensions.some(ext => pathname.endsWith(ext))) return true

    // Reject everything else (likely HTML pages)
    return false
  } catch {
    return false
  }
}

interface WindowGroupProps {
  window: WindowWithTabs
  windowIndex: number
  tabSelection: ReturnType<typeof useTabSelection>
  onStashTabs: (tabIds: number[], closeAfter: boolean, targetFolderId?: string | null) => Promise<void>
  allTabs: Array<{ id: number; url: string; title?: string; favIconUrl?: string; pinned?: boolean; groupId?: number }>
  isSearching?: boolean
  onRefreshWindows?: () => Promise<void>
  allExpanded?: boolean
  onDragStart?: (e: React.DragEvent, tabIds: number[]) => void
  windowExpandedStates: Record<number, boolean>
  onToggleWindowExpanded: (windowId: number, isExpanded: boolean) => void
}

export function WindowGroup({ window, windowIndex, tabSelection, onStashTabs, allTabs, isSearching, onRefreshWindows, allExpanded, onDragStart, windowExpandedStates, onToggleWindowExpanded }: WindowGroupProps) {
  const [visibleCount, setVisibleCount] = React.useState(20)
  const [hoveredTabId, setHoveredTabId] = React.useState<number | null>(null)

  // Use persistent state, default to collapsed (false)
  const isOpen = windowExpandedStates[window.windowId] ?? false

  // Auto-expand when searching (but don't persist this)
  const effectiveIsOpen = isSearching ? true : isOpen

  // Track previous allExpanded value to detect actual changes
  const prevAllExpandedRef = React.useRef(allExpanded)

  // Only respond to explicit Expand All / Collapse All button clicks
  React.useEffect(() => {
    const prevAllExpanded = prevAllExpandedRef.current
    prevAllExpandedRef.current = allExpanded

    // Only update if allExpanded actually changed (button was clicked)
    if (prevAllExpanded !== allExpanded && allExpanded !== undefined) {
      onToggleWindowExpanded(window.windowId, allExpanded)
    }
  }, [allExpanded])  // Intentionally omit other deps - only respond to allExpanded changes

  const displayedTabs = window.tabs.slice(0, visibleCount)
  const hasMore = visibleCount < window.tabs.length

  // Check if all tabs in this window are selected
  const windowTabIds = window.tabs.map(t => t.id)
  const selectedInWindowCount = windowTabIds.filter(id => tabSelection.selected[id]).length
  const allWindowTabsSelected = windowTabIds.length > 0 && windowTabIds.every(id => tabSelection.selected[id])
  const someWindowTabsSelected = selectedInWindowCount > 0 && !allWindowTabsSelected

  // Handler for "Select All" checkbox in window header
  const handleSelectAllWindow = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (allWindowTabsSelected) {
      // Deselect all tabs in this window
      tabSelection.setSelected(prev => {
        const next = { ...prev }
        windowTabIds.forEach(id => {
          delete next[id]
        })
        return next
      })
    } else {
      // Select all tabs in this window
      tabSelection.setSelected(prev => {
        const next = { ...prev }
        windowTabIds.forEach(id => {
          next[id] = true
        })
        return next
      })
    }
  }

  const getFavicon = (url: string | undefined) => {
    if (!url) return null
    try {
      const domain = new URL(url).hostname
      // Use a more secure favicon service that doesn't trigger CSP violations
      return `https://t1.gstatic.com/faviconV2?domain=${domain}&size=32&fallback=1`
    } catch {
      return null
    }
  }

  const getDomain = (url: string) => {
    try {
      const hostname = new URL(url).hostname
      // Remove www. prefix if present
      return hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  }

  const getFullUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      // Remove www. prefix if present and don't include protocol
      const hostname = urlObj.hostname.replace(/^www\./, '')
      return `${hostname}${urlObj.pathname}${urlObj.search}${urlObj.hash}`
    } catch {
      return url
    }
  }

  return (
    <Collapsible
      open={effectiveIsOpen}
      onOpenChange={(newOpen) => {
        // Only persist if not searching (searching is temporary auto-expand)
        if (!isSearching) {
          onToggleWindowExpanded(window.windowId, newOpen)
        }
      }}
      className="border rounded-lg bg-card"
    >
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-3 hover:bg-muted/50">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allWindowTabsSelected}
              onCheckedChange={(checked) => {
                const e = new MouseEvent('click') as any
                handleSelectAllWindow(e)
              }}
              onClick={handleSelectAllWindow}
              className={cn(
                someWindowTabsSelected && 'data-[state=unchecked]:bg-muted data-[state=unchecked]:border-primary'
              )}
            />
            {isOpen ? (
              <ChevronDown className="size-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="size-4 flex-shrink-0" />
            )}
            <span className="font-medium text-sm">
              Window {windowIndex + 1}
              {window.focused && (
                <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                  Focused
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              ({window.tabs.length} {window.tabs.length === 1 ? 'tab' : 'tabs'}
              {selectedInWindowCount > 0 && `, ${selectedInWindowCount} selected`})
            </span>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t">
          <div>
            {displayedTabs.map((tab, localIndex) => {
              // Find this tab's index in the global allTabs array for shift-click support
              const globalIndex = allTabs.findIndex(t => t.id === tab.id)

              return (
                <div
                  key={tab.id}
                  className={cn(
                    'flex items-center gap-3 py-1 px-3 hover:bg-muted/30 transition-colors cursor-pointer select-none',
                    tab.pinned && 'bg-amber-50/50 dark:bg-amber-950/20',
                    tabSelection.selected[tab.id] && 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                  )}
                  onClick={(e) => {
                    tabSelection.handleTabClick(tab.id, globalIndex, e as any)
                  }}
                  draggable={true}
                  onDragStart={(e) => {
                    // If tab is selected, drag all selected tabs. Otherwise, drag just this tab.
                    const tabsToDrag = tabSelection.selected[tab.id] ? tabSelection.selectedIds : [tab.id]
                    if (onDragStart) {
                      onDragStart(e, tabsToDrag)
                    }
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <Checkbox
                    checked={!!tabSelection.selected[tab.id]}
                    onClick={(e) => {
                      e.stopPropagation()
                      tabSelection.handleTabClick(tab.id, globalIndex, e as any)
                    }}
                  />

                <div className="flex-shrink-0 size-4">
                  {isSafeFaviconUrl(tab.favIconUrl) || isSafeFaviconUrl(getFavicon(tab.url)) ? (
                    <img
                      src={(isSafeFaviconUrl(tab.favIconUrl) ? tab.favIconUrl : getFavicon(tab.url))!}
                      alt=""
                      className="size-4 object-contain"
                      onError={(e) => {
                        // Hide image but maintain spacing
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  ) : (
                    <div className="size-4 rounded bg-muted" />
                  )}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-1.5 text-sm">
                  <span
                    className="truncate hover:underline font-medium cursor-pointer hover:text-primary transition-colors select-auto"
                    onClick={async (e) => {
                      e.stopPropagation()
                      // Focus the tab in Chrome
                      await chrome.tabs.update(tab.id, { active: true })
                      // Focus the window containing the tab
                      const tabInfo = await chrome.tabs.get(tab.id)
                      if (tabInfo.windowId) {
                        await chrome.windows.update(tabInfo.windowId, { focused: true })
                      }
                    }}
                    onMouseEnter={() => setHoveredTabId(tab.id)}
                    onMouseLeave={() => setHoveredTabId(null)}
                  >
                    {tab.title || 'Untitled'}
                  </span>
                  <span className="text-muted-foreground flex-shrink-0">•</span>
                  <span
                    className={cn(
                      "text-muted-foreground transition-all duration-200 truncate",
                      hoveredTabId === tab.id && "text-foreground"
                    )}
                  >
                    {hoveredTabId === tab.id ? getFullUrl(tab.url) : getDomain(tab.url)}
                  </span>
                  {tab.pinned && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0 ml-1">
                      📌
                    </span>
                  )}
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await chrome.tabs.remove(tab.id)
                        // Refresh windows list
                        if (onRefreshWindows) {
                          await onRefreshWindows()
                        }
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Close in Chrome
                  </TooltipContent>
                </Tooltip>
              </div>
              )
            })}
          </div>

          {hasMore && (
            <div className="p-3 border-t flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setVisibleCount(prev => prev + 50)
                }}
              >
                Load {Math.min(50, window.tabs.length - visibleCount)} more tabs
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
