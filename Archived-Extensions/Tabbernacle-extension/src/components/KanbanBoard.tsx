import React, { useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/store/store'
import { updateCategoryOrder, updateGroupOrder, createCategory } from '@/store/slices/workspacesSlice'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import CategoryColumn from './CategoryColumn'

const KanbanBoard: React.FC = () => {
  const dispatch = useAppDispatch()
  const { categories, groups } = useAppSelector(state => state.workspaces)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('')

  // Configure sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Map groups to their categories
  const groupsByCategory = categories.reduce<Record<string, typeof groups>>((acc, category) => {
    acc[category.id] = groups.filter(g => g.categoryId === category.id)
    return acc
  }, {})

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) return

    if (active.id !== over.id) {
      const activeId = active.id as string
      const overId = over.id as string

      // Check if we're dragging a category
      const activeCategory = categories.find(c => c.id === activeId)
      const overCategory = categories.find(c => c.id === overId)

      if (activeCategory && overCategory) {
        // Reordering categories
        const oldIndex = categories.findIndex(c => c.id === activeId)
        const newIndex = categories.findIndex(c => c.id === overId)
        
        const newCategories = arrayMove(categories, oldIndex, newIndex)
        
        // Update order for all categories
        newCategories.forEach((category, index) => {
          dispatch(updateCategoryOrder({ categoryId: category.id, newOrder: index }))
        })
      } else {
        // Reordering groups
        const activeGroup = groups.find(g => g.id === activeId)
        const overGroup = groups.find(g => g.id === overId)

        if (activeGroup && overGroup) {
          const oldIndex = groups.findIndex(g => g.id === activeId)
          const newIndex = groups.findIndex(g => g.id === overId)
          
          const newGroups = arrayMove(groups, oldIndex, newIndex)
          
          // Update order for all groups
          newGroups.forEach((group, index) => {
            dispatch(updateGroupOrder({ groupId: group.id, newOrder: index }))
          })
        }
      }
    }
  }

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      dispatch(createCategory({
        workspaceId: 'demo-workspace',
        name: newCategoryName.trim(),
        emoji: newCategoryEmoji || undefined,
        order: categories.length,
      }))
      setNewCategoryName('')
      setNewCategoryEmoji('')
      setShowAddCategory(false)
    }
  }

  // Create a flat list of all sortable items (categories + groups)
  const sortableItems = [
    ...categories.map(c => c.id),
    ...groups.map(g => g.id)
  ]

  return (
    <div className="h-full w-full overflow-x-auto flex items-start p-6">
      {categories.length === 0 ? (
        <div className="text-center text-neutral-500 dark:text-neutral-400 w-full">
          <h2 className="text-lg font-medium mb-2">Welcome to Tabbernacle</h2>
          <p className="text-sm mb-4">
            Your Kanban board will appear here. Start by creating categories and groups to organize your tabs.
          </p>
          <button
            onClick={() => setShowAddCategory(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Category
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortableItems}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex items-start">
              {categories
                .sort((a, b) => a.order - b.order)
                .map(category => (
                  <CategoryColumn
                    key={category.id}
                    id={category.id}
                    name={category.name}
                    emoji={category.emoji}
                    color={category.color}
                    groups={groupsByCategory[category.id] || []}
                  />
                ))}
              
              {/* Add Category Button */}
              {showAddCategory ? (
                <div className="w-80 min-w-[20rem] max-w-xs bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-4 mr-4">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                    placeholder="Category name..."
                    className="w-full px-3 py-2 mb-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newCategoryEmoji}
                    onChange={(e) => setNewCategoryEmoji(e.target.value)}
                    placeholder="Emoji (optional)"
                    className="w-full px-3 py-2 mb-3 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleAddCategory}
                      className="px-3 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAddCategory(false)
                        setNewCategoryName('')
                        setNewCategoryEmoji('')
                      }}
                      className="px-3 py-1 text-sm bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="w-80 min-w-[20rem] max-w-xs p-4 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

export default KanbanBoard 