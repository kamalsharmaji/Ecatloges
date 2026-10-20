import { useState } from 'react'

const KEY = 'mec.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Header hamburger: opens the drawer on small screens, collapses the sidebar on desktop (remembered per browser). */
export function useShellToggle() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((c) => {
        try {
          localStorage.setItem(KEY, c ? '0' : '1')
        } catch {
          /* storage unavailable: keep the in-memory state only */
        }
        return !c
      })
    } else {
      setMobileOpen(true)
    }
  }
  return { mobileOpen, collapsed, toggle, closeMobile: () => setMobileOpen(false) }
}
