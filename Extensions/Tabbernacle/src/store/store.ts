import { configureStore } from '@reduxjs/toolkit'
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import workspacesReducer from './slices/workspacesSlice'
import tabsReducer from './slices/tabsSlice'
import uiReducer from './slices/uiSlice'
import authReducer from './slices/authSlice'
import searchReducer from './slices/searchSlice'
import remindersReducer from './slices/remindersSlice'
import syncReducer from './slices/syncSlice'
import onboardingReducer from './slices/onboardingSlice'

export const store = configureStore({
  reducer: {
    workspaces: workspacesReducer,
    tabs: tabsReducer,
    ui: uiReducer,
    auth: authReducer,
    search: searchReducer,
    reminders: remindersReducer,
    sync: syncReducer,
    onboarding: onboardingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.createdAt', 'payload.updatedAt'],
        // Ignore these paths in the state
        ignoredPaths: ['workspaces.workspaces', 'tabs.tabs'],
      },
    }),
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector 