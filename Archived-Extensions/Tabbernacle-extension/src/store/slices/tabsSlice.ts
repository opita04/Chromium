import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Tab } from '@/types'

interface TabsState {
  tabs: Tab[]
  loading: boolean
  error: string | null
}

const initialState: TabsState = {
  tabs: [],
  loading: false,
  error: null,
}

// Mock tabs for development
const mockTabs: Tab[] = [
  {
    id: 1,
    title: 'Tabbernacle - New Tab',
    url: 'chrome://newtab/',
    favicon: 'https://via.placeholder.com/16',
    isActive: true,
    isPinned: false,
    windowId: 1,
  },
  {
    id: 2,
    title: 'GitHub - Build software better, together',
    url: 'https://github.com/',
    favicon: 'https://github.com/favicon.ico',
    isActive: false,
    isPinned: false,
    windowId: 1,
  },
  {
    id: 3,
    title: 'Stack Overflow - Where Developers Learn, Share, & Build Careers',
    url: 'https://stackoverflow.com/',
    favicon: 'https://stackoverflow.com/favicon.ico',
    isActive: false,
    isPinned: false,
    windowId: 1,
  },
  {
    id: 4,
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org/',
    favicon: 'https://developer.mozilla.org/favicon.ico',
    isActive: false,
    isPinned: false,
    windowId: 1,
  },
]

// Async thunks
export const fetchTabs = createAsyncThunk(
  'tabs/fetchTabs',
  async () => {
    // Check if Chrome API is available (extension context)
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true })
        return tabs.map(tab => ({
          id: tab.id!,
          title: tab.title || '',
          url: tab.url || '',
          favicon: tab.favIconUrl,
          isActive: tab.active,
          isPinned: tab.pinned,
          windowId: tab.windowId,
        })) as Tab[]
      } catch (error) {
        console.warn('Chrome API not available, using mock data:', error)
        return mockTabs
      }
    } else {
      // Return mock data for development
      console.log('Using mock tabs for development')
      return mockTabs
    }
  }
)

export const closeTab = createAsyncThunk(
  'tabs/closeTab',
  async (tabId: number) => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      await chrome.tabs.remove(tabId)
    }
    return tabId
  }
)

export const closeMultipleTabs = createAsyncThunk(
  'tabs/closeMultipleTabs',
  async (tabIds: number[]) => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      await chrome.tabs.remove(tabIds)
    }
    return tabIds
  }
)

const tabsSlice = createSlice({
  name: 'tabs',
  initialState,
  reducers: {
    addTab: (state, action: PayloadAction<Tab>) => {
      state.tabs.push(action.payload)
    },
    
    updateTab: (state, action: PayloadAction<Partial<Tab> & { id: number }>) => {
      const { id, ...updates } = action.payload
      const tab = state.tabs.find(t => t.id === id)
      if (tab) {
        Object.assign(tab, updates)
      }
    },
    
    removeTab: (state, action: PayloadAction<number>) => {
      const tabId = action.payload
      state.tabs = state.tabs.filter(tab => tab.id !== tabId)
    },
    
    setActiveTab: (state, action: PayloadAction<number>) => {
      const tabId = action.payload
      state.tabs.forEach(tab => {
        tab.isActive = tab.id === tabId
      })
    },
    
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch tabs
      .addCase(fetchTabs.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchTabs.fulfilled, (state, action) => {
        state.loading = false
        state.tabs = action.payload
      })
      .addCase(fetchTabs.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch tabs'
      })
      
      // Close tab
      .addCase(closeTab.fulfilled, (state, action) => {
        const tabId = action.payload
        state.tabs = state.tabs.filter(tab => tab.id !== tabId)
      })
      
      // Close multiple tabs
      .addCase(closeMultipleTabs.fulfilled, (state, action) => {
        const tabIds = action.payload
        state.tabs = state.tabs.filter(tab => !tabIds.includes(tab.id))
      })
  },
})

export const {
  addTab,
  updateTab,
  removeTab,
  setActiveTab,
  clearError,
} = tabsSlice.actions

export default tabsSlice.reducer 