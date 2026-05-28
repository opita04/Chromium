import React, { useState, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, MoreVertical, Edit, Trash2 } from 'lucide-react'
import { useAppDispatch } from '@/store/store'
import { createGroup, deleteCategory } from '@/store/slices/workspacesSlice'
import { useClickOutside } from '@/hooks/useClickOutside'
import { Group } from '@/types'
import GroupCard from './GroupCard'

interface CategoryColumnProps {
  id: string
  name: string
  emoji?: string
  groups: Group[]
}

const CategoryColumn: React.FC<CategoryColumnProps> = ({ id, name, emoji, groups }) => {
  const dispatch = useAppDispatch()
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
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
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      dispatch(createGroup({
        categoryId: id,
        name: newGroupName.trim(),
        order: groups.length,
      }))
      setNewGroupName('')
      setShowAddGroup(false)
    }
  }

  const handleDeleteCategory = () => {
    if (confirm(`Are you sure you want to delete "${name}" and all its groups?`)) {
      dispatch(deleteCategory(id))
    }
    setShowMenu(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-80 min-w-[20rem] max-w-xs bg-neutral-50 dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 flex flex-col mr-4 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center flex-1 cursor-move"
        >
          {emoji && <span className="mr-2 text-xl">{emoji}</span>}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{name}</span>
        </div>
        
        {/* Category Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-neutral-500" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 z-10">
              <button
                onClick={() => setShowMenu(false)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Category
              </button>
              <button
                onClick={handleDeleteCategory}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center text-red-600 dark:text-red-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Category
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Groups List */}
      <div className="flex-1 overflow-y-auto p-2">
        <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {groups.length === 0 ? (
              <div className="text-sm text-neutral-400 text-center py-4">No groups</div>
            ) : (
              groups
                .sort((a, b) => a.order - b.order)
                .map(group => (
                  <GroupCard key={group.id} group={group} />
                ))
            )}
          </div>
        </SortableContext>
        
        {/* Add Group */}
        {showAddGroup ? (
          <div className="mt-2 p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddGroup()}
              placeholder="Group name..."
              className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <div className="flex space-x-2 mt-2">
              <button
                onClick={handleAddGroup}
                className="px-2 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddGroup(false)
                  setNewGroupName('')
                }}
                className="px-2 py-1 text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddGroup(true)}
            className="w-full mt-2 p-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors flex items-center justify-center"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Group
          </button>
        )}
      </div>
    </div>
  )
}

export default CategoryColumn 