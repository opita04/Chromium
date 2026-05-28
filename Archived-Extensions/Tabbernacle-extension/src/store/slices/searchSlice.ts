import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { SearchResult } from '@/types'

interface SearchState {
  query: string
  results: SearchResult[]
  loading: boolean
  error: string | null
  isOpen: boolean
}

const initialState: SearchState = {
  query: '',
  results: [],
  loading: false,
  error: null,
  isOpen: false,
}

// Async thunk
export const performSearch = createAsyncThunk(
  'search/performSearch',
  async (_query: string) => {
    // TODO: Implement search functionality
    return [] as SearchResult[]
  }
)

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload
    },
    
    setResults: (state, action: PayloadAction<SearchResult[]>) => {
      state.results = action.payload
    },
    
    openSearch: (state) => {
      state.isOpen = true
    },
    
    closeSearch: (state) => {
      state.isOpen = false
      state.query = ''
      state.results = []
    },
    
    clearSearch: (state) => {
      state.query = ''
      state.results = []
    },
    
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(performSearch.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(performSearch.fulfilled, (state, action) => {
        state.loading = false
        state.results = action.payload
      })
      .addCase(performSearch.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Search failed'
      })
  },
})

export const {
  setQuery,
  setResults,
  openSearch,
  closeSearch,
  clearSearch,
  clearError,
} = searchSlice.actions

export default searchSlice.reducer 