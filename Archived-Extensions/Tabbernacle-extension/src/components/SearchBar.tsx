import React from 'react'
import { Search } from 'lucide-react'

const SearchBar: React.FC = () => {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-neutral-400" />
      </div>
      <input
        type="text"
        placeholder="Search tabs, notes, and groups..."
        className="pl-10 pr-4 py-2 w-64 bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
    </div>
  )
}

export default SearchBar 