import { TAB_STASH_HASH_PREFIX, convertTabXpertUrl, normalizeUrl, sha256Hex } from './url'
import type { Item } from './types'

// Browser-compatible base64 encoding/decoding
function base64Encode(str: string): string {
  try {
    // Try browser API first
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
  } catch {
    // Fallback for environments without btoa
    return Buffer.from(str, 'utf-8').toString('base64')
  }
}

/**
 * Convert TabXpert URL in bookmark metadata and item
 * Returns updated item with converted URL and metadata
 */
export async function processTabXpertUrl(item: Item): Promise<Item> {
  const convertedUrl = convertTabXpertUrl(item.url)

  if (convertedUrl !== item.url) {
    // Update URL and recalculate hash for the converted URL
    const metadata = {
      title: item.title || '',
      notes: item.notes || '',
      tags: item.tags || [],
      originalUrl: item.url, // Keep original for reference
      tabXpertUrl: true, // Flag that this was converted from TabXpert
    }

    // Encode metadata into hash (browser-compatible)
    const metadataJson = JSON.stringify(metadata)
    const metadataBase64 = base64Encode(metadataJson)
    const finalUrl = convertedUrl + TAB_STASH_HASH_PREFIX + metadataBase64

    return {
      ...item,
      url: finalUrl,
      urlHash: await sha256Hex(normalizeUrl(convertedUrl))
    }
  }

  return item
}

/**
 * Check if a URL is a TabXpert suspended URL
 */
export function isTabXpertUrl(url: string): boolean {
  return url.includes('s.tabxpert.com/') && url.includes('#!') && url.includes('url=')
}

/**
 * Convert TabXpert URLs in an array of items
 */
export async function convertTabXpertUrls(items: Item[]): Promise<Item[]> {
  const convertedItems = []

  for (const item of items) {
    if (isTabXpertUrl(item.url)) {
      const convertedItem = await processTabXpertUrl(item)
      convertedItems.push(convertedItem)
    } else {
      convertedItems.push(item)
    }
  }

  return convertedItems
}