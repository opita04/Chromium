import React, { useEffect, useState } from 'react';

const ActiveTabs = () => {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);

  useEffect(() => {
    chrome.tabs.query({}, (tabs) => {
      setTabs(tabs);
    });
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Active Tabs ({tabs.length})</h2>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.id} className="flex items-center mb-2 p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
            {tab.favIconUrl && <img src={tab.favIconUrl} alt="" className="w-4 h-4 mr-2" />}
            <span className="truncate text-sm">{tab.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActiveTabs;
