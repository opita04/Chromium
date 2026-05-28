import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
}

// Async thunks
export const signInWithGoogle = createAsyncThunk(
  'auth/signInWithGoogle',
  async () => {
    // TODO: Implement Google OAuth
    return null as User | null
  }
)

export const signInWithEmail = createAsyncThunk(
  'auth/signInWithEmail',
  async ({ email: _email, password: _password }: { email: string; password: string }) => {
    // TODO: Implement email/password authentication
    return null as User | null
  }
)

export const signUpWithEmail = createAsyncThunk(
  'auth/signUpWithEmail',
  async ({ email: _email, password: _password, name: _name }: { email: string; password: string; name: string }) => {
    // TODO: Implement email/password registration
    return null as User | null
  }
)

export const signOut = createAsyncThunk(
  'auth/signOut',
  async () => {
    // TODO: Implement sign out
    return null
  }
)

export const continueAsGuest = createAsyncThunk(
  'auth/continueAsGuest',
  async () => {
    const guestUser: User = {
      id: 'guest-' + Date.now(),
      email: 'guest@tabbernacle.local',
      name: 'Guest User',
      isGuest: true,
    }
    return guestUser
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload
      state.isAuthenticated = !!action.payload
    },
    
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
      }
    },
    
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Sign in with Google
      .addCase(signInWithGoogle.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(signInWithGoogle.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
        state.isAuthenticated = !!action.payload
      })
      .addCase(signInWithGoogle.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to sign in with Google'
      })
      
      // Sign in with email
      .addCase(signInWithEmail.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(signInWithEmail.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
        state.isAuthenticated = !!action.payload
      })
      .addCase(signInWithEmail.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to sign in'
      })
      
      // Sign up with email
      .addCase(signUpWithEmail.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(signUpWithEmail.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
        state.isAuthenticated = !!action.payload
      })
      .addCase(signUpWithEmail.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to sign up'
      })
      
      // Sign out
      .addCase(signOut.fulfilled, (state) => {
        state.user = null
        state.isAuthenticated = false
      })
      
      // Continue as guest
      .addCase(continueAsGuest.fulfilled, (state, action) => {
        state.user = action.payload
        state.isAuthenticated = true
      })
  },
})

export const {
  setUser,
  updateUser,
  clearError,
} = authSlice.actions

export default authSlice.reducer 