import React from 'react'
import { useAppDispatch } from '@/store/store'
import { completeOnboarding } from '@/store/slices/onboardingSlice'

const Onboarding: React.FC = () => {
  const dispatch = useAppDispatch()

  const handleComplete = () => {
    dispatch(completeOnboarding())
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
          Welcome to Tabbernacle
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Your new tab page replacement with session management, visual bookmark organization, and collaboration tools.
        </p>
        <button
          onClick={handleComplete}
          className="w-full btn-primary"
        >
          Get Started
        </button>
      </div>
    </div>
  )
}

export default Onboarding 