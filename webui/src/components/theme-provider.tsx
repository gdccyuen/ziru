"use client"

import { useEffect } from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import type { ReactNode } from "react"

/**
 * Keep Bootstrap 5.3's `data-bs-theme` attribute in sync with the Next.js
 * theme. Bootstrap flips its component surfaces (modal, cards, badges,
 * breadcrumbs, bg-body-*) purely from this attribute, so without it the modal
 * body stays light while Tailwind's dark `--foreground` becomes near-white —
 * producing the white-on-white chunk-pane tree seen in dark mode.
 */
function BootstrapThemeSync(): null {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const theme = resolvedTheme === "dark" ? "dark" : "light"
    document.documentElement.setAttribute("data-bs-theme", theme)
  }, [resolvedTheme])

  return null
}

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps): ReactNode {
  return (
    <NextThemesProvider {...props}>
      <BootstrapThemeSync />
      {children}
    </NextThemesProvider>
  )
}
