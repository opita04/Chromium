// User and Authentication Types
export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  isGuest: boolean
  subscription?: {
    tier: 'free' | 'pro'
    expiresAt?: Date
  }
}

// Workspace Types
export interface Workspace {
  id: string
  name: string
  description?: string
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: string
  collaborators?: string[]
  settings: WorkspaceSettings
}

export interface WorkspaceSettings {
  theme: 'light' | 'dark' | 'system'
  compactMode: boolean
  showFavicons: boolean
  autoSave: boolean
}

// Category Types (Kanban Columns)
export interface Category {
  id: string
  workspaceId: string
  name: string
  emoji?: string
  color?: string
  order: number
  createdAt: Date
  updatedAt: Date
}

// Group Types (Cards within Categories)
export interface Group {
  id: string
  categoryId: string
  name: string
  emoji?: string
  color?: string
  order: number
  createdAt: Date
  updatedAt: Date
  itemCount: number
}

// Saved Item Types
export interface SavedItem {
  id: string
  groupId: string
  type: 'link' | 'note' | 'todo'
  title: string
  url?: string
  favicon?: string
  domain?: string
  content?: string
  isCompleted?: boolean
  color?: string
  reminder?: Date
  order: number
  createdAt: Date
  updatedAt: Date
}

// Tab Types
export interface Tab {
  id: number
  title: string
  url: string
  favicon?: string
  isActive: boolean
  isPinned: boolean
  windowId: number
}

// Drag and Drop Types
export interface DragItem {
  id: string
  type: 'tab' | 'item' | 'group' | 'category'
  data?: any
}

export interface DropResult {
  draggableId: string
  type: string
  source: {
    droppableId: string
    index: number
  }
  destination?: {
    droppableId: string
    index: number
  }
}

// Search Types
export interface SearchResult {
  type: 'workspace' | 'category' | 'group' | 'item'
  id: string
  title: string
  description?: string
  url?: string
  favicon?: string
  highlight: {
    title: string[]
    content?: string[]
  }
}

// Reminder Types
export interface Reminder {
  id: string
  itemId: string
  title: string
  dueDate: Date
  isCompleted: boolean
  type: 'one-time' | 'recurring'
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly'
    interval: number
  }
}

// Collaboration Types
export interface CollaborationInvite {
  id: string
  workspaceId: string
  email: string
  role: 'viewer' | 'editor' | 'admin'
  status: 'pending' | 'accepted' | 'declined'
  createdAt: Date
  expiresAt: Date
}

export interface CollaborationPresence {
  userId: string
  userName: string
  userAvatar?: string
  lastSeen: Date
  isOnline: boolean
  currentAction?: string
}

// Settings Types
export interface UserSettings {
  theme: 'light' | 'dark' | 'system'
  notifications: {
    reminders: boolean
    collaboration: boolean
    updates: boolean
  }
  privacy: {
    shareAnalytics: boolean
    allowCollaboration: boolean
  }
  shortcuts: {
    [key: string]: string
  }
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Error Types
export interface AppError {
  code: string
  message: string
  details?: any
  timestamp: Date
}

// Sync Types
export interface SyncState {
  isOnline: boolean
  lastSync: Date
  pendingChanges: number
  conflicts: SyncConflict[]
}

export interface SyncConflict {
  id: string
  type: 'item' | 'group' | 'category'
  localVersion: any
  remoteVersion: any
  resolved?: any
}

// Onboarding Types
export interface OnboardingStep {
  id: string
  title: string
  description: string
  component: string
  isRequired: boolean
  isCompleted: boolean
}

export interface OnboardingState {
  currentStep: number
  steps: OnboardingStep[]
  isCompleted: boolean
  demoWorkspaceId?: string
}

// Toast Types
export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
} 