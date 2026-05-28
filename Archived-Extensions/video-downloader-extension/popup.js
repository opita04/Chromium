// Popup script - handles video downloading

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup script loaded');

  const loadingDiv = document.getElementById('loading');
  const mainContent = document.getElementById('main-content');
  const clearVideosBtn = document.getElementById('clear-videos-btn');

  // Show loading state
  loadingDiv.style.display = 'block';

  try {
    loadingDiv.style.display = 'none';
    // Show main content
    mainContent.style.display = 'block';
    // Automatically extract videos
    await extractVideos();
  } catch (error) {
    console.error('Error initializing popup:', error);
    loadingDiv.style.display = 'none';
    mainContent.style.display = 'block';
    await extractVideos();
  }



  // Handle clear videos
  clearVideosBtn.addEventListener('click', async () => {
    // Clear stored videos
    await chrome.storage.local.remove(['detectedVideos']);
    
    // Clear badge
    chrome.action.setBadgeText({ text: '' });
    
    // Update UI to show no videos
    const videoResult = document.getElementById('video-result');
    videoResult.innerHTML = `
      <div style="text-align: center; color: #6b7280; padding: 20px;">
        <p style="font-size: 16px; margin-bottom: 8px;">Videos cleared!</p>
        <p style="font-size: 14px;">Navigate to a page with videos to detect new ones.</p>
      </div>
    `;
    
    // Optional: Refresh the page to re-detect videos
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.includes('skool.com')) {
      chrome.tabs.reload(tab.id);
    }
  });

  // Extract videos function
  async function extractVideos() {
    const videoResult = document.getElementById('video-result');
    
    // Clear any previous results first
    videoResult.innerHTML = `
      <div style="text-align: center; color: #6b7280; padding: 20px;">
        Checking for videos...
      </div>
    `;
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('skool.com')) {
      videoResult.innerHTML = `
        <div style="padding: 12px; background: #fee2e2; color: #991b1b; border-radius: 8px;">
          This extension only works on Skool.com pages
        </div>
      `;
      return;
    }
    
    // Get videos from storage instead of messaging content script
    chrome.storage.local.get(['detectedVideos'], async (result) => {
        const videos = result.detectedVideos || [];
        
        if (videos.length > 0) {
          // Fetch metadata for videos
          const videosWithMetadata = await Promise.all(
            videos.map(async (video) => {
              // Fetch Loom metadata
              if (video.type === 'loom' && video.videoId) {
                const metadata = await chrome.runtime.sendMessage({
                  action: 'fetchLoomMetadata',
                  videoId: video.videoId
                });
                if (metadata.title) {
                  video.title = metadata.title;
                }
              }
              
              // Fetch Wistia thumbnail if missing
              if (video.type === 'wistia' && video.videoId && !video.thumbnail) {
                const result = await chrome.runtime.sendMessage({
                  action: 'fetchWistiaThumbnail',
                  videoId: video.videoId
                });
                if (result.thumbnail) {
                  video.thumbnail = result.thumbnail;
                  console.log('📺 Fetched Wistia thumbnail:', result.thumbnail);
                }
              }
              
              return video;
            })
          );
          
          let videosHtml = '';
          
          videosWithMetadata.forEach((video, index) => {
            console.log('📺 Processing video:', video);
            console.log('📺 Video thumbnail:', video.thumbnail);
            
            // Generate download command with custom yt-dlp path
            const downloadCmd = generateDownloadCommand(video);

            // Escape command for HTML attributes
            const downloadCmdEscaped = downloadCmd.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

            // Generate thumbnail HTML
            let thumbnailHtml = '';
            
            if (video.thumbnail) {
              console.log('📺 Creating thumbnail HTML for URL:', video.thumbnail);
              thumbnailHtml = `
                <div style="margin-bottom: 12px; text-align: center;">
                  <img src="${video.thumbnail}" 
                       alt="${video.title}" 
                       style="max-width: 100%; height: auto; max-height: 180px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"
                       onerror="console.error('Failed to load thumbnail'); this.style.display='none';">
                </div>
              `;
            } else {
              // Show a nice placeholder with video icon
              const videoIcons = {
                youtube: '📺',
                vimeo: '🎬',
                loom: '🎥',
                wistia: '🎞️',
                skool: '🎓'
              };
              const icon = videoIcons[video.type] || '📹';
              
              thumbnailHtml = `
                <div style="margin-bottom: 12px; text-align: center;">
                  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              padding: 40px; 
                              border-radius: 8px; 
                              box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="font-size: 48px; margin-bottom: 8px;">${icon}</div>
                    <div style="color: white; font-size: 14px; font-weight: 500;">
                      ${video.type ? video.type.charAt(0).toUpperCase() + video.type.slice(1) : 'Video'} Ready
                    </div>
                  </div>
                </div>
              `;
            }
            
            videosHtml += `
              <div style="margin-bottom: 16px; padding: 16px; background: #f9fafb; border-radius: 8px;">
                ${thumbnailHtml}
                <p style="font-weight: 600; margin-bottom: 8px;">${video.title}</p>
                <p style="font-size: 12px; color: #6b7280; margin-bottom: 12px;">Platform: ${video.type || 'unknown'}</p>
                
                <div style="display: flex; gap: 12px; justify-content: center;">
                  <button class="button download-btn" data-command="${downloadCmdEscaped}" style="padding: 8px 20px; background: #059669;">
                    Create Download File
                  </button>
                </div>
                
                ${video.type === 'vimeo' ? `
                  <p style="font-size: 11px; color: #dc2626; margin-top: 8px; text-align: center;">
                    ⚠️ Vimeo videos may require additional authentication. If you get an OAuth error, the video may be private.
                  </p>
                ` : ''}
                
                ${video.type === 'youtube' ? `
                  <p style="font-size: 11px; color: #059669; margin-top: 8px; text-align: center;">
                    ✓ Will download in best quality (up to 1080p)
                  </p>
                ` : ''}
              </div>
            `;
          });
          
          videoResult.innerHTML = `
            <div>
              ${videosHtml}
              
              <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #111827;">How to download:</h3>
                <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #4b5563;">
                  <li style="margin-bottom: 6px;">Click the 'Create Download File' button</li>
                  <li style="margin-bottom: 6px;">A batch file (.bat) will be created and downloaded</li>
                  <li style="margin-bottom: 6px;">Find the batch file in your Downloads folder and double-click it</li>
                  <li>The download will run automatically!</li>
                </ol>
                <p style="font-size: 12px; color: #059669; margin-top: 8px; font-weight: 500;">
                  🎯 Videos will be saved to: C:\\AI\\YoutubeDL\\Skool
                </p>
              </div>
              
              <p style="font-size: 12px; color: #6b7280; margin-top: 12px; text-align: center;">
                Need help? Visit 
                <a href="https://serp.ly/@serp/community/support" target="_blank" style="color: #3b82f6;">support</a>
              </p>
            </div>
          `;
          
          // Add event listeners to download buttons
          document.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', function() {
              const command = this.getAttribute('data-command');
              // Decode HTML entities
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = command;
              const decodedCommand = tempDiv.textContent || tempDiv.innerText || '';

              console.log('Executing download command:', decodedCommand);

              // Disable button and show creating state
              const originalText = this.textContent;
              this.disabled = true;
              this.textContent = 'Creating File...';
              this.style.background = '#047857';

              // Execute download automatically
              executeAutomaticDownload(decodedCommand).then((result) => {
                if (result.success) {
                  this.textContent = 'Batch File Created!';
                  this.style.background = '#10b981';

                  // Show success message with file info
                  setTimeout(() => {
                    this.disabled = false;
                    this.textContent = originalText;
                    this.style.background = '#059669';
                    showBatchFileSuccess(result);
                  }, 3000);
                } else {
                  this.textContent = 'Creation Failed';
                  this.style.background = '#dc2626';
                  setTimeout(() => {
                    this.disabled = false;
                    this.textContent = originalText;
                    this.style.background = '#059669';
                  }, 3000);
                }
              }).catch(error => {
                console.error('Download failed:', error);
                this.textContent = 'Download Failed';
                this.style.background = '#dc2626';
                setTimeout(() => {
                  this.disabled = false;
                  this.textContent = originalText;
                  this.style.background = '#059669';
                }, 3000);
              });
            });
          });
        } else {
          videoResult.innerHTML = `
            <div style="padding: 12px; background: #fef3c7; color: #92400e; border-radius: 8px;">
              No videos found on this page. Make sure you're on a Skool page with a video.
            </div>
          `;
        }
        
    });
  }
  
  // Provider-specific download commands with custom yt-dlp.exe path
  const providerCommands = {
    youtube: {
      getCommand: (url) => {
        const format = '-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" --merge-output-format mp4';
        const ytDlpPath = 'C:\\AI\\YoutubeDL\\yt-dlp.exe';
        const downloadPath = 'C:\\AI\\YoutubeDL\\Skool';
        return `"${ytDlpPath}" ${format} -P "${downloadPath}" "${url}"`;
      }
    },
    vimeo: {
      getCommand: (url) => {
        const headers = '--add-header "Referer: https://vimeo.com"';
        const ytDlpPath = 'C:\\AI\\YoutubeDL\\yt-dlp.exe';
        const downloadPath = 'C:\\AI\\YoutubeDL\\Skool';
        return `"${ytDlpPath}" ${headers} -P "${downloadPath}" "${url}"`;
      }
    },
    loom: {
      getCommand: (url) => {
        const ytDlpPath = 'C:\\AI\\YoutubeDL\\yt-dlp.exe';
        const downloadPath = 'C:\\AI\\YoutubeDL\\Skool';
        return `"${ytDlpPath}" -P "${downloadPath}" "${url}"`;
      }
    },
    wistia: {
      getCommand: (url) => {
        const ytDlpPath = 'C:\\AI\\YoutubeDL\\yt-dlp.exe';
        const downloadPath = 'C:\\AI\\YoutubeDL\\Skool';
        return `"${ytDlpPath}" -P "${downloadPath}" "${url}"`;
      }
    },
    skool: {
      getCommand: (url) => {
        const ytDlpPath = 'C:\\AI\\YoutubeDL\\yt-dlp.exe';
        const downloadPath = 'C:\\AI\\YoutubeDL\\Skool';
        return `"${ytDlpPath}" -P "${downloadPath}" "${url}"`;
      }
    }
  };

  // Generate platform-specific download commands with custom yt-dlp path
  function generateDownloadCommand(video) {
    // Use provider-specific command if available
    const providerName = video.providerName || video.type;
    if (providerName && providerCommands[providerName]) {
      return providerCommands[providerName].getCommand(video.url);
    }

    // Fallback to basic command with custom paths
    const ytDlpPath = 'C:\\AI\\YoutubeDL\\yt-dlp.exe';
    const downloadPath = 'C:\\AI\\YoutubeDL\\Skool';
    return `"${ytDlpPath}" -P "${downloadPath}" "${video.url}"`;
  }

  // Execute automatic download using Windows shell
  async function executeAutomaticDownload(command) {
    return new Promise((resolve, reject) => {
      try {
        // Send to background script for automatic execution
        chrome.runtime.sendMessage({
          action: 'executeAutomaticDownload',
          command: command
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response && response.success) {
            console.log('Automatic download started successfully');
            resolve();
          } else {
            console.error('Automatic download failed:', response?.error);
            reject(new Error(response?.error || 'Download failed'));
          }
        });
      } catch (error) {
        console.error('Error starting automatic download:', error);
        reject(error);
      }
    });
  }

  // Show success message for batch file creation
  function showBatchFileSuccess(result) {
    // Create a success popup
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    successDiv.innerHTML = `
      <h3 style="margin: 0 0 12px 0; color: #059669;">✅ Download Batch File Created!</h3>
      <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 14px;">
        A batch file has been created and downloaded to start your video download automatically.
      </p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
        <strong style="color: #166534;">File:</strong> ${result.fileName || 'skool_download_*.bat'}<br>
        <strong style="color: #166534;">Location:</strong> Your Downloads folder
      </div>
      <ol style="margin: 0 0 16px 0; padding-left: 20px; color: #4b5563; font-size: 14px;">
        <li style="margin-bottom: 6px;">Find the <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">.bat</code> file in your Downloads folder</li>
        <li style="margin-bottom: 6px;"><strong>Double-click</strong> the batch file to start the download</li>
        <li>The download will run automatically and save to: <strong>C:\\AI\\YoutubeDL\\Skool</strong></li>
      </ol>
      <p style="margin: 0 0 16px 0; color: #059669; font-size: 13px; font-weight: 500;">
        🎯 The batch file contains your yt-dlp command and will execute it automatically!
      </p>
      <button style="background: #059669; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; width: 100%;"
              onclick="this.parentElement.remove();">
        Got it!
      </button>
    `;

    document.body.appendChild(successDiv);

    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (successDiv.parentElement) {
        successDiv.remove();
      }
    }, 30000);
  }


});