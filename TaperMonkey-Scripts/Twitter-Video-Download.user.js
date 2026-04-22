// ==UserScript==
// @name         Twitter DL - Enhanced
// @version      2.0.0
// @description  Download Twitter/X videos directly from your browser with improved reliability and UX
// @author       OPitA (enhanced refactor)
// @license      MIT
// @namespace    https://x.com/*
// @match        https://twitter.com/*
// @match        https://x.com/*
// @match        https://pro.twitter.com/*
// @match        https://pro.x.com/*
// @connect      twitter-video-download.com
// @connect      twimg.com
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════
    const CONFIG = {
        API_ENDPOINT: 'https://twitter-video-download.com/fr/tweet/',
        RETRY: {
            MAX_ATTEMPTS: 3,
            BASE_DELAY_MS: 1000,
            BACKOFF_MULTIPLIER: 2,
        },
        TOAST: {
            DURATION_MS: 3000,
            ANIMATION_MS: 300,
        },
        OBSERVER: {
            DEBOUNCE_MS: 100,
        },
        SELECTORS: {
            ARTICLE: 'article',
            VIDEO_PLAYER: '[data-testid="videoPlayer"]',
            USER_NAME: '[data-testid="User-Name"]',
            USER_AVATAR: '[data-testid="Tweet-User-Avatar"]',
            TIME_ELEMENT: 'time',
            RETWEET_FRAME: '[id^="id__"]',
            RETWEET_LINK: 'div[tabindex="0"][role="link"]',
            APP_LINK_ROW: 'a[href*="/status/"][role="link"][dir="auto"]', // Timestamp link row
        },
        REGEX: {
            TWEET_URL: /https:\/\/(?:pro\.)?(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/,
            STATUS_URL: /^https?:\/\/(?:pro\.)?(?:x|twitter)\.com\/\w+\/status\/\d+$/,
            VALID_URL: /^https?:\/\/(?:pro\.)?(?:x|twitter)\.com\/\w+(\/\w+)*$/,
            VIDEO_URL: /https:\/\/[a-zA-Z0-9_-]+\.twimg\.com\/[a-zA-Z0-9_\-./]+\.mp4/g,
            RESOLUTION: /\/(\d+x\d+)\//,
        },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    const STYLES = `
    /* Button Container */
    .twdl-container {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
    }

    /* Download Buttons */
    .twdl-btn {
      padding: 4px 10px;
      border: none;
      border-radius: 9999px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    }

    .twdl-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }

    .twdl-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .twdl-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .twdl-btn--hq {
      background: linear-gradient(135deg, rgba(29, 161, 242, 0.85), rgba(29, 161, 242, 0.65));
    }

    .twdl-btn--hq:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(29, 161, 242, 1), rgba(29, 161, 242, 0.85));
    }

    .twdl-btn--lq {
      background: linear-gradient(135deg, rgba(120, 190, 120, 0.85), rgba(100, 170, 100, 0.65));
    }

    .twdl-btn--lq:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(120, 190, 120, 1), rgba(100, 170, 100, 0.85));
    }

    .twdl-btn--gif {
      background: linear-gradient(135deg, rgba(255, 140, 0, 0.85), rgba(220, 120, 0, 0.65));
    }

    .twdl-btn--gif:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(255, 140, 0, 1), rgba(220, 120, 0, 0.85));
    }

    /* Progress indicator */
    .twdl-btn--loading {
      position: relative;
      overflow: hidden;
    }

    .twdl-btn--loading::after {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.3),
        transparent
      );
      animation: twdl-shimmer 1.5s infinite;
    }

    @keyframes twdl-shimmer {
      100% { left: 100%; }
    }

    /* Toast Notifications */
    .twdl-toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      flex-direction: column-reverse;
      gap: 12px;
      pointer-events: none;
    }

    .twdl-toast {
      padding: 14px 20px;
      border-radius: 12px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      transform: translateX(120%);
      transition: transform ${CONFIG.TOAST.ANIMATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto;
      max-width: 320px;
    }

    .twdl-toast--visible {
      transform: translateX(0);
    }

    .twdl-toast--success {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.9));
    }

    .twdl-toast--error {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.9));
    }

    .twdl-toast--info {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.9));
    }

    /* Fallback Text */
    .twdl-fallback {
      font-size: 13px;
      color: rgba(113, 118, 123, 0.9);
      padding-left: 4px;
      white-space: nowrap;
    }
  `;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    const state = {
        processedTweets: new WeakSet(),
        fallbackTweets: new WeakSet(),
        toastContainer: null,
        observer: null,
        debounceTimer: null,
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    const utils = {
        /**
         * Wait for a specified duration
         */
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

        /**
         * Debounce function execution
         */
        debounce: (fn, ms) => {
            return (...args) => {
                clearTimeout(state.debounceTimer);
                state.debounceTimer = setTimeout(() => fn(...args), ms);
            };
        },

        /**
         * Calculate video resolution size for sorting
         */
        calculateResolutionSize: (resolution) => {
            if (!resolution) return 0;
            const [width, height] = resolution.split('x').map(Number);
            return width * height;
        },

        /**
         * Extract tweet info from URL
         */
        extractTweetInfo: (url) => {
            const match = url.match(CONFIG.REGEX.TWEET_URL);
            if (!match) return null;
            return { username: match[1], id: match[2], url };
        },

        /**
         * Check if URL is a status page
         */
        isStatusUrl: (url) => CONFIG.REGEX.STATUS_URL.test(url),

        /**
         * Check if URL is valid for injection
         */
        isValidUrl: (url) => CONFIG.REGEX.VALID_URL.test(url) || utils.isStatusUrl(url),

        /**
         * Log with prefix
         */
        log: (...args) => console.log('[TwitterDL]', ...args),
        error: (...args) => console.error('[TwitterDL]', ...args),
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // TOAST NOTIFICATION SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════
    const toast = {
        init: () => {
            if (state.toastContainer) return;
            state.toastContainer = document.createElement('div');
            state.toastContainer.className = 'twdl-toast-container';
            document.body.appendChild(state.toastContainer);
        },

        show: (message, type = 'info') => {
            toast.init();

            const toastEl = document.createElement('div');
            toastEl.className = `twdl-toast twdl-toast--${type}`;
            toastEl.textContent = message;

            state.toastContainer.appendChild(toastEl);

            // Trigger animation
            requestAnimationFrame(() => {
                toastEl.classList.add('twdl-toast--visible');
            });

            // Auto-dismiss
            setTimeout(() => {
                toastEl.classList.remove('twdl-toast--visible');
                setTimeout(() => toastEl.remove(), CONFIG.TOAST.ANIMATION_MS);
            }, CONFIG.TOAST.DURATION_MS);
        },

        success: (msg) => toast.show(msg, 'success'),
        error: (msg) => toast.show(msg, 'error'),
        info: (msg) => toast.show(msg, 'info'),
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DOM UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════
    const dom = {
        /**
         * Inject styles into the document
         */
        injectStyles: () => {
            const styleEl = document.createElement('style');
            styleEl.id = 'twdl-styles';
            styleEl.textContent = STYLES;
            document.head.appendChild(styleEl);
        },

        /**
         * Find retweet frame within a tweet
         */
        getRetweetFrame: (tweetEl) => {
            const candidates = tweetEl.querySelectorAll(CONFIG.SELECTORS.RETWEET_FRAME);
            for (const candidate of candidates) {
                const frame = candidate.querySelector(CONFIG.SELECTORS.RETWEET_LINK);
                if (frame) return frame;
            }
            return null;
        },

        /**
         * Get the top bar element for button injection
         */
        getTopBar: (tweetEl, isRetweet) => {
            let element = tweetEl;

            if (isRetweet) {
                const retweetFrame = dom.getRetweetFrame(tweetEl);
                const videoPlayer = tweetEl.querySelector(CONFIG.SELECTORS.VIDEO_PLAYER);
                const retweetVideoPlayer = retweetFrame?.querySelector(CONFIG.SELECTORS.VIDEO_PLAYER);

                if (retweetVideoPlayer && videoPlayer === retweetVideoPlayer) {
                    element = retweetFrame;
                }
            }

            const userName = element.querySelector(CONFIG.SELECTORS.USER_NAME);
            if (!userName) return null;

            // Navigate up to find the top bar
            return isRetweet && element !== tweetEl
                ? userName.parentNode?.parentNode
                : userName.parentNode?.parentNode?.parentNode;
        },

        /**
         * Add fallback text for unsupported retweets
         */
        addFallbackText: (tweetEl, text = ' · Open to Download') => {
            if (state.fallbackTweets.has(tweetEl)) return;

            const timeEl = tweetEl.querySelector(CONFIG.SELECTORS.TIME_ELEMENT);
            if (!timeEl) return;

            const fallbackEl = document.createElement('span');
            fallbackEl.className = 'twdl-fallback';
            fallbackEl.textContent = text;

            const avatars = tweetEl.querySelectorAll(CONFIG.SELECTORS.USER_AVATAR);
            const targetBar = avatars[1]?.parentNode;

            if (targetBar) {
                targetBar.appendChild(fallbackEl);
                state.fallbackTweets.add(tweetEl);
            }
        },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // API & NETWORK
    // ═══════════════════════════════════════════════════════════════════════════
    const api = {
        /**
         * Fetch with retry logic and exponential backoff
         */
        fetchWithRetry: async (url, attempt = 1) => {
            try {
                const response = await new Promise((resolve, reject) => {
                    GM.xmlHttpRequest({
                        method: 'GET',
                        url,
                        headers: {
                            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        onload: resolve,
                        onerror: reject,
                        ontimeout: () => reject(new Error('Request timeout')),
                    });
                });

                if (!response.responseText) {
                    throw new Error('Empty response');
                }

                return response.responseText;
            } catch (error) {
                if (attempt < CONFIG.RETRY.MAX_ATTEMPTS) {
                    const delay = CONFIG.RETRY.BASE_DELAY_MS * Math.pow(CONFIG.RETRY.BACKOFF_MULTIPLIER, attempt - 1);
                    utils.log(`Retry ${attempt}/${CONFIG.RETRY.MAX_ATTEMPTS} after ${delay}ms...`);
                    await utils.sleep(delay);
                    return api.fetchWithRetry(url, attempt + 1);
                }
                throw error;
            }
        },

        /**
         * Get media URLs from tweet ID
         */
        getMediaUrls: async (tweetInfo) => {
            const url = `${CONFIG.API_ENDPOINT}${tweetInfo.id}`;

            try {
                const html = await api.fetchWithRetry(url);
                const links = html.match(CONFIG.REGEX.VIDEO_URL);

                if (!links || links.length === 0) return null;

                // Parse and sort links by resolution
                const linkData = links.map((link) => {
                    const resMatch = link.match(CONFIG.REGEX.RESOLUTION);
                    const resolution = resMatch ? resMatch[1] : '';
                    return {
                        link,
                        resolution,
                        size: utils.calculateResolutionSize(resolution),
                    };
                });

                linkData.sort((a, b) => a.size - b.size);

                // Deduplicate
                const seen = new Set();
                const unique = linkData.filter((item) => {
                    if (seen.has(item.link)) return false;
                    seen.add(item.link);
                    return true;
                });

                // Handle GIF case
                const isGifTweet = tweetInfo.isGif || links[0].includes('tweet_video/');
                if (isGifTweet) {
                    return { lq: links[0], hq: null, isGif: true };
                }

                // Get quality variants
                let lq = unique[0]?.link;
                let hq = unique.length > 1 ? unique[unique.length - 1]?.link : null;

                // Skip lowest quality if we have enough options
                if (unique.length > 2) {
                    lq = unique[1]?.link;
                }

                return { lq, hq, isGif: false };
            } catch (error) {
                utils.error('Failed to fetch media URLs:', error);
                return null;
            }
        },

        /**
         * Download file via blob
         */
        downloadFile: (button, url, quality, filename) => {
            const baseText = button.dataset.originalText;

            button.disabled = true;
            button.classList.add('twdl-btn--loading');
            button.textContent = 'Connecting...';

            GM.xmlHttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                onprogress: (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        button.textContent = `${percent}%`;
                    } else {
                        button.textContent = 'Downloading...';
                    }
                },
                onload: (response) => {
                    try {
                        const blob = response.response;
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `${filename}.mp4`;
                        link.click();
                        URL.revokeObjectURL(link.href);

                        button.textContent = '✓ Done';
                        button.classList.remove('twdl-btn--loading');
                        toast.success(`Downloaded ${quality.toUpperCase()} video`);

                        setTimeout(() => {
                            button.textContent = baseText;
                            button.disabled = false;
                        }, 1500);
                    } catch (err) {
                        utils.error('Download processing error:', err);
                        button.textContent = 'Error';
                        toast.error('Failed to process download');
                        setTimeout(() => {
                            button.textContent = baseText;
                            button.disabled = false;
                            button.classList.remove('twdl-btn--loading');
                        }, 2000);
                    }
                },
                onerror: (error) => {
                    utils.error('Download error:', error);
                    button.textContent = 'Failed';
                    button.classList.remove('twdl-btn--loading');
                    toast.error('Download failed. Try again.');

                    setTimeout(() => {
                        button.textContent = baseText;
                        button.disabled = false;
                    }, 2000);
                },
            });
        },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // TWEET PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════
    const tweet = {
        /**
         * Extract information from a tweet element
         */
        getInfo: (tweetEl) => {
            const retweetFrame = dom.getRetweetFrame(tweetEl);
            const isRetweet = retweetFrame !== null;
            const isPost = utils.isStatusUrl(window.location.href);

            let tweetInfo = null;

            // Try to get info from URL or time element
            try {
                if (isRetweet) {
                    if (isPost) {
                        const retweetVideoPlayer = retweetFrame?.querySelector(CONFIG.SELECTORS.VIDEO_PLAYER);
                        if (retweetVideoPlayer) {
                            dom.addFallbackText(tweetEl);
                            return null;
                        }
                    } else {
                        dom.addFallbackText(tweetEl);
                        return null;
                    }
                }

                // Try time element first (for non-retweets)
                const timeEl = tweetEl.querySelector(CONFIG.SELECTORS.TIME_ELEMENT);
                const timeLink = timeEl?.parentNode?.href;

                if (timeLink) {
                    tweetInfo = utils.extractTweetInfo(timeLink);
                }

                // Fallback to current URL
                if (!tweetInfo) {
                    tweetInfo = utils.extractTweetInfo(window.location.href);
                }
            } catch (error) {
                utils.error('Error extracting tweet info:', error);
                dom.addFallbackText(tweetEl);
                return null;
            }

            if (!tweetInfo) return null;

            // Check for GIF
            const videoPlayer = tweetEl.querySelector(CONFIG.SELECTORS.VIDEO_PLAYER);
            const gifSpan = videoPlayer?.querySelector('div[dir="ltr"] > span');
            tweetInfo.isGif = gifSpan?.textContent === 'GIF';
            tweetInfo.videoPlayer = videoPlayer;
            tweetInfo.tabIndex = tweetEl.getAttribute('tabindex');

            return tweetInfo;
        },

        /**
         * Create a download button
         */
        createButton: (tweetInfo, url, quality) => {
            const button = document.createElement('button');
            const label = quality.toUpperCase();
            const filename = `TwitterDL_${tweetInfo.username}_${tweetInfo.id}`;

            button.className = `twdl-btn twdl-btn--${quality}`;
            button.textContent = label;
            button.dataset.originalText = label;
            button.title = `Download ${label} quality`;

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                api.downloadFile(button, url, quality, filename);
            });

            return button;
        },

        /**
         * Find the timestamp/views row for button placement
         * Handles both standard and fragmented DOM structures
         */
        getTimestampRow: (tweetEl) => {
            // Find the timestamp element
            const timeEl = tweetEl.querySelector(CONFIG.SELECTORS.TIME_ELEMENT);
            if (!timeEl) return null;

            // Navigate up to find the link containing the time
            let linkEl = timeEl.closest('a[role="link"]');
            if (!linkEl) {
                linkEl = timeEl.parentElement;
            }

            // Get the immediate parent (may only contain timestamp)
            let rowEl = linkEl?.parentElement;

            // Check if this row also contains "Views" text
            // If not, we need to go up one more level to find the common container
            if (rowEl) {
                const hasViews = rowEl.textContent?.includes('Views');

                if (!hasViews) {
                    // Fragmented structure: timestamp and views are siblings
                    // Go up to the grandparent which should contain both
                    const grandparent = rowEl.parentElement;

                    if (grandparent?.textContent?.includes('Views')) {
                        rowEl = grandparent;
                    }
                }
            }

            return rowEl;
        },

        /**
         * Inject download buttons into a tweet
         */
        injectButtons: async (tweetEl) => {
            const tweetInfo = tweet.getInfo(tweetEl);
            if (!tweetInfo) return;

            const medias = await api.getMediaUrls(tweetInfo);
            if (!medias) return;

            // Create buttons
            const buttons = [];

            if (medias.hq && !medias.isGif) {
                buttons.push(tweet.createButton(tweetInfo, medias.hq, 'hq'));
            }

            if (medias.lq) {
                const quality = medias.isGif ? 'gif' : 'lq';
                buttons.push(tweet.createButton(tweetInfo, medias.lq, quality));
            }

            if (buttons.length === 0) return;

            // Try to find the timestamp row first (preferred location)
            const timestampRow = tweet.getTimestampRow(tweetEl);

            if (timestampRow) {
                // Create container for buttons
                const container = document.createElement('span');
                container.className = 'twdl-container';
                buttons.forEach((btn) => container.appendChild(btn));

                // Append to the timestamp row
                timestampRow.appendChild(container);
            } else {
                // Fallback: use the top bar method
                const retweetFrame = dom.getRetweetFrame(tweetEl);
                const isRetweet = retweetFrame !== null;
                const topBar = dom.getTopBar(tweetEl, isRetweet);

                if (!topBar) {
                    utils.error('Could not find injection point for buttons');
                    return;
                }

                const container = document.createElement('span');
                container.className = 'twdl-container';
                buttons.forEach((btn) => container.appendChild(btn));

                const threeDotsBtn = topBar.lastChild;
                topBar.insertBefore(container, threeDotsBtn);
            }
        },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // OBSERVER & INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════
    const observer = {
        /**
         * Process all visible tweets
         */
        processVisibleTweets: () => {
            const articles = document.querySelectorAll(CONFIG.SELECTORS.ARTICLE);

            for (const article of articles) {
                // Skip already processed
                if (state.processedTweets.has(article)) continue;

                // Check for video player
                const videoPlayer = article.querySelector(CONFIG.SELECTORS.VIDEO_PLAYER);
                if (!videoPlayer) continue;

                // Mark as processed and inject buttons
                state.processedTweets.add(article);
                tweet.injectButtons(article).catch((err) => {
                    utils.error('Failed to inject buttons:', err);
                });
            }
        },

        /**
         * Initialize the MutationObserver
         */
        init: () => {
            const debouncedProcess = utils.debounce(
                observer.processVisibleTweets,
                CONFIG.OBSERVER.DEBOUNCE_MS
            );

            state.observer = new MutationObserver((mutations) => {
                // Check if any relevant nodes were added
                const hasNewNodes = mutations.some(
                    (m) => m.addedNodes.length > 0 || m.type === 'childList'
                );

                if (hasNewNodes) {
                    debouncedProcess();
                }
            });

            state.observer.observe(document.body, {
                childList: true,
                subtree: true,
            });

            // Initial scan
            observer.processVisibleTweets();
        },

        /**
         * Cleanup the observer
         */
        destroy: () => {
            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
        },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN ENTRY POINT
    // ═══════════════════════════════════════════════════════════════════════════
    const init = () => {
        if (!utils.isValidUrl(window.location.href)) {
            utils.log('URL not valid for injection, skipping...');
            return;
        }

        utils.log('v2.0.0 - Enhanced Edition loading...');

        // Inject styles
        dom.injectStyles();

        // Initialize toast system
        toast.init();

        // Start observing
        observer.init();

        // Handle SPA navigation
        let lastUrl = window.location.href;
        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                if (utils.isValidUrl(lastUrl)) {
                    observer.processVisibleTweets();
                }
            }
        });

        urlObserver.observe(document.body, { childList: true, subtree: true });

        utils.log('Initialized successfully!');
        toast.info('Twitter DL Enhanced loaded');
    };

    // Start the script
    init();
})();
