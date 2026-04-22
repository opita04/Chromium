import React from 'react';

import ActiveTabs from './ActiveTabs';

const App = () => {
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Active Tabs Sidebar */}
      <div className="w-64 h-full bg-white dark:bg-gray-800 p-4 border-r border-gray-200 dark:border-gray-700">
        <ActiveTabs />
      </div>

      {/* Main Workspace */}
      <main className="flex-1 p-6">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Workspace</h1>
          {/* Workspace switcher and other controls will go here */}
        </header>
        <div className="flex gap-6">
          {/* Kanban-style columns will go here */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow w-80">
            <h3 className="font-semibold mb-4">Category 1</h3>
            {/* Groups will go here */}
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow w-80">
            <h3 className="font-semibold mb-4">Category 2</h3>
            {/* Groups will go here */}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;