import React from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import '../styles/globals.css'
import { initSystemTheme } from '@/shared/theme'

initSystemTheme()

function Options() {
  const [staleDays, setStaleDays] = React.useState(30)
  const [closeAfterStash, setCloseAfterStash] = React.useState(true)
  const [closePinned, setClosePinned] = React.useState(false)
  const [stripAllParams, setStripAllParams] = React.useState(false)
  const [stripTrackingParams, setStripTrackingParams] = React.useState(true)
  React.useEffect(() => {
    chrome.storage.local.get({ staleDays: 30, closeAfterStash: true, closePinned: false, stripAllParams: false, stripTrackingParams: true }).then((o: any) => {
      setStaleDays(o.staleDays)
      setCloseAfterStash(o.closeAfterStash)
      setClosePinned(o.closePinned)
      setStripAllParams(o.stripAllParams)
      setStripTrackingParams(o.stripTrackingParams)
    })
  }, [])
  function save() {
    chrome.storage.local.set({ staleDays, closeAfterStash, closePinned, stripAllParams, stripTrackingParams })
  }
  return (
    <div className="p-4 max-w-[640px] space-y-3">
      <h2 className="text-xl font-semibold">Tab Stash Settings</h2>
      <div className="flex items-center gap-2">
        <label className="text-sm">Stale threshold (days)</label>
        <Input type="number" value={staleDays} onChange={(e) => setStaleDays(Number(e.target.value))} className="w-24" />
        <Button onClick={save}>Save</Button>
      </div>
      <p className="text-sm text-gray-500">Items with status "stashed" older than this are considered stale.</p>
      <div className="flex flex-col gap-2 mt-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={closeAfterStash} onChange={(e) => setCloseAfterStash(e.target.checked)} />
          Close tabs after stashing
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={closePinned} onChange={(e) => setClosePinned(e.target.checked)} />
          Also close pinned tabs
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={stripTrackingParams} onChange={(e) => setStripTrackingParams(e.target.checked)} />
          Strip tracking parameters (utm_*, fbclid, gclid, etc.) for dedupe
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={stripAllParams} onChange={(e) => setStripAllParams(e.target.checked)} />
          Strip all URL query parameters for dedupe (overrides above)
        </label>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Options />)
