import React from 'react'
import { createRoot } from 'react-dom/client'
import { SidePanelApp } from './ui/SidePanelApp'
import '../styles/globals.css'
import { initSystemTheme } from '@/shared/theme'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

initSystemTheme()
const root = createRoot(document.getElementById('root')!)
root.render(
  <TooltipProvider>
    <SidePanelApp />
    <Toaster richColors />
  </TooltipProvider>
)
