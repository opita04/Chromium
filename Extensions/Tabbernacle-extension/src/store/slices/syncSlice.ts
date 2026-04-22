import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { SyncState, SyncConflict } from '@/types'

interface SyncSliceState extends SyncState {
  isInitialized: boolean
}

const initialState: SyncSliceState = {
  isOnline: navigator.onLine,
  lastSync: new Date(),
  pendingChanges: 0,
  conflicts: [],
  isInitialized: false,
}

// Async thunks
export const initializeSync = createAsyncThunk(
  'sync/initializeSync',
  async () => {
    // TODO: Implement sync initialization
    return true
  }
)

export const syncData = createAsyncThunk(
  'sync/syncData',
  async () => {
    // TODO: Implement data sync
    return new Date()
  }
)

export const resolveConflict = createAsyncThunk(
  'sync/resolveConflict',
  async ({ conflictId, resolution }: { conflictId: string; resolution: any }) => {
    // TODO: Implement conflict resolution
    return { conflictId, resolution }
  }
)

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload
    },
    
    setLastSync: (state, action: PayloadAction<Date>) => {
      state.lastSync = action.payload
    },
    
    addPendingChange: (state) => {
      state.pendingChanges += 1
    },
    
    removePendingChange: (state) => {
      state.pendingChanges = Math.max(0, state.pendingChanges - 1)
    },
    
    addConflict: (state, action: PayloadAction<SyncConflict>) => {
      state.conflicts.push(action.payload)
    },
    
    removeConflict: (state, action: PayloadAction<string>) => {
      const conflictId = action.payload
      state.conflicts = state.conflicts.filter(c => c.id !== conflictId)
    },
    
    clearConflicts: (state) => {
      state.conflicts = []
    },
    
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize sync
      .addCase(initializeSync.fulfilled, (state) => {
        state.isInitialized = true
      })
      
      // Sync data
      .addCase(syncData.fulfilled, (state, action) => {
        state.lastSync = action.payload
        state.pendingChanges = 0
      })
      
      // Resolve conflict
      .addCase(resolveConflict.fulfilled, (state, action) => {
        const { conflictId } = action.payload
        state.conflicts = state.conflicts.filter(c => c.id !== conflictId)
      })
  },
})

export const {
  setOnlineStatus,
  setLastSync,
  addPendingChange,
  removePendingChange,
  addConflict,
  removeConflict,
  clearConflicts,
  setInitialized,
} = syncSlice.actions

export default syncSlice.reducer 