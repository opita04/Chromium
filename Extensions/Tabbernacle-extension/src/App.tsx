import React, { useEffect } from 'react'
import { useAppSelector, useAppDispatch } from '@/store/store'
import { fetchTabs } from '@/store/slices/tabsSlice'
import { fetchWorkspaces } from '@/store/slices/workspacesSlice'
import { continueAsGuest } from '@/store/slices/authSlice'
import { initializeSync } from '@/store/slices/syncSlice'

import ActiveTabsSidebar from '@/components/ActiveTabsSidebar'
import WorkspaceManager from '@/components/WorkspaceManager'
import KanbanBoard from '@/components/KanbanBoard'
import SearchBar from '@/components/SearchBar'
import Onboarding from '@/components/Onboarding'
import LoadingSpinner from '@/components/LoadingSpinner'

const App: React.FC = () => {
  const dispatch = useAppDispatch()
  const { isAuthenticated } = useAppSelector(state => state.auth)
  const { loading: workspacesLoading } = useAppSelector(state => state.workspaces)
  const { loading: tabsLoading } = useAppSelector(state => state.tabs)
  const { isCompleted: onboardingCompleted } = useAppSelector(state => state.onboarding)
  const { sidebarCollapsed } = useAppSelector(state => state.ui)

  // Initialize app on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize sync
        await dispatch(initializeSync()).unwrap()
        
        // Fetch tabs
        await dispatch(fetchTabs()).unwrap()
        
        // If not authenticated, continue as guest
        if (!isAuthenticated) {
          await dispatch(continueAsGuest()).unwrap()
        }
        
        // Fetch workspaces
        await dispatch(fetchWorkspaces()).unwrap()
      } catch (error) {
        console.error('Failed to initialize app:', error)
      }
    }

    initializeApp()
  }, [dispatch, isAuthenticated])

  // Show loading spinner while initializing
  if (workspacesLoading || tabsLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-900 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // Show onboarding if not completed
  if (!onboardingCompleted) {
    return <Onboarding />
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 flex">
      {/* Active Tabs Sidebar */}
      <ActiveTabsSidebar />
      
      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
        {/* Header */}
        <header className="h-16 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <WorkspaceManager />
          </div>
          
          <div className="flex items-center space-x-4">
            <SearchBar />
            {/* TODO: Add user menu, settings, etc. */}
          </div>
        </header>
        
        {/* Main Workspace */}
        <main className="flex-1 overflow-hidden">
          <KanbanBoard />
        </main>
      </div>
    </div>
  )
}

export default App 