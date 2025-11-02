// URL normalization + hashing helpers

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

function base64Decode(str: string): string {
  try {
    // Try browser API first
    return decodeURIComponent(Array.from(atob(str), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
  } catch {
    // Fallback for environments without atob
    return Buffer.from(str, 'base64').toString('utf-8')
  }
}

export function normalizeUrl(
  input: string,
  opts: { stripAllParams?: boolean; stripTracking?: boolean } = { stripAllParams: false, stripTracking: true }
): string {
  try {
    const u = new URL(input)
    // Ignore non-http(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return input

    u.hash = ''
    // Lowercase host, strip default ports
    u.hostname = u.hostname.toLowerCase()
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = ''
    }

    // Query params handling for dedupe
    if (opts.stripAllParams) {
      u.search = ''
    } else {
      const params = new URLSearchParams(u.search)
      if (opts.stripTracking) {
        const exact = new Set<string>([
          'fbclid', 'gclid', 'dclid', 'msclkid', 'ga_source', 'ga_medium', 'ga_campaign',
          'yclid', 'vero_conv', 'igshid', 'spm', 'sc_channel', 'sc_campaign', 'sc_content', 'sc_medium', 'sc_source',
          'mc_cid', 'mc_eid', 'ref', 'ref_src', 'ref_url', 'referrer'
        ])
        const prefixes = ['utm_', 'hsa_', 'pk_', 'icn', 'mkt_', 'aff_', 'sr_', 'xtor', 'oly_']
        const keys: string[] = []
        params.forEach((_v, k) => keys.push(k))
        keys.forEach((k) => {
          if (exact.has(k) || prefixes.some((p) => k === p || k.startsWith(p))) params.delete(k)
        })
      }
      const sorted = new URLSearchParams()
      const entries: [string, string][] = []
      params.forEach((v, k) => { entries.push([k, v]) })
      entries.sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => sorted.append(k, v))
      u.search = sorted.toString() ? `?${sorted.toString()}` : ''
    }

    // Remove trailing slash (except root)
    if (u.pathname.endsWith('/') && u.pathname !== '/') {
      u.pathname = u.pathname.replace(/\/+$/, '')
    }

    return u.toString()
  } catch {
    return input
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}


// Tab Stash metadata hash prefix
export const TAB_STASH_HASH_PREFIX = '#tab-stash:'

/**
 * Parse URL hash parameters for Tab Stash metadata
 * Format: #tab-stash:base64url(json)
 */
export function parseTabStashHash(url: string): Record<string, any> | null {
  const hashIndex = url.indexOf(TAB_STASH_HASH_PREFIX)
  if (hashIndex === -1) return null

  try {
    const base64Data = url.slice(hashIndex + TAB_STASH_HASH_PREFIX.length)
    const jsonString = base64Decode(base64Data)
    return JSON.parse(jsonString)
  } catch {
    return null
  }
}

/**
 * Convert TabXpert suspended URLs to real URLs
 * TabXpert format: https://s.tabxpert.com/#\!title=...&favIcon=...&url=...
 * Real URL is in the `url` parameter
 */
export function convertTabXpertUrl(url: string): string {
  if (!url.includes('s.tabxpert.com/')) {
    return url
  }

  try {
    const urlObj = new URL(url)
    const hash = urlObj.hash.substring(2) // Remove '#\!'

    // Parse URL-encoded parameters
    const params = new URLSearchParams(hash)
    const realUrl = params.get('url')

    if (realUrl) {
      return decodeURIComponent(realUrl)
    }
  } catch (error) {
    console.warn('Failed to parse TabXpert URL:', url, error)
  }

  return url // Return original URL if parsing fails
}
