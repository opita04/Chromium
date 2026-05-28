// Background service worker for AudiobookBay Chrome Extension
class AudiobookBayBackground {
    constructor() {
        this.settings = null;
        this.init();
    }

    init() {
        // Load settings on startup
        this.loadSettings();
        
        // Listen for messages from content scripts and popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });

        // Listen for installation/startup
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                this.loadSettings();
            }
        });

        console.log('AudiobookBay Background Service Worker initialized');
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

            console.log('Settings loaded:', this.settings);
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'downloadAudiobook':
                    const downloadResult = await this.downloadAudiobook(request.data);
                    sendResponse(downloadResult);
                    break;

                case 'searchAudiobooks':
                    const searchResult = await this.searchAudiobooks(request.query);
                    sendResponse(searchResult);
                    break;

                case 'testTorrentConnection':
                    const testResult = await this.testTorrentConnection(request.config);
                    sendResponse(testResult);
                    break;

                case 'getTorrentStatus':
                    const statusResult = await this.getTorrentStatus();
                    sendResponse(statusResult);
                    break;

                case 'settingsUpdated':
                    await this.loadSettings();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async handleInstallation(details) {
        if (details.reason === 'install') {
            // Set up default settings on first install
            await chrome.storage.sync.set({
                audiobookbayDomains: ['audiobookbay.lu', 'audiobookbay.is'],
                downloadClient: 'qbittorrent',
                clientHost: 'localhost',
                clientPort: 8080,
                clientScheme: 'http',
                clientUsername: 'admin',
                clientPassword: '',
                downloadCategory: 'Audiobookbay-Audiobooks',
                savePathBase: '/audiobooks',
                pageLimit: 5
            });

            // Open the options page
            chrome.runtime.openOptionsPage();
            
            // Show welcome notification
            chrome.notifications.create({
                type: 'basic',
                title: 'AudiobookBay Downloader',
                message: 'Extension installed! Configure your settings to get started.'
            });
        }
    }

    async downloadAudiobook(data) {
        try {
            const { link, title } = data;
            
            if (!link || !title) {
                throw new Error('Missing link or title');
            }

            // Extract magnet link from the AudiobookBay page
            const magnetLink = await this.extractMagnetLink(link);
            if (!magnetLink) {
                throw new Error('Could not extract magnet link');
            }

            // Send to torrent client
            const result = await this.sendToTorrentClient(magnetLink, title);
            
            // Show success notification
            chrome.notifications.create({
                type: 'basic',
                title: 'Download Added',
                message: `"${title}" added to ${this.settings.downloadClient}`
            });

            return { success: true, message: 'Download added successfully' };

        } catch (error) {
            console.error('Download error:', error);
            
            // Show error notification
            chrome.notifications.create({
                type: 'basic',
                title: 'Download Failed',
                message: error.message
            });

            return { success: false, error: error.message };
        }
    }

    async extractMagnetLink(detailsUrl) {
        try {
            console.log('Extracting magnet link from:', detailsUrl);

            // Fetch the details page
            const response = await fetch(detailsUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Cache-Control': 'no-cache'
                }
            });

            console.log(`Details page response status: ${response.status}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch details page: ${response.status} ${response.statusText}`);
            }

            const html = await response.text();
            console.log(`Details page HTML length: ${html.length}`);
            
            // Parse HTML manually since DOMParser doesn't work in service workers
            let infoHash = null;
            let trackers = [];
            
            // Extract Info Hash using regex
            const infoHashMatches = [
                /Info Hash[^>]*<\/td>[^<]*<td[^>]*>([a-fA-F0-9]{40})<\/td>/gi,
                /Info Hash[\s\S]*?<td[^>]*>([a-fA-F0-9]{40})<\/td>/gi,
                /([a-fA-F0-9]{40})/g  // fallback: any 40-char hex string
            ];
            
            for (const pattern of infoHashMatches) {
                const match = html.match(pattern);
                if (match) {
                    // Extract just the hash part
                    const hashMatch = match[0].match(/([a-fA-F0-9]{40})/);
                    if (hashMatch) {
                        infoHash = hashMatch[1];
                        console.log('Found info hash via pattern:', infoHash);
                        break;
                    }
                }
            }

            if (!infoHash) {
                console.error('Info Hash not found. HTML snippet:', html.substring(0, 1000));
                throw new Error('Info Hash not found on the page');
            }

            console.log('Found info hash:', infoHash);

            // Extract Trackers using regex
            const trackerPatterns = [
                /(udp:\/\/[^\s<>"']+)/gi,
                /(http:\/\/[^\s<>"']+)/gi
            ];
            
            for (const pattern of trackerPatterns) {
                const matches = html.match(pattern);
                if (matches) {
                    trackers.push(...matches);
                }
            }
            
            // Remove duplicates
            trackers = [...new Set(trackers)];

            // Use default trackers if none found
            if (trackers.length === 0) {
                console.log('No trackers found, using defaults');
                trackers.push(
                    'udp://tracker.openbittorrent.com:80',
                    'udp://opentor.org:2710', 
                    'udp://tracker.ccc.de:80',
                    'udp://tracker.blackunicorn.xyz:6969',
                    'udp://tracker.coppersurfer.tk:6969',
                    'udp://tracker.leechers-paradise.org:6969'
                );
            }

            console.log('Found trackers:', trackers);

            // Construct magnet link
            const trackersQuery = trackers.map(tracker => `tr=${encodeURIComponent(tracker)}`).join('&');
            const magnetLink = `magnet:?xt=urn:btih:${infoHash}&${trackersQuery}`;

            console.log('Generated magnet link:', magnetLink);
            return magnetLink;

        } catch (error) {
            console.error('Error extracting magnet link:', error);
            throw error;
        }
    }

    async sendToTorrentClient(magnetLink, title) {
        try {
            const sanitizedTitle = this.sanitizeTitle(title);
            const savePath = `${this.settings.savePathBase}/${sanitizedTitle}`;

            console.log(`Sending to ${this.settings.downloadClient}:`, {
                host: this.settings.clientHost,
                port: this.settings.clientPort,
                savePath
            });

            switch (this.settings.downloadClient) {
                case 'qbittorrent':
                    return await this.sendToQBittorrent(magnetLink, savePath);
                case 'transmission':
                    return await this.sendToTransmission(magnetLink, savePath);
                case 'delugeweb':
                    return await this.sendToDeluge(magnetLink, savePath);
                default:
                    throw new Error(`Unsupported download client: ${this.settings.downloadClient}`);
            }
        } catch (error) {
            console.error('Error sending to torrent client:', error);
            throw error;
        }
    }

    async sendToQBittorrent(magnetLink, savePath) {
        const baseUrl = `${this.settings.clientScheme}://${this.settings.clientHost}:${this.settings.clientPort}`;
        
        // Login first
        const loginResponse = await fetch(`${baseUrl}/api/v2/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                username: this.settings.clientUsername,
                password: this.settings.clientPassword
            })
        });

        if (!loginResponse.ok) {
            throw new Error('qBittorrent login failed');
        }

        // Get cookies from login response
        const cookies = loginResponse.headers.get('set-cookie');

        // Add torrent
        const addResponse = await fetch(`${baseUrl}/api/v2/torrents/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies || ''
            },
            body: new URLSearchParams({
                urls: magnetLink,
                savepath: savePath,
                category: this.settings.downloadCategory
            })
        });

        if (!addResponse.ok) {
            throw new Error(`qBittorrent add torrent failed: ${addResponse.status}`);
        }

        return { success: true };
    }

    async sendToTransmission(magnetLink, savePath) {
        const baseUrl = `${this.settings.clientScheme}://${this.settings.clientHost}:${this.settings.clientPort}/transmission/rpc`;
        
        // Get session ID first
        let sessionId = '';
        try {
            await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${btoa(`${this.settings.clientUsername}:${this.settings.clientPassword}`)}`
                }
            });
        } catch (error) {
            if (error.response && error.response.status === 409) {
                sessionId = error.response.headers['x-transmission-session-id'];
            }
        }

        // Add torrent
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${btoa(`${this.settings.clientUsername}:${this.settings.clientPassword}`)}`,
                'X-Transmission-Session-Id': sessionId
            },
            body: JSON.stringify({
                method: 'torrent-add',
                arguments: {
                    filename: magnetLink,
                    'download-dir': savePath
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Transmission add torrent failed: ${response.status}`);
        }

        return { success: true };
    }

    async sendToDeluge(magnetLink, savePath) {
        const baseUrl = `${this.settings.clientScheme}://${this.settings.clientHost}:${this.settings.clientPort}/json`;
        
        // Login to Deluge
        const loginResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'auth.login',
                params: [this.settings.clientPassword],
                id: 1
            })
        });

        if (!loginResponse.ok) {
            throw new Error('Deluge login failed');
        }

        const loginResult = await loginResponse.json();
        if (!loginResult.result) {
            throw new Error('Deluge authentication failed');
        }

        // Add torrent
        const addResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'core.add_torrent_magnet',
                params: [magnetLink, {
                    download_location: savePath,
                    label: this.settings.downloadCategory
                }],
                id: 2
            })
        });

        if (!addResponse.ok) {
            throw new Error(`Deluge add torrent failed: ${addResponse.status}`);
        }

        return { success: true };
    }

    async testTorrentConnection(config) {
        try {
            const baseUrl = `${config.clientScheme}://${config.clientHost}:${config.clientPort}`;
            
            let testUrl, testMethod, testBody, testHeaders;

            switch (config.downloadClient) {
                case 'qbittorrent':
                    testUrl = `${baseUrl}/api/v2/app/version`;
                    testMethod = 'GET';
                    break;
                
                case 'transmission':
                    testUrl = `${baseUrl}/transmission/rpc`;
                    testMethod = 'POST';
                    testHeaders = {
                        'Authorization': `Basic ${btoa(`${config.clientUsername}:${config.clientPassword}`)}`
                    };
                    break;
                
                case 'delugeweb':
                    testUrl = `${baseUrl}/json`;
                    testMethod = 'POST';
                    testHeaders = { 'Content-Type': 'application/json' };
                    testBody = JSON.stringify({
                        method: 'daemon.get_method_list',
                        params: [],
                        id: 1
                    });
                    break;
                
                default:
                    throw new Error('Unsupported client type');
            }

            const response = await fetch(testUrl, {
                method: testMethod,
                headers: testHeaders,
                body: testBody,
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });

            // For transmission, we expect a 409 response initially
            if (config.downloadClient === 'transmission' && response.status === 409) {
                return { success: true };
            }

            if (response.ok) {
                return { success: true };
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Connection test failed:', error);
            return { success: false, error: error.message };
        }
    }

    async searchAudiobooks(query) {
        try {
            if (!query.trim()) {
                return { success: false, error: 'Empty query' };
            }

            const results = [];
            
            // Search across all configured domains
            for (const domain of this.settings.audiobookbayDomains) {
                try {
                    const domainResults = await this.searchDomain(domain, query);
                    results.push(...domainResults);
                } catch (error) {
                    console.error(`Error searching ${domain}:`, error);
                }
            }

            return { success: true, results };

        } catch (error) {
            console.error('Search error:', error);
            return { success: false, error: error.message };
        }
    }

    async searchDomain(domain, query) {
        const results = [];
        
        console.log(`Searching domain: ${domain} for query: ${query}`);
        
        for (let page = 1; page <= this.settings.pageLimit; page++) {
            try {
                const url = `https://${domain}/page/${page}/?s=${encodeURIComponent(query)}&cat=undefined%2Cundefined`;
                console.log(`Fetching: ${url}`);
                
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Cache-Control': 'no-cache'
                    }
                });

                console.log(`Response status for ${domain} page ${page}: ${response.status}`);
                
                if (!response.ok) {
                    console.error(`Failed to fetch page ${page} from ${domain}: ${response.status} ${response.statusText}`);
                    break;
                }

                const html = await response.text();
                console.log(`HTML length received: ${html.length}`);
                
                // Parse HTML manually since DOMParser doesn't work in service workers
                const parsedResults = this.parseAudiobookBayHTML(html, domain);
                console.log(`Found ${parsedResults.length} results on page ${page}`);
                
                if (parsedResults.length === 0) {
                    console.log(`No results found on page ${page}, stopping search`);
                    break; // No more results
                }
                
                results.push(...parsedResults);

            } catch (error) {
                console.error(`Error fetching page ${page} from ${domain}:`, error);
                break;
            }
        }

        console.log(`Total results found for ${domain}: ${results.length}`);
        return results;
    }

    parseAudiobookBayHTML(html, domain) {
        const results = [];
        
        try {
            console.log('Starting HTML parsing...');
            
            // More flexible regex patterns to match AudiobookBay structure
            // Look for links with postTitle class or within post structures
            const titleLinkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
            const matches = [];
            let match;
            
            while ((match = titleLinkRegex.exec(html)) !== null) {
                const link = match[1];
                const title = match[2].trim();
                
                // Filter out non-audiobook links (navigation, etc.)
                if (this.isAudiobookLink(link, title)) {
                    matches.push({ link, title });
                }
            }
            
            console.log(`Found ${matches.length} potential audiobook links`);
            
            // Process each match
            matches.forEach((matchData, index) => {
                try {
                    const { link, title } = matchData;
                    
                    // Build full URL
                    const fullLink = link.startsWith('http') ? link : `https://${domain}${link}`;
                    
                    // Try to find associated cover image near the link
                    const cover = this.findCoverImageForLink(html, link);
                    
                    results.push({
                        title: this.decodeHtmlEntities(title),
                        link: fullLink,
                        cover: cover,
                        domain: domain
                    });
                    
                    console.log(`Parsed result ${index + 1}: ${title}`);
                    
                } catch (error) {
                    console.error(`Error processing match ${index}:`, error);
                }
            });
            
        } catch (error) {
            console.error('Error parsing HTML:', error);
        }
        
        console.log(`Total results parsed: ${results.length}`);
        return results;
    }
    
    isAudiobookLink(link, title) {
        // Filter out navigation and non-content links
        const skipPatterns = [
            /^#/,           // anchor links
            /\/page\//,     // pagination links
            /\/category\//,  // category links
            /\/tag\//,      // tag links
            /javascript:/,  // javascript links
            /mailto:/,      // email links
        ];
        
        for (const pattern of skipPatterns) {
            if (pattern.test(link)) {
                return false;
            }
        }
        
        // Must have substantive title (not just numbers or short text)
        if (!title || title.length < 5) {
            return false;
        }
        
        // Likely audiobook if link contains common patterns
        const audiobookPatterns = [
            /\/[0-9]{4}\//,  // year in URL
            /audiobook/i,
            /\/(book|novel|story|audio)/i
        ];
        
        return audiobookPatterns.some(pattern => pattern.test(link)) || 
               title.length > 10; // Assume longer titles are likely books
    }
    
    findCoverImageForLink(html, link) {
        try {
            // Look for images near the link in the HTML
            const linkIndex = html.indexOf(link);
            if (linkIndex === -1) return null;
            
            // Search around the link position for img tags
            const searchStart = Math.max(0, linkIndex - 1000);
            const searchEnd = Math.min(html.length, linkIndex + 1000);
            const searchArea = html.substring(searchStart, searchEnd);
            
            const imgMatch = searchArea.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
            return imgMatch ? imgMatch[1] : null;
            
        } catch (error) {
            console.error('Error finding cover image:', error);
            return null;
        }
    }
    
    decodeHtmlEntities(text) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#039;': "'",
            '&nbsp;': ' '
        };
        
        return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
            return entities[match] || match;
        });
    }

    sanitizeTitle(title) {
        return title.replace(/[<>:"/\\|?*]/g, '').trim();
    }
}

// Initialize the background service
new AudiobookBayBackground();
