// System theme sync (no inline scripts; MV3 CSP safe)
export function initSystemTheme() {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.classList.toggle('dark', mq.matches)
    }
    apply()
    if ((mq as any).addEventListener) mq.addEventListener('change', apply)
    else (mq as any).addListener?.(apply)
  } catch {}
}

