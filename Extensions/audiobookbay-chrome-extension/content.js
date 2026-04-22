// Content script for AudiobookBay pages
class AudiobookBayEnhancer {
    constructor() {
        this.settings = null;
        this.isAudiobookBayPage = false;
        this.init();
    }

    async init() {
        // Load settings
        await this.loadSettings();
        
        // Check if this is an AudiobookBay page
        if (this.checkIfAudiobookBayPage()) {
            this.isAudiobookBayPage = true;
            this.enhancePage();
        }
        
        // Listen for settings updates
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'settingsUpdated') {
                this.loadSettings();
            }
        });
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                'audiobookbayDomains',
                'downloadClient',
                'clientHost',
                'clientPort',
                'clientScheme',
                'clientUsername',
                'clientPassword',
                'downloadCategory',
                'savePathBase',
                'pageLimit'
            ]);
            
            this.settings = {
                audiobookbayDomains: result.audiobookbayDomains || ['audiobookbay.lu', 'audiobookbay.is'],
                downloadClient: result.downloadClient || 'qbittorrent',
                clientHost: result.clientHost || 'localhost',
                clientPort: result.clientPort || 8080,
                clientScheme: result.clientScheme || 'http',
                clientUsername: result.clientUsername || 'admin',
                clientPassword: result.clientPassword || '',
                downloadCategory: result.downloadCategory || 'Audiobookbay-Audiobooks',
                savePathBase: result.savePathBase || '/audiobooks',
                pageLimit: result.pageLimit || 5
            };
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    checkIfAudiobookBayPage() {
        const hostname = window.location.hostname.toLowerCase();
        
        // Remove www. prefix if present
        const cleanHostname = hostname.replace(/^www\./, '');
        
        // Check if current domain matches any configured AudiobookBay domain
        return this.settings && this.settings.audiobookbayDomains.some(domain => 
            cleanHostname === domain.toLowerCase()
        );
    }

    enhancePage() {
        // Add CSS for our enhancements
        this.addCustomCSS();
        
        // Detect page type and enhance accordingly
        if (this.isSearchPage()) {
            this.enhanceSearchPage();
        } else if (this.isDetailPage()) {
            this.enhanceDetailPage();
        }
        
        // Add floating search widget
        this.addFloatingSearch();
        
        console.log('AudiobookBay page enhanced by extension');
    }

    isSearchPage() {
        // Check if this is a search results page
        return document.querySelector('.post') !== null || 
               window.location.search.includes('s=') ||
               window.location.pathname.includes('/page/');
    }

    isDetailPage() {
        // Check if this is a detail page with torrent info
        const infoHashElement = document.querySelector('td');
        if (infoHashElement) {
            const text = infoHashElement.textContent;
            return text && text.toLowerCase().includes('info hash');
        }
        return false;
    }

    enhanceSearchPage() {
        // Find all post elements (search results)
        const posts = document.querySelectorAll('.post');
        
        posts.forEach((post, index) => {
            this.enhanceSearchResult(post, index);
        });
        
        // Add bulk download options
        this.addBulkDownloadOptions();
    }

    enhanceSearchResult(post, index) {
        try {
            const titleElement = post.querySelector('.postTitle > h2 > a');
            const imageElement = post.querySelector('img');
            
            if (!titleElement) return;
            
            const title = titleElement.textContent.trim();
            const link = titleElement.getAttribute('href');
            const fullLink = link.startsWith('http') ? link : `https://${window.location.hostname}${link}`;
            const coverSrc = imageElement ? imageElement.getAttribute('src') : null;
            
            // Create enhanced controls container
            const controlsContainer = document.createElement('div');
            controlsContainer.className = 'abb-extension-controls';
            
            // Add download button
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'abb-download-btn';
            downloadBtn.textContent = '⬇️ Download to Server';
            downloadBtn.title = 'Send to torrent client';
            downloadBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.downloadAudiobook(fullLink, title, downloadBtn);
            };
            
            // Add preview button
            const previewBtn = document.createElement('button');
            previewBtn.className = 'abb-preview-btn';
            previewBtn.textContent = '👁️ Quick Preview';
            previewBtn.title = 'Show quick preview';
            previewBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showQuickPreview(fullLink, title, coverSrc);
            };
            
            // Add quality indicator (if we can determine it)
            const qualityIndicator = this.getQualityIndicator(title);
            if (qualityIndicator) {
                controlsContainer.appendChild(qualityIndicator);
            }
            
            controlsContainer.appendChild(downloadBtn);
            controlsContainer.appendChild(previewBtn);
            
            // Insert controls after the post title
            titleElement.parentElement.parentElement.appendChild(controlsContainer);
            
        } catch (error) {
            console.error('Error enhancing search result:', error);
        }
    }

    enhanceDetailPage() {
        // Add a prominent download button to detail pages
        const infoHashRow = document.querySelector('td');
        if (infoHashRow && infoHashRow.textContent.toLowerCase().includes('info hash')) {
            const title = document.title || 'Unknown Audiobook';
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'abb-download-btn abb-detail-download';
            downloadBtn.textContent = '⬇️ Download This Audiobook';
            downloadBtn.onclick = () => this.downloadAudiobook(window.location.href, title, downloadBtn);
            
            // Insert at the top of the page
            document.body.insertBefore(downloadBtn, document.body.firstChild);
        }
    }

    addFloatingSearch() {
        // Create floating search widget
        const searchWidget = document.createElement('div');
        searchWidget.className = 'abb-floating-search';
        searchWidget.innerHTML = `
            <div class="abb-search-toggle" title="Quick Search">🔍</div>
            <div class="abb-search-panel">
                <div class="abb-search-header">
                    <span>Quick Search</span>
                    <button class="abb-close-search">×</button>
                </div>
                <div class="abb-search-body">
                    <input type="text" class="abb-search-input" placeholder="Search audiobooks..." />
                    <button class="abb-search-submit">Search</button>
                </div>
                <div class="abb-search-results"></div>
            </div>
        `;
        
        document.body.appendChild(searchWidget);
        
        // Add event listeners for floating search
        const toggle = searchWidget.querySelector('.abb-search-toggle');
        const panel = searchWidget.querySelector('.abb-search-panel');
        const closeBtn = searchWidget.querySelector('.abb-close-search');
        const searchInput = searchWidget.querySelector('.abb-search-input');
        const searchSubmit = searchWidget.querySelector('.abb-search-submit');
        
        toggle.onclick = () => panel.classList.toggle('active');
        closeBtn.onclick = () => panel.classList.remove('active');
        
        searchInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                this.performQuickSearch(searchInput.value);
            }
        };
        
        searchSubmit.onclick = () => this.performQuickSearch(searchInput.value);
    }

    addBulkDownloadOptions() {
        // Add bulk download controls to search pages
        const bulkControls = document.createElement('div');
        bulkControls.className = 'abb-bulk-controls';
        bulkControls.innerHTML = `
            <div class="abb-bulk-header">Bulk Actions</div>
            <button class="abb-bulk-btn" onclick="abbEnhancer.selectAllResults()">Select All</button>
            <button class="abb-bulk-btn" onclick="abbEnhancer.downloadSelected()">Download Selected</button>
            <span class="abb-selected-count">0 selected</span>
        `;
        
        // Insert at top of search results
        const postsContainer = document.querySelector('.post').parentElement;
        if (postsContainer) {
            postsContainer.insertBefore(bulkControls, postsContainer.firstChild);
        }
    }

    getQualityIndicator(title) {
        const qualityMarkers = [
            { pattern: /64\s*kbps/i, quality: 'Standard', color: '#ff9800' },
            { pattern: /128\s*kbps/i, quality: 'Good', color: '#4caf50' },
            { pattern: /320\s*kbps/i, quality: 'High', color: '#2196f3' },
            { pattern: /flac/i, quality: 'Lossless', color: '#9c27b0' },
            { pattern: /m4a/i, quality: 'AAC', color: '#607d8b' }
        ];
        
        for (const marker of qualityMarkers) {
            if (marker.pattern.test(title)) {
                const indicator = document.createElement('span');
                indicator.className = 'abb-quality-indicator';
                indicator.textContent = marker.quality;
                indicator.style.backgroundColor = marker.color;
                return indicator;
            }
        }
        
        return null;
    }

    async downloadAudiobook(link, title, buttonElement) {
        try {
            // Show loading state
            const originalText = buttonElement.textContent;
            buttonElement.textContent = '⏳ Processing...';
            buttonElement.disabled = true;
            
            // Send download request to background script
            const response = await chrome.runtime.sendMessage({
                action: 'downloadAudiobook',
                data: { link, title }
            });
            
            if (response && response.success) {
                buttonElement.textContent = '✅ Added!';
                buttonElement.style.backgroundColor = '#4caf50';
                this.showNotification('Download added successfully!', 'success');
                
                setTimeout(() => {
                    buttonElement.textContent = originalText;
                    buttonElement.disabled = false;
                    buttonElement.style.backgroundColor = '';
                }, 3000);
            } else {
                throw new Error(response.error || 'Download failed');
            }
            
        } catch (error) {
            console.error('Download error:', error);
            buttonElement.textContent = '❌ Failed';
            buttonElement.style.backgroundColor = '#f44336';
            this.showNotification(`Download failed: ${error.message}`, 'error');
            
            setTimeout(() => {
                buttonElement.textContent = originalText;
                buttonElement.disabled = false;
                buttonElement.style.backgroundColor = '';
            }, 3000);
        }
    }

    showQuickPreview(link, title, coverSrc) {
        // Create modal preview
        const modal = document.createElement('div');
        modal.className = 'abb-modal';
        modal.innerHTML = `
            <div class="abb-modal-content">
                <div class="abb-modal-header">
                    <h3>${title}</h3>
                    <button class="abb-modal-close">×</button>
                </div>
                <div class="abb-modal-body">
                    ${coverSrc ? `<img src="${coverSrc}" class="abb-preview-cover" />` : ''}
                    <div class="abb-preview-actions">
                        <button class="abb-download-btn" onclick="abbEnhancer.downloadAudiobook('${link}', '${title}', this)">
                            ⬇️ Download to Server
                        </button>
                        <a href="${link}" target="_blank" class="abb-detail-link">View Full Details</a>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        const closeBtn = modal.querySelector('.abb-modal-close');
        closeBtn.onclick = () => document.body.removeChild(modal);
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };
    }

    performQuickSearch(query) {
        if (!query.trim()) return;
        
        // Navigate to search results
        const searchUrl = `https://${window.location.hostname}/?s=${encodeURIComponent(query)}`;
        window.location.href = searchUrl;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `abb-notification abb-notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.parentElement.removeChild(notification);
            }
        }, 3000);
    }

    addCustomCSS() {
        if (document.getElementById('abb-extension-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'abb-extension-styles';
        style.textContent = `
            /* Extension styles */
            .abb-extension-controls {
                margin: 10px 0;
                padding: 10px;
                background: rgba(106, 27, 154, 0.1);
                border-radius: 5px;
                border-left: 3px solid #6a1b9a;
            }
            
            .abb-download-btn, .abb-preview-btn {
                background: #6a1b9a;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                margin-right: 10px;
                font-size: 12px;
                transition: background 0.3s;
            }
            
            .abb-download-btn:hover {
                background: #8e24aa;
            }
            
            .abb-preview-btn {
                background: #2196f3;
            }
            
            .abb-preview-btn:hover {
                background: #1976d2;
            }
            
            .abb-detail-download {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                font-size: 14px;
                padding: 12px 20px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            }
            
            .abb-quality-indicator {
                background: #666;
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 10px;
                margin-right: 10px;
                display: inline-block;
            }
            
            .abb-floating-search {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
            }
            
            .abb-search-toggle {
                width: 50px;
                height: 50px;
                background: #6a1b9a;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 20px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                transition: all 0.3s;
            }
            
            .abb-search-toggle:hover {
                background: #8e24aa;
                transform: scale(1.1);
            }
            
            .abb-search-panel {
                position: absolute;
                bottom: 60px;
                right: 0;
                width: 300px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                display: none;
                overflow: hidden;
            }
            
            .abb-search-panel.active {
                display: block;
                animation: slideUp 0.3s ease-out;
            }
            
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .abb-search-header {
                background: #6a1b9a;
                color: white;
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .abb-close-search {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
            }
            
            .abb-search-body {
                padding: 15px;
            }
            
            .abb-search-input {
                width: 100%;
                padding: 10px;
                border: 2px solid #ddd;
                border-radius: 4px;
                margin-bottom: 10px;
                box-sizing: border-box;
            }
            
            .abb-search-submit {
                width: 100%;
                padding: 10px;
                background: #6a1b9a;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .abb-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 20000;
            }
            
            .abb-modal-content {
                background: white;
                border-radius: 8px;
                max-width: 500px;
                width: 90%;
                max-height: 80%;
                overflow: auto;
            }
            
            .abb-modal-header {
                background: #6a1b9a;
                color: white;
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .abb-modal-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
            }
            
            .abb-modal-body {
                padding: 20px;
                text-align: center;
            }
            
            .abb-preview-cover {
                max-width: 200px;
                border-radius: 8px;
                margin-bottom: 15px;
            }
            
            .abb-preview-actions {
                display: flex;
                gap: 10px;
                justify-content: center;
                flex-wrap: wrap;
            }
            
            .abb-detail-link {
                padding: 8px 15px;
                background: #2196f3;
                color: white;
                text-decoration: none;
                border-radius: 4px;
                font-size: 12px;
            }
            
            .abb-notification {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 15px 25px;
                border-radius: 4px;
                color: white;
                font-weight: bold;
                z-index: 30000;
                animation: slideDown 0.3s ease-out;
            }
            
            .abb-notification-success {
                background: #4caf50;
            }
            
            .abb-notification-error {
                background: #f44336;
            }
            
            .abb-notification-info {
                background: #2196f3;
            }
            
            @keyframes slideDown {
                from { opacity: 0; transform: translate(-50%, -20px); }
                to { opacity: 1; transform: translate(-50%, 0); }
            }
            
            .abb-bulk-controls {
                background: #f5f5f5;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            
            .abb-bulk-header {
                font-weight: bold;
                color: #333;
                margin-right: 10px;
            }
            
            .abb-bulk-btn {
                background: #6a1b9a;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            
            .abb-selected-count {
                color: #666;
                font-size: 12px;
                margin-left: auto;
            }
        `;
        
        document.head.appendChild(style);
    }
}

// Initialize the enhancer
let abbEnhancer;

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        abbEnhancer = new AudiobookBayEnhancer();
    });
} else {
    abbEnhancer = new AudiobookBayEnhancer();
}

// Make abbEnhancer globally available for button onclick handlers
window.abbEnhancer = abbEnhancer;
