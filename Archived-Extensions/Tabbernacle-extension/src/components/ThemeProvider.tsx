import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/store/store'
import { setTheme } from '@/store/slices/uiSlice'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch()
  const theme = useAppSelector(state => state.ui.theme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  // Resolve system theme
  useEffect(() => {
    const resolveTheme = () => {
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        setResolvedTheme(systemTheme)
      } else {
        setResolvedTheme(theme)
      }
    }

    resolveTheme()

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') {
        resolveTheme()
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    
    // Remove existing theme classes
    root.classList.remove('light', 'dark')
    
    // Add current theme class
    root.classList.add(resolvedTheme)
    
    // Update CSS custom properties for theme
    if (resolvedTheme === 'dark') {
      root.style.setProperty('--toast-bg', '#1e293b')
      root.style.setProperty('--toast-color', '#f8fafc')
      root.style.setProperty('--toast-border', '#334155')
      root.style.setProperty('--bg-primary', '#0f172a')
      root.style.setProperty('--bg-secondary', '#1e293b')
      root.style.setProperty('--text-primary', '#f8fafc')
      root.style.setProperty('--text-secondary', '#94a3b8')
      root.style.setProperty('--border-light', '#334155')
      root.style.setProperty('--border-medium', '#475569')
    } else {
      root.style.setProperty('--toast-bg', '#ffffff')
      root.style.setProperty('--toast-color', '#0f172a')
      root.style.setProperty('--toast-border', '#e2e8f0')
      root.style.setProperty('--bg-primary', '#ffffff')
      root.style.setProperty('--bg-secondary', '#f8fafc')
      root.style.setProperty('--text-primary', '#0f172a')
      root.style.setProperty('--text-secondary', '#64748b')
      root.style.setProperty('--border-light', '#e2e8f0')
      root.style.setProperty('--border-medium', '#cbd5e1')
    }
  }, [resolvedTheme])

  const handleSetTheme = (newTheme: Theme) => {
    dispatch(setTheme(newTheme))
  }

  const value: ThemeContextType = {
    theme,
    setTheme: handleSetTheme,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
} 