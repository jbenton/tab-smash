import React from 'react'
import { createRoot } from 'react-dom/client'
import { sendMessage } from '../shared/messaging'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import '../styles/globals.css'
import { initSystemTheme } from '@/shared/theme'

initSystemTheme()

function Popup() {
  const [loading, setLoading] = React.useState(false)
  const [closeAfterStash, setCloseAfterStash] = React.useState(true)
  const [nextTags, setNextTags] = React.useState('')
  const [result, setResult] = React.useState<string>('')
  React.useEffect(() => {
    chrome.storage.local.get({ closeAfterStash: true }).then((o: any) => setCloseAfterStash(o.closeAfterStash))
  }, [])
  function parseTags(input: string): string[] {
    return Array.from(new Set(input.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)))
  }
  async function stashAll() {
    setLoading(true)
    const res = await sendMessage({ type: 'STASH_TABS', close: closeAfterStash, tags: parseTags(nextTags), preserveActive: true })
    setLoading(false)
    if (res.ok && 'stash' in res) setResult(`Stashed: +${res.stash.added}, updated ${res.stash.updated}, closed ${res.stash.closed}`)
  }
  async function stashCurrent() {
    setLoading(true)
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (active?.id) {
        const res = await sendMessage({ type: 'STASH_TABS', tabIds: [active.id], close: closeAfterStash, tags: parseTags(nextTags), preserveActive: true })
        if (res.ok && 'stash' in res) setResult(`Stashed: +${res.stash.added}, updated ${res.stash.updated}, closed ${res.stash.closed}`)
      }
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="p-3 min-w-[300px] flex flex-col gap-2">
      {result && (
        <div className="text-sm text-green-700 dark:text-green-400">
          {result}
          <Button variant="ghost" className="ml-2" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })}>Open dashboard</Button>
        </div>
      )}
      <div className="mb-1">
        <Input placeholder="Tags (comma/space separated)" value={nextTags} onChange={(e) => setNextTags(e.target.value)} />
      </div>
      <div className="flex gap-2 items-center">
        <Button onClick={stashAll} disabled={loading}>
          {loading ? 'Stashing…' : 'Stash All Tabs'}
        </Button>
        <Button variant="secondary" onClick={stashCurrent} disabled={loading}>
          Stash Current
        </Button>
      </div>
      <div className="flex items-center gap-2 mt-1 text-sm text-gray-600 dark:text-gray-300">
        <input
          type="checkbox"
          checked={closeAfterStash}
          onChange={(e) => {
            setCloseAfterStash(e.target.checked)
            chrome.storage.local.set({ closeAfterStash: e.target.checked })
          }}
        />
        Close after stash
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Popup />)
