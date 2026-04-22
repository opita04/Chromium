import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UIState {
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  activeModal: string | null
  dragState: {
    isDragging: boolean
    draggedItem: any | null
    dropTarget: string | null
  }
  loadingStates: {
    [key: string]: boolean
  }
  notifications: {
    [key: string]: {
      message: string
      type: 'success' | 'error' | 'warning' | 'info'
      timestamp: number
    }
  }
}

const initialState: UIState = {
  theme: 'system',
  sidebarCollapsed: false,
  activeModal: null,
  dragState: {
    isDragging: false,
    draggedItem: null,
    dropTarget: null,
  },
  loadingStates: {},
  notifications: {},
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'system'>) => {
      state.theme = action.payload
    },
    
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload
    },
    
    openModal: (state, action: PayloadAction<string>) => {
      state.activeModal = action.payload
    },
    
    closeModal: (state) => {
      state.activeModal = null
    },
    
    startDrag: (state, action: PayloadAction<any>) => {
      state.dragState.isDragging = true
      state.dragState.draggedItem = action.payload
      state.dragState.dropTarget = null
    },
    
    setDropTarget: (state, action: PayloadAction<string | null>) => {
      state.dragState.dropTarget = action.payload
    },
    
    endDrag: (state) => {
      state.dragState.isDragging = false
      state.dragState.draggedItem = null
      state.dragState.dropTarget = null
    },
    
    setLoading: (state, action: PayloadAction<{ key: string; loading: boolean }>) => {
      const { key, loading } = action.payload
      state.loadingStates[key] = loading
    },
    
    addNotification: (state, action: PayloadAction<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>) => {
      const { id, message, type } = action.payload
      state.notifications[id] = {
        message,
        type,
        timestamp: Date.now(),
      }
    },
    
    removeNotification: (state, action: PayloadAction<string>) => {
      const id = action.payload
      delete state.notifications[id]
    },
    
    clearNotifications: (state) => {
      state.notifications = {}
    },
  },
})

export const {
  setTheme,
  toggleSidebar,
  setSidebarCollapsed,
  openModal,
  closeModal,
  startDrag,
  setDropTarget,
  endDrag,
  setLoading,
  addNotification,
  removeNotification,
  clearNotifications,
} = uiSlice.actions

export default uiSlice.reducer 