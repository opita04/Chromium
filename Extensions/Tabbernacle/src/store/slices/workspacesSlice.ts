import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Workspace, Category, Group, SavedItem } from '@/types'

interface WorkspacesState {
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  categories: Category[]
  groups: Group[]
  items: SavedItem[]
  loading: boolean
  error: string | null
}

// Demo data for testing
const demoCategories: Category[] = [
  {
    id: 'cat-1',
    workspaceId: 'demo-workspace',
    name: 'To Do',
    emoji: '📝',
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'cat-2',
    workspaceId: 'demo-workspace',
    name: 'In Progress',
    emoji: '🔄',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'cat-3',
    workspaceId: 'demo-workspace',
    name: 'Done',
    emoji: '✅',
    order: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const demoGroups: Group[] = [
  {
    id: 'group-1',
    categoryId: 'cat-1',
    name: 'Research Project',
    emoji: '🔬',
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    itemCount: 3,
  },
  {
    id: 'group-2',
    categoryId: 'cat-1',
    name: 'Design Ideas',
    emoji: '🎨',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    itemCount: 2,
  },
  {
    id: 'group-3',
    categoryId: 'cat-2',
    name: 'Development Tasks',
    emoji: '💻',
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    itemCount: 4,
  },
  {
    id: 'group-4',
    categoryId: 'cat-3',
    name: 'Completed Features',
    emoji: '🚀',
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    itemCount: 1,
  },
]

const initialState: WorkspacesState = {
  workspaces: [],
  currentWorkspaceId: null,
  categories: demoCategories,
  groups: demoGroups,
  items: [],
  loading: false,
  error: null,
}

// Async thunks
export const fetchWorkspaces = createAsyncThunk(
  'workspaces/fetchWorkspaces',
  async () => {
    // TODO: Implement API call
    return []
  }
)

export const createWorkspace = createAsyncThunk(
  'workspaces/createWorkspace',
  async (workspace: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>) => {
    // TODO: Implement API call
    const newWorkspace: Workspace = {
      ...workspace,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return newWorkspace
  }
)

export const createCategory = createAsyncThunk(
  'workspaces/createCategory',
  async (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => {
    // TODO: Implement API call
    const newCategory: Category = {
      ...category,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return newCategory
  }
)

export const createGroup = createAsyncThunk(
  'workspaces/createGroup',
  async (group: Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'itemCount'>) => {
    // TODO: Implement API call
    const newGroup: Group = {
      ...group,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
      itemCount: 0,
    }
    return newGroup
  }
)

export const saveItem = createAsyncThunk(
  'workspaces/saveItem',
  async (item: Omit<SavedItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    // TODO: Implement API call
    const newItem: SavedItem = {
      ...item,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return newItem
  }
)

const workspacesSlice = createSlice({
  name: 'workspaces',
  initialState,
  reducers: {
    setCurrentWorkspace: (state, action: PayloadAction<string>) => {
      state.currentWorkspaceId = action.payload
    },
    
    updateCategoryOrder: (state, action: PayloadAction<{ categoryId: string; newOrder: number }>) => {
      const { categoryId, newOrder } = action.payload
      const category = state.categories.find(c => c.id === categoryId)
      if (category) {
        category.order = newOrder
        category.updatedAt = new Date()
      }
    },
    
    updateGroupOrder: (state, action: PayloadAction<{ groupId: string; newOrder: number; categoryId?: string }>) => {
      const { groupId, newOrder, categoryId } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (group) {
        group.order = newOrder
        if (categoryId) {
          group.categoryId = categoryId
        }
        group.updatedAt = new Date()
      }
    },
    
    updateItemOrder: (state, action: PayloadAction<{ itemId: string; newOrder: number; groupId?: string }>) => {
      const { itemId, newOrder, groupId } = action.payload
      const item = state.items.find(i => i.id === itemId)
      if (item) {
        item.order = newOrder
        if (groupId) {
          item.groupId = groupId
        }
        item.updatedAt = new Date()
      }
    },
    
    updateItem: (state, action: PayloadAction<Partial<SavedItem> & { id: string }>) => {
      const { id, ...updates } = action.payload
      const item = state.items.find(i => i.id === id)
      if (item) {
        Object.assign(item, updates, { updatedAt: new Date() })
      }
    },
    
    deleteItem: (state, action: PayloadAction<string>) => {
      const itemId = action.payload
      state.items = state.items.filter(item => item.id !== itemId)
    },
    
    deleteGroup: (state, action: PayloadAction<string>) => {
      const groupId = action.payload
      state.groups = state.groups.filter(group => group.id !== groupId)
      state.items = state.items.filter(item => item.groupId !== groupId)
    },
    
    deleteCategory: (state, action: PayloadAction<string>) => {
      const categoryId = action.payload
      state.categories = state.categories.filter(category => category.id !== categoryId)
      const groupsToDelete = state.groups.filter(group => group.categoryId === categoryId)
      const groupIds = groupsToDelete.map(group => group.id)
      state.groups = state.groups.filter(group => group.categoryId !== categoryId)
      state.items = state.items.filter(item => !groupIds.includes(item.groupId))
    },
    
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch workspaces
      .addCase(fetchWorkspaces.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.loading = false
        state.workspaces = action.payload
      })
      .addCase(fetchWorkspaces.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch workspaces'
      })
      
      // Create workspace
      .addCase(createWorkspace.fulfilled, (state, action) => {
        state.workspaces.push(action.payload)
        if (!state.currentWorkspaceId) {
          state.currentWorkspaceId = action.payload.id
        }
      })
      
      // Create category
      .addCase(createCategory.fulfilled, (state, action) => {
        state.categories.push(action.payload)
      })
      
      // Create group
      .addCase(createGroup.fulfilled, (state, action) => {
        state.groups.push(action.payload)
      })
      
      // Save item
      .addCase(saveItem.fulfilled, (state, action) => {
        state.items.push(action.payload)
        // Update group item count
        const group = state.groups.find(g => g.id === action.payload.groupId)
        if (group) {
          group.itemCount += 1
          group.updatedAt = new Date()
        }
      })
  },
})

export const {
  setCurrentWorkspace,
  updateCategoryOrder,
  updateGroupOrder,
  updateItemOrder,
  updateItem,
  deleteItem,
  deleteGroup,
  deleteCategory,
  clearError,
} = workspacesSlice.actions

export default workspacesSlice.reducer 