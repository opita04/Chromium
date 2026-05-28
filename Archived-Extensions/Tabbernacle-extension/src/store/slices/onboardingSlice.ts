import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { OnboardingState, OnboardingStep } from '@/types'

const defaultSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Tabbernacle',
    description: 'Let\'s get you started with organizing your tabs and bookmarks.',
    component: 'WelcomeStep',
    isRequired: true,
    isCompleted: false,
  },
  {
    id: 'demo-workspace',
    title: 'Demo Workspace',
    description: 'Explore a pre-populated workspace to see how Tabbernacle works.',
    component: 'DemoWorkspaceStep',
    isRequired: false,
    isCompleted: false,
  },
  {
    id: 'drag-drop',
    title: 'Drag and Drop',
    description: 'Learn how to save tabs by dragging them to your workspace.',
    component: 'DragDropStep',
    isRequired: true,
    isCompleted: false,
  },
  {
    id: 'workspaces',
    title: 'Workspaces',
    description: 'Create and organize your content into different workspaces.',
    component: 'WorkspacesStep',
    isRequired: false,
    isCompleted: false,
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Start organizing your tabs and bookmarks with Tabbernacle.',
    component: 'CompleteStep',
    isRequired: true,
    isCompleted: false,
  },
]

const initialState: OnboardingState = {
  currentStep: 0,
  steps: defaultSteps,
  isCompleted: false,
  demoWorkspaceId: undefined,
}

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {
    nextStep: (state) => {
      if (state.currentStep < state.steps.length - 1) {
        state.currentStep += 1
      }
    },
    
    previousStep: (state) => {
      if (state.currentStep > 0) {
        state.currentStep -= 1
      }
    },
    
    goToStep: (state, action: PayloadAction<number>) => {
      const stepIndex = action.payload
      if (stepIndex >= 0 && stepIndex < state.steps.length) {
        state.currentStep = stepIndex
      }
    },
    
    completeStep: (state, action: PayloadAction<string>) => {
      const stepId = action.payload
      const step = state.steps.find(s => s.id === stepId)
      if (step) {
        step.isCompleted = true
      }
    },
    
    completeOnboarding: (state) => {
      state.isCompleted = true
      state.steps.forEach(step => {
        step.isCompleted = true
      })
    },
    
    setDemoWorkspaceId: (state, action: PayloadAction<string>) => {
      state.demoWorkspaceId = action.payload
    },
    
    resetOnboarding: (state) => {
      state.currentStep = 0
      state.isCompleted = false
      state.demoWorkspaceId = undefined
      state.steps.forEach(step => {
        step.isCompleted = false
      })
    },
    
    skipOnboarding: (state) => {
      state.isCompleted = true
    },
  },
})

export const {
  nextStep,
  previousStep,
  goToStep,
  completeStep,
  completeOnboarding,
  setDemoWorkspaceId,
  resetOnboarding,
  skipOnboarding,
} = onboardingSlice.actions

export default onboardingSlice.reducer 