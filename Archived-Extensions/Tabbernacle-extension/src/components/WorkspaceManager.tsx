import React from 'react'
import { useAppSelector } from '@/store/store'
import { ChevronDown } from 'lucide-react'

const WorkspaceManager: React.FC = () => {
  const { workspaces, currentWorkspaceId } = useAppSelector(state => state.workspaces)
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId)

  return (
    <div className="flex items-center space-x-2">
      <button className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors duration-150">
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {currentWorkspace?.name || 'Select Workspace'}
        </span>
        <ChevronDown className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
      </button>
    </div>
  )
}

export default WorkspaceManager 