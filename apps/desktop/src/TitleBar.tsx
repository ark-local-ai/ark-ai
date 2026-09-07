import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

// Custom title bar for the frameless window: drag region + min/max/close.
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()
    const sync = () => win.isMaximized().then(setMaximized)
    win.onResized(sync)
    win.onMoved(sync)
    sync()
  }, [])

  const win = getCurrentWindow()

  const toggleMax = () => {
    if (maximized) win.unmaximize()
    else win.maximize()
  }

  return (
    <header className="tb" data-tauri-drag-region>
      <span className="tb-title" data-tauri-drag-region>Ark · 方舟</span>
      <div className="tb-controls">
        <button
          className="tb-btn"
          aria-label="最小化"
          onClick={() => win.minimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
        <button
          className="tb-btn"
          aria-label={maximized ? '还原' : '最大化'}
          onClick={toggleMax}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5h5v5h-5z" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>
          )}
        </button>
        <button
          className="tb-btn tb-close"
          aria-label="关闭"
          onClick={() => win.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
      </div>
    </header>
  )
}
