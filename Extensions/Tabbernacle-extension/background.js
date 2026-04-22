// Background service worker for Tabbernacle Chrome Extension

// Initialize context menus
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for saving current page
  chrome.contextMenus.create({
    id: 'saveCurrentPage',
    title: 'Save to Tabbernacle',
    contexts: ['page'],
  })

  // Create context menu for saving selected text
  chrome.contextMenus.create({
    id: 'saveSelectedText',
    title: 'Save selection to Tabbernacle',
    contexts: ['selection'],
  })

  // Create submenu for different groups
  chrome.contextMenus.create({
    id: 'saveToGroup',
    title: 'Save to group...',
    contexts: ['page', 'selection'],
  })
})

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveCurrentPage') {
    // TODO: Implement save current page functionality
    console.log('Save current page:', tab?.url)
  } else if (info.menuItemId === 'saveSelectedText') {
    // TODO: Implement save selected text functionality
    console.log('Save selected text:', info.selectionText)
  }
})

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // TODO: Update tab information in storage
    console.log('Tab updated:', tab.url)
  }
})

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // TODO: Remove tab from storage
  console.log('Tab removed:', tabId)
})

// Handle alarms for reminders
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    // TODO: Show notification for reminder
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'Tabbernacle Reminder',
      message: alarm.name.replace('reminder_', ''),
    })
  }
})

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // TODO: Handle notification click - open relevant item
  console.log('Notification clicked:', notificationId)
})

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_TABS':
      // Return current window tabs
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        sendResponse({ tabs })
      })
      return true // Keep message channel open for async response

    case 'CLOSE_TAB':
      // Close specific tab
      chrome.tabs.remove(message.tabId, () => {
        sendResponse({ success: true })
      })
      return true

    case 'CREATE_REMINDER':
      // Create alarm for reminder
      const alarmName = `reminder_${message.title}`
      chrome.alarms.create(alarmName, {
        when: message.dueDate,
      })
      sendResponse({ success: true })
      break

    default:
      sendResponse({ error: 'Unknown message type' })
  }
})

// Handle storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  // TODO: Handle storage changes for sync
  console.log('Storage changed:', changes, namespace)
})

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  // TODO: Initialize extension on startup
  console.log('Tabbernacle extension started')
})

// Handle extension update
chrome.runtime.onUpdateAvailable.addListener(() => {
  // TODO: Handle extension updates
  console.log('Extension update available')
}) 