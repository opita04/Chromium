import React from 'react'
import { useAppSelector, useAppDispatch } from '@/store/store'
import { closeTab } from '@/store/slices/tabsSlice'
import { X } from 'lucide-react'

const ActiveTabsSidebar: React.FC = () => {
  const dispatch = useAppDispatch()
  const { tabs, loading } = useAppSelector(state => state.tabs)
  const { sidebarCollapsed } = useAppSelector(state => state.ui)

  const handleCloseTab = (tabId: number) => {
    dispatch(closeTab(tabId))
  }

  if (sidebarCollapsed) {
    return (
      <div className="w-16 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        <div className="p-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
          {tabs.length}
        </div>
      </div>
    )
  }

  return (
    <div className="w-64 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Active Tabs ({tabs.length})
        </h2>
      </div>
      
      {/* Tabs List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading tabs...
          </div>
        ) : tabs.length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No tabs found
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className="group flex items-center space-x-2 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors duration-150"
              >
                {/* Favicon */}
                <div className="flex-shrink-0 w-4 h-4">
                  {tab.favicon ? (
                    <img
                      src={tab.favicon}
                      alt=""
                      className="w-4 h-4 rounded"
                    />
                  ) : (
                    <div className="w-4 h-4 bg-neutral-300 dark:bg-neutral-600 rounded" />
                  )}
                </div>
                
                {/* Tab Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {tab.title}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {new URL(tab.url).hostname}
                  </div>
                </div>
                
                {/* Close Button */}
                <button
                  onClick={() => handleCloseTab(tab.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-all duration-150"
                  title="Close tab"
                >
                  <X className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ActiveTabsSidebar 