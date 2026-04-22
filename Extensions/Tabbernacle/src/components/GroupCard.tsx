import React, { useState, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MoreVertical, Edit, Trash2, ExternalLink } from 'lucide-react'
import { useAppDispatch } from '@/store/store'
import { deleteGroup } from '@/store/slices/workspacesSlice'
import { useClickOutside } from '@/hooks/useClickOutside'
import { Group } from '@/types'

interface GroupCardProps {
  group: Group
}

const GroupCard: React.FC<GroupCardProps> = ({ group }) => {
  const dispatch = useAppDispatch()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useClickOutside(menuRef, () => setShowMenu(false))

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleDeleteGroup = () => {
    if (confirm(`Are you sure you want to delete "${group.name}" and all its items?`)) {
      dispatch(deleteGroup(group.id))
    }
    setShowMenu(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-3 ${
        isDragging ? 'opacity-50 rotate-2' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div
          {...attributes}
          {...listeners}
          className="flex-1 cursor-move"
        >
          <div className="flex items-center mb-2">
            {group.emoji && <span className="mr-2 text-lg">{group.emoji}</span>}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">{group.name}</span>
          </div>
          
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>{group.itemCount} items</span>
            <button className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded">
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
        
        {/* Group Menu */}
        <div className="relative ml-2" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-neutral-500" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 z-10">
              <button
                onClick={() => setShowMenu(false)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Group
              </button>
              <button
                onClick={handleDeleteGroup}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center text-red-600 dark:text-red-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Group
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GroupCard 