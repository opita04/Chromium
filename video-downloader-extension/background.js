// Background script for video downloading functionality

// Fetch Loom video metadata
async function fetchLoomMetadata(videoId) {
  try {
    // Try to fetch from Loom's public share page
    const response = await fetch(`https://www.loom.com/share/${videoId}`);
    const html = await response.text();
    
    // Extract title from meta tags
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : null;
    
    return { title };
  } catch (error) {
    console.error('Error fetching Loom metadata:', error);
    return { title: null };
  }
}

// Fetch Wistia video thumbnail
async function fetchWistiaThumbnail(videoId) {
  try {
    // Try Wistia's oembed API
    const response = await fetch(`https://fast.wistia.com/oembed?url=https://fast.wistia.net/embed/iframe/${videoId}`);
    if (response.ok) {
      const data = await response.json();
      return { thumbnail: data.thumbnail_url || null };
    }
  } catch (error) {
    console.error('Error fetching Wistia thumbnail:', error);
  }
  return { thumbnail: null };
}

// Create and download batch file for automatic execution
async function executeAutomaticDownload(command) {
  return new Promise((resolve, reject) => {
    try {
      console.log('Creating download batch file for command:', command);

      // Create batch file content with the download command
      const batchContent = `@echo off
echo Starting video download...
echo Command: ${command}
echo.
echo Please wait while the video downloads...
echo.

REM Execute the download command
${command}

echo.
echo Download completed!
echo The video should be in: C:\\AI\\YoutubeDL\\Skool
echo.
pause
`;

      // Generate unique filename
      const timestamp = new Date().getTime();
      const batchFileName = `skool_download_${timestamp}.bat`;

      // Create blob and download
      const blob = new Blob([batchContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: url,
        filename: batchFileName,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        console.log('Batch file created and downloaded:', batchFileName);

        // Clean up the blob URL
        URL.revokeObjectURL(url);

        // Show the user where to find the file
        setTimeout(() => {
          chrome.downloads.show(downloadId);
        }, 1000);

        resolve({
          success: true,
          downloadId: downloadId,
          fileName: batchFileName,
          message: 'Batch file created! Double-click to start download.'
        });
      });

    } catch (error) {
      console.error('Error creating automatic download:', error);
      reject(error);
    }
  });
}



// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'fetchLoomMetadata') {
    fetchLoomMetadata(request.videoId)
      .then(metadata => sendResponse(metadata));
    return true;
  }
  
  if (request.action === 'fetchWistiaThumbnail') {
    fetchWistiaThumbnail(request.videoId)
      .then(result => sendResponse(result));
    return true;
  }
  
  if (request.action === 'updateBadge') {
    // Update badge for the tab that sent the message
    if (sender.tab && sender.tab.id) {
      if (request.count > 0) {
        chrome.action.setBadgeText({
          text: String(request.count),
          tabId: sender.tab.id
        });
        chrome.action.setBadgeBackgroundColor({
          color: '#4CAF50',
          tabId: sender.tab.id
        });
      } else {
        // Clear badge if no videos
        chrome.action.setBadgeText({
          text: '',
          tabId: sender.tab.id
        });
      }
    }
    sendResponse({ success: true });
  }

  if (request.action === 'executeAutomaticDownload') {
    executeAutomaticDownload(request.command)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

// Extension installed listener
chrome.runtime.onInstalled.addListener(async () => {
  // Extension is ready to use
});

// Clear badge when tab is updated (navigated away)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    // Clear badge when navigating to a new page
    chrome.action.setBadgeText({ text: '', tabId: tabId });
  }
});

// Clear badge when tab is removed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Badge is automatically cleared when tab is closed
});