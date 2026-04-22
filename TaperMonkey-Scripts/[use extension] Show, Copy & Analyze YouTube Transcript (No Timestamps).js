// ==UserScript==
// @name         Show, Copy & Analyze YouTube Transcript (No Timestamps)
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Automatically open YouTube transcript, copy it, and generate an analysis based on customizable template.
// @author       You
// @match        https://www.youtube.com/*
// @grant        GM_setClipboard
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // Constants for storing the analysis template
    const STORAGE_KEY = 'yt_transcript_analysis_template';

    // Default template for analysis with placeholders for title and transcript text
    const DEFAULT_TEMPLATE = `Title: "{{Title}}"
Transcript: "{{Text}}"

Provide a structured analysis with the following sections:

---

1. **Key Points and Main Ideas.**
List the main ideas and all significant supporting details discussed in the transcript. Ensure that no important concepts, facts, or arguments are omitted.

2. **Takeaways.**
Summarize the most important conclusions or actionable insights using bullet points. Focus on what the reader should remember or apply after reading the transcript.

Ensure that your analysis is well-organized, with each section clearly labeled.`;

    // AI platforms configuration
    const AI_PLATFORMS = [
        {
            id: 'chatgpt',
            name: 'ChatGPT',
            icon: '⚫',
            url: 'https://chatgpt.com'
        },
        {
            id: 'claude',
            name: 'Claude',
            icon: '🟠',
            url: 'https://claude.ai/chats'
        },
        {
            id: 'gemini',
            name: 'Gemini',
            icon: '🔵',
            url: 'https://gemini.google.com/app'
        },
        {
            id: 'mistral',
            name: 'Mistral',
            icon: '⚪',
            url: 'https://chat.mistral.ai/chat'
        },
        {
            id: 'grok',
            name: 'Grok',
            icon: '⚫',
            url: 'https://grok.com'
        }
    ];

    /**
     * Monitors DOM changes and waits for transcript panel to appear
     * @param {Function} callback - Function to call when panel is found
     */
    function waitForTranscriptPanel(callback) {
        const observer = new MutationObserver(() => {
            const panel = document.querySelector('[target-id="engagement-panel-searchable-transcript"]');
            if (panel) {
                observer.disconnect(); // Stop observing once found
                callback(panel);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * Extracts transcript text without timestamps
     * @param {HTMLElement} panel - The transcript panel element
     * @returns {string} - Cleaned transcript text
     */
    function getCleanTranscript(panel) {
        const segments = panel.querySelectorAll('ytd-transcript-segment-renderer');
        return Array.from(segments).map(el => {
            // Get text content
            let text = el.innerText;
            
            // More aggressive timestamp removal - handles various formats
            // Remove timestamps like "1:23", "01:23", "1:23 AM", etc. at the beginning of lines
            text = text.replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?\s*/i, '');
            
            // Remove any remaining time patterns like [01:23] or (01:23) anywhere in the text
            text = text.replace(/[\[\(]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?\s*[\]\)]/gi, '');
            
            // Remove any standalone timestamps in the format 00:00
            text = text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '');
            
            return text.trim();
        }).join('\n');
    }

    /**
     * Retrieves the video title from the page
     * @returns {string} - Cleaned video title
     */
    function getYouTubeTitle() {
        return document.title.replace(/ - YouTube$/, '').trim();
    }

    /**
     * Creates a button and adds it to the page
     * @param {string} id - Button ID
     * @param {string} text - Button label
     * @param {string} top - Vertical position
     * @param {Function} onClick - Click handler
     */
    function createButton(id, text, top, onClick) {
        if (document.getElementById(id)) return; // Avoid duplicates

        const btn = document.createElement('button');
        btn.id = id;
        btn.textContent = text;
        btn.style.position = 'fixed';
        btn.style.top = top;
        btn.style.right = '20px';
        btn.style.zIndex = '9999';
        btn.style.padding = '10px 16px';
        btn.style.background = '#0f0f0f';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #aaa';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        btn.onclick = onClick;

        document.body.appendChild(btn);
    }

    /**
     * Creates a floating notification/tooltip
     * @param {string} message - Message to display
     * @param {number} duration - How long to show in ms
     */
    function showNotification(message, duration = 5000) {
        // Remove any existing notification
        const existingNotification = document.getElementById('yt-transcript-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'yt-transcript-notification';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.backgroundColor = '#333';
        notification.style.color = '#fff';
        notification.style.padding = '12px 20px';
        notification.style.borderRadius = '6px';
        notification.style.zIndex = '10000';
        notification.style.maxWidth = '600px';
        notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        notification.style.fontSize = '14px';
        notification.innerHTML = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, duration);
    }

    /**
     * Creates an AI platform icon button
     * @param {Object} platform - Platform configuration
     * @param {number} index - Button position index
     * @param {HTMLElement} transcriptPanel - The transcript panel
     */
    function createAiButton(platform, index, transcriptPanel) {
        if (document.getElementById(`ai-btn-${platform.id}`)) return;

        const btn = document.createElement('button');
        btn.id = `ai-btn-${platform.id}`;
        btn.textContent = `${platform.icon} ${platform.name}`;
        btn.title = `Open ${platform.name}`;
        btn.style.position = 'fixed';
        btn.style.top = `${250 + (index * 50)}px`;
        btn.style.right = '20px';
        btn.style.zIndex = '9999';
        btn.style.padding = '10px 16px';
        btn.style.background = '#0f0f0f';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #aaa';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        
        btn.onclick = function() {
            // Simply open the AI platform in a new tab
            window.open(platform.url, '_blank');
            
            // Visual feedback
            btn.textContent = `✅ Opening...`;
            
            // Reset button text after a delay
            setTimeout(function() {
                btn.textContent = `${platform.icon} ${platform.name}`;
            }, 2000);
        };

        document.body.appendChild(btn);
    }

    /**
     * Creates all three buttons with their functionality
     * @param {HTMLElement} transcriptPanel - The transcript panel element
     */
    function initButtons(transcriptPanel) {
        // Button 1: Copy just the transcript text
        createButton('copy-transcript-btn', '📋 Copy Transcript', '100px', () => {
            const cleanedText = getCleanTranscript(transcriptPanel);
            GM_setClipboard(cleanedText, 'text'); // Copy to clipboard
            console.log('Transcript copied.');

            // Provide visual feedback
            const btn = document.getElementById('copy-transcript-btn');
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
                btn.textContent = '📋 Copy Transcript';
                // Close the transcript panel after copying
                transcriptPanel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_COLLAPSED");
            }, 2000);
        });

        // Button 2: Copy transcript with analysis template
        createButton('copy-analyze-btn', '🧠 Copy + Analyze', '150px', () => {
            const cleanedText = getCleanTranscript(transcriptPanel);
            const title = getYouTubeTitle();
            const template = localStorage.getItem(STORAGE_KEY) || DEFAULT_TEMPLATE;

            // Replace placeholders with actual content
            const analysis = template
                .replace('{{Title}}', title)
                .replace('{{Text}}', cleanedText);

            GM_setClipboard(analysis, 'text');
            console.log('Transcript and analysis copied.');

            // Provide visual feedback
            const btn = document.getElementById('copy-analyze-btn');
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
                btn.textContent = '🧠 Copy + Analyze';
                // Close the transcript panel after copying
                transcriptPanel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_COLLAPSED");
            }, 2000);
        });

        // Button 3: Customize the analysis template
        createButton('set-template-btn', '⚙️ Set Analysis Template', '200px', () => {
            const current = localStorage.getItem(STORAGE_KEY) || DEFAULT_TEMPLATE;
            const updated = prompt("Edit your analysis template. Use {{Title}} and {{Text}} as placeholders:", current);
            if (updated) {
                localStorage.setItem(STORAGE_KEY, updated);
                alert('Template updated successfully.');
            }
        });

        // Create AI platform buttons
        AI_PLATFORMS.forEach((platform, index) => {
            createAiButton(platform, index, transcriptPanel);
        });
    }

    // Main execution starts here
    setTimeout(() => {
        // Try to find transcript panel immediately
        const transcriptPanel = document.querySelector('[target-id="engagement-panel-searchable-transcript"]');
        if (transcriptPanel) {
            // If found, expand it and initialize buttons
            transcriptPanel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
            initButtons(transcriptPanel);
        } else {
            // If not found, set up observer to wait for it
            waitForTranscriptPanel(panel => {
                panel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
                initButtons(panel);
            });
        }
    }, 3000); // Wait 3 seconds before starting to let the page load
})();
