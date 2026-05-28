import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Reminder } from '@/types'

interface RemindersState {
  reminders: Reminder[]
  loading: boolean
  error: string | null
}

const initialState: RemindersState = {
  reminders: [],
  loading: false,
  error: null,
}

// Async thunks
export const fetchReminders = createAsyncThunk(
  'reminders/fetchReminders',
  async () => {
    // TODO: Implement API call
    return [] as Reminder[]
  }
)

export const createReminder = createAsyncThunk(
  'reminders/createReminder',
  async (reminder: Omit<Reminder, 'id'>) => {
    // TODO: Implement API call
    const newReminder: Reminder = {
      ...reminder,
      id: Date.now().toString(),
    }
    return newReminder
  }
)

export const updateReminder = createAsyncThunk(
  'reminders/updateReminder',
  async (reminder: Partial<Reminder> & { id: string }) => {
    // TODO: Implement API call
    return reminder
  }
)

export const deleteReminder = createAsyncThunk(
  'reminders/deleteReminder',
  async (reminderId: string) => {
    // TODO: Implement API call
    return reminderId
  }
)

const remindersSlice = createSlice({
  name: 'reminders',
  initialState,
  reducers: {
    markReminderComplete: (state, action: PayloadAction<string>) => {
      const reminder = state.reminders.find(r => r.id === action.payload)
      if (reminder) {
        reminder.isCompleted = true
      }
    },
    
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch reminders
      .addCase(fetchReminders.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchReminders.fulfilled, (state, action) => {
        state.loading = false
        state.reminders = action.payload
      })
      .addCase(fetchReminders.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch reminders'
      })
      
      // Create reminder
      .addCase(createReminder.fulfilled, (state, action) => {
        state.reminders.push(action.payload)
      })
      
      // Update reminder
      .addCase(updateReminder.fulfilled, (state, action) => {
        const { id, ...updates } = action.payload
        const reminder = state.reminders.find(r => r.id === id)
        if (reminder) {
          Object.assign(reminder, updates)
        }
      })
      
      // Delete reminder
      .addCase(deleteReminder.fulfilled, (state, action) => {
        const reminderId = action.payload
        state.reminders = state.reminders.filter(r => r.id !== reminderId)
      })
  },
})

export const {
  markReminderComplete,
  clearError,
} = remindersSlice.actions

export default remindersSlice.reducer 