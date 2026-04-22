// ==UserScript==
// @name         YouTube View & Age Filter (Collapsible)
// @namespace    http://tampermonkey.net/
// @license      MIT
// @version      1.7
// @description  Filter YouTube videos by view count and/or video age, with a collapsible menu.
// @author       opita04
// @match        *://www.youtube.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL https://update.greasyfork.org/scripts/539802/YouTube%20View%20%20Age%20Filter%20%28Collapsible%29.user.js
// @updateURL https://update.greasyfork.org/scripts/539802/YouTube%20View%20%20Age%20Filter%20%28Collapsible%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // --- --- CONFIGURATION --- ---
    // -- View Filter --
    let viewCountThreshold = GM_getValue('viewCountThreshold', 1000);
    let viewFilterType = GM_getValue('viewFilterType', 'greater'); // 'greater' or 'less'

    // -- Age Filter --
    let ageFilterEnabled = GM_getValue('ageFilterEnabled', false);
    let ageValue = GM_getValue('ageValue', 1);
    let ageUnit = GM_getValue('ageUnit', 'years'); // 'days', 'months', 'years'
    let ageFilterType = GM_getValue('ageFilterType', 'newer'); // 'newer' or 'older'

    // -- Panel State --
    let isPanelVisible = GM_getValue('isPanelVisible', true);
    
    // -- Filter State --
    let filterEnabled = GM_getValue('filterEnabled', true);

    // -- Sort State --
    let sortOrder = GM_getValue('sortOrder', 'none'); // 'none', 'asc', 'desc'

    // -- Sort Observer State --
    let sortIntervalId = null;
    let sortObserver = null;
    let sortTimeout = null;

    // --- --- --- --- --- --- --- ---

    function parseViews(viewStr) {
        if (!viewStr) return 0;
        const cleanedStr = viewStr.toLowerCase().replace(/views|,/g, '').trim();
        const num = parseFloat(cleanedStr);
        if (cleanedStr.includes('k')) return num * 1000;
        if (cleanedStr.includes('m')) return num * 1000000;
        if (cleanedStr.includes('b')) return num * 1000000000;
        return parseInt(cleanedStr, 10) || 0;
    }

    function parseAgeToDays(ageStr) {
        if (!ageStr) return Infinity; // Treat videos with no age string as infinitely old
        const cleanedStr = ageStr.toLowerCase();
        const num = parseInt(cleanedStr.match(/\d+/)) || 0;

        if (cleanedStr.includes('year')) return num * 365;
        if (cleanedStr.includes('month')) return num * 30;
        if (cleanedStr.includes('week')) return num * 7;
        if (cleanedStr.includes('day')) return num;
        if (cleanedStr.includes('hour') || cleanedStr.includes('minute') || cleanedStr.includes('second')) return 0; // Treat as brand new
        return Infinity;
    }

    function getVideoViews(video) {
        let viewText = '';
        const allSpans = video.querySelectorAll('span');
        allSpans.forEach(span => {
            const text = span.textContent.toLowerCase();
            if (text.includes('view') && !viewText) {
                viewText = text;
            }
        });
        return parseViews(viewText);
    }

    function sortVideosByViews() {
        if (sortOrder === 'none' || !filterEnabled) return; // Don't sort if filtering is disabled

        const videoSelectors = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer';
        const allVideos = Array.from(document.querySelectorAll(videoSelectors));
        
        // Get visible videos
        const visibleVideos = allVideos.filter(v => {
            const style = window.getComputedStyle(v);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        if (visibleVideos.length < 2) return;

        // Group videos by their closest common container
        const containerGroups = new Map();
        
        visibleVideos.forEach(video => {
            // Try to find a container like #contents or rich-grid-renderer
            let container = video.parentElement;
            let found = false;
            
            // Look up the DOM tree for a known container
            for (let i = 0; i < 10 && container; i++) {
                if (container.id === 'contents' || 
                    container.classList.contains('ytd-rich-grid-renderer') ||
                    container.classList.contains('ytd-rich-grid-row') ||
                    container.tagName === 'YTD-RICH-GRID-ROW' ||
                    (container.children && Array.from(container.children).some(c => visibleVideos.includes(c)))) {
                    
                    if (!containerGroups.has(container)) {
                        containerGroups.set(container, []);
                    }
                    containerGroups.get(container).push(video);
                    found = true;
                    break;
                }
                container = container.parentElement;
            }
            
            // Fallback: group by direct parent
            if (!found && video.parentElement) {
                const parent = video.parentElement;
                if (!containerGroups.has(parent)) {
                    containerGroups.set(parent, []);
                }
                containerGroups.get(parent).push(video);
            }
        });

        // Sort each group
        containerGroups.forEach((videos, container) => {
            // Remove duplicates
            const uniqueVideos = [...new Set(videos)];
            if (uniqueVideos.length < 2) return;

            // Get views and sort
            const videoData = uniqueVideos.map(video => ({
                element: video,
                views: getVideoViews(video)
            }));

            videoData.sort((a, b) => {
                return sortOrder === 'desc' ? b.views - a.views : a.views - b.views;
            });

            // Simple check: see if first video matches
            const currentChildren = Array.from(container.children);
            const currentFirstVideo = currentChildren.find(child => uniqueVideos.includes(child));
            const shouldBeFirst = videoData[0].element;
            
            // Only reorder if needed
            if (currentFirstVideo !== shouldBeFirst) {
                try {
                    // Find where to insert (after the last non-video element, or at start)
                    let insertPoint = null;
                    for (let i = 0; i < currentChildren.length; i++) {
                        if (!uniqueVideos.includes(currentChildren[i])) {
                            insertPoint = currentChildren[i];
                            break;
                        }
                    }

                    // Remove all videos from container
                    videoData.forEach(item => {
                        if (item.element.parentNode === container) {
                            container.removeChild(item.element);
                        }
                    });

                    // Re-insert in sorted order
                    if (insertPoint && container.contains(insertPoint)) {
                        videoData.forEach(item => {
                            container.insertBefore(item.element, insertPoint);
                        });
                    } else {
                        // Append to end or beginning
                        const firstChild = container.firstElementChild;
                        if (firstChild) {
                            videoData.forEach((item, idx) => {
                                if (idx === 0) {
                                    container.insertBefore(item.element, firstChild);
                                } else {
                                    const prevVideo = videoData[idx - 1].element;
                                    if (prevVideo.nextSibling) {
                                        container.insertBefore(item.element, prevVideo.nextSibling);
                                    } else {
                                        container.appendChild(item.element);
                                    }
                                }
                            });
                        } else {
                            videoData.forEach(item => {
                                container.appendChild(item.element);
                            });
                        }
                    }
                } catch (e) {
                    // Fail silently
                }
            }
        });
    }

    function filterVideos() {
        const videos = document.querySelectorAll(
            'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer'
        );

        const ageThresholdInDays = (ageFilterEnabled) ?
              (ageUnit === 'years' ? ageValue * 365 : (ageUnit === 'months' ? ageValue * 30 : ageValue))
              : 0;

        videos.forEach(video => {
            // If filtering is disabled, show all videos
            if (!filterEnabled) {
                if (video.style.display !== '') {
                    video.style.display = '';
                }
                return;
            }

            let viewText = '';
            let ageText = '';

            // Search all spans in the video for view count and age
            const allSpans = video.querySelectorAll('span');
            allSpans.forEach(span => {
                const text = span.textContent.toLowerCase();
                if (text.includes('view') && !viewText) {
                    viewText = text;
                } else if (text.includes('ago') && !ageText) {
                    ageText = text;
                }
            });

            const views = parseViews(viewText);
            const ageInDays = parseAgeToDays(ageText);

            let shouldHide = false;

            // --- View Filter Logic ---
            if (views > 0) { // Only filter if views are parsed
                if (viewFilterType === 'greater' && views < viewCountThreshold) {
                    shouldHide = true;
                } else if (viewFilterType === 'less' && views > viewCountThreshold) {
                    shouldHide = true;
                }
            }

            // --- Age Filter Logic ---
            if (!shouldHide && ageFilterEnabled && ageInDays !== Infinity) {
                if (ageFilterType === 'newer' && ageInDays > ageThresholdInDays) {
                    shouldHide = true; // Hide if it's OLDER than required
                } else if (ageFilterType === 'older' && ageInDays < ageThresholdInDays) {
                    shouldHide = true; // Hide if it's NEWER than required
                }
            }

            if (video.style.display !== (shouldHide ? 'none' : '')) {
                video.style.display = shouldHide ? 'none' : '';
            }
        });

        // Sort after filtering (only if filter is enabled)
        if (sortOrder !== 'none' && filterEnabled) {
            sortVideosByViews();
        }
    }

    function createMenu() {
        // --- Main Containers ---
        const container = document.createElement('div');
        container.id = 'view-filter-container';
        document.body.appendChild(container);

        const panel = document.createElement('div');
        panel.id = 'view-filter-panel';
        container.appendChild(panel);

        // --- Filter Toggle Button (Compact) ---
        const filterToggleWrapper = document.createElement('div');
        filterToggleWrapper.className = 'filter-toggle-wrapper';
        const filterToggleButton = document.createElement('button');
        filterToggleButton.className = 'filter-toggle-btn';
        filterToggleButton.textContent = filterEnabled ? '● ON' : '○ OFF';
        filterToggleButton.setAttribute('data-enabled', filterEnabled);
        filterToggleButton.addEventListener('click', () => {
            filterEnabled = !filterEnabled;
            GM_setValue('filterEnabled', filterEnabled);
            filterToggleButton.textContent = filterEnabled ? '● ON' : '○ OFF';
            filterToggleButton.setAttribute('data-enabled', filterEnabled);
            
            // Stop sorting when filter is disabled
            if (!filterEnabled) {
                if (sortObserver) {
                    sortObserver.disconnect();
                }
                if (sortIntervalId) {
                    clearInterval(sortIntervalId);
                    sortIntervalId = null;
                }
            } else if (sortOrder !== 'none') {
                // Restart sorting if it was enabled
                setupSortObserver();
            }
            
            filterVideos();
        });
        filterToggleWrapper.appendChild(filterToggleButton);
        panel.appendChild(filterToggleWrapper);

        // --- View Filter Section (Compact) ---
        const viewSection = document.createElement('div');
        viewSection.className = 'filter-section';
        
        const viewLabel = document.createElement('label');
        viewLabel.className = 'filter-label';
        viewLabel.textContent = 'Views:';
        viewSection.appendChild(viewLabel);
        
        const viewControls = document.createElement('div');
        viewControls.className = 'filter-controls-inline';
        
        const viewInput = document.createElement('input');
        viewInput.type = 'number';
        viewInput.className = 'filter-input-compact';
        viewInput.value = viewCountThreshold;
        viewControls.appendChild(viewInput);

        const viewFilterSelect = document.createElement('select');
        viewFilterSelect.className = 'filter-select-compact';
        const option1 = document.createElement('option');
        option1.value = 'greater';
        option1.textContent = '>';
        if (viewFilterType === 'greater') option1.selected = true;
        viewFilterSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = 'less';
        option2.textContent = '<';
        if (viewFilterType === 'less') option2.selected = true;
        viewFilterSelect.appendChild(option2);
        
        viewControls.appendChild(viewFilterSelect);
        viewSection.appendChild(viewControls);
        panel.appendChild(viewSection);

        // --- Age Filter Section (Compact) ---
        const ageSection = document.createElement('div');
        ageSection.className = 'filter-section';
        
        const ageHeader = document.createElement('div');
        ageHeader.className = 'filter-header';
        
        const ageEnableLabel = document.createElement('label');
        ageEnableLabel.className = 'checkbox-label';
        const ageEnableCheckbox = document.createElement('input');
        ageEnableCheckbox.type = 'checkbox';
        ageEnableCheckbox.className = 'filter-checkbox';
        ageEnableCheckbox.checked = ageFilterEnabled;
        ageEnableLabel.appendChild(ageEnableCheckbox);
        ageEnableLabel.appendChild(document.createTextNode(' Age'));
        ageHeader.appendChild(ageEnableLabel);
        ageSection.appendChild(ageHeader);

        if (ageFilterEnabled) {
            const ageControls = document.createElement('div');
            ageControls.className = 'filter-controls-inline';
            
            const ageValueInput = document.createElement('input');
            ageValueInput.type = 'number';
            ageValueInput.className = 'filter-input-compact';
            ageValueInput.value = ageValue;
            ageControls.appendChild(ageValueInput);

            const ageUnitSelect = document.createElement('select');
            ageUnitSelect.className = 'filter-select-compact';
            const ageUnitDays = document.createElement('option');
            ageUnitDays.value = 'days';
            ageUnitDays.textContent = 'd';
            if (ageUnit === 'days') ageUnitDays.selected = true;
            ageUnitSelect.appendChild(ageUnitDays);
            
            const ageUnitMonths = document.createElement('option');
            ageUnitMonths.value = 'months';
            ageUnitMonths.textContent = 'mo';
            if (ageUnit === 'months') ageUnitMonths.selected = true;
            ageUnitSelect.appendChild(ageUnitMonths);
            
            const ageUnitYears = document.createElement('option');
            ageUnitYears.value = 'years';
            ageUnitYears.textContent = 'y';
            if (ageUnit === 'years') ageUnitYears.selected = true;
            ageUnitSelect.appendChild(ageUnitYears);
            
            ageControls.appendChild(ageUnitSelect);

            const ageFilterTypeSelect = document.createElement('select');
            ageFilterTypeSelect.className = 'filter-select-compact';
            const ageNewerOption = document.createElement('option');
            ageNewerOption.value = 'newer';
            ageNewerOption.textContent = '>';
            if (ageFilterType === 'newer') ageNewerOption.selected = true;
            ageFilterTypeSelect.appendChild(ageNewerOption);
            
            const ageOlderOption = document.createElement('option');
            ageOlderOption.value = 'older';
            ageOlderOption.textContent = '<';
            if (ageFilterType === 'older') ageOlderOption.selected = true;
            ageFilterTypeSelect.appendChild(ageOlderOption);
            
            ageControls.appendChild(ageFilterTypeSelect);
            ageSection.appendChild(ageControls);
        }

        ageEnableCheckbox.addEventListener('change', () => {
            const ageControls = ageSection.querySelector('.filter-controls-inline');
            if (ageEnableCheckbox.checked && !ageControls) {
                const newAgeControls = document.createElement('div');
                newAgeControls.className = 'filter-controls-inline';
                
                const ageValueInput = document.createElement('input');
                ageValueInput.type = 'number';
                ageValueInput.className = 'filter-input-compact';
                ageValueInput.value = ageValue;
                newAgeControls.appendChild(ageValueInput);

                const ageUnitSelect = document.createElement('select');
                ageUnitSelect.className = 'filter-select-compact';
                ['days', 'months', 'years'].forEach((unit, idx) => {
                    const opt = document.createElement('option');
                    opt.value = unit;
                    opt.textContent = unit === 'days' ? 'd' : (unit === 'months' ? 'mo' : 'y');
                    if (ageUnit === unit) opt.selected = true;
                    ageUnitSelect.appendChild(opt);
                });
                newAgeControls.appendChild(ageUnitSelect);

                const ageFilterTypeSelect = document.createElement('select');
                ageFilterTypeSelect.className = 'filter-select-compact';
                const ageNewerOption = document.createElement('option');
                ageNewerOption.value = 'newer';
                ageNewerOption.textContent = '>';
                if (ageFilterType === 'newer') ageNewerOption.selected = true;
                ageFilterTypeSelect.appendChild(ageNewerOption);
                
                const ageOlderOption = document.createElement('option');
                ageOlderOption.value = 'older';
                ageOlderOption.textContent = '<';
                if (ageFilterType === 'older') ageOlderOption.selected = true;
                ageFilterTypeSelect.appendChild(ageOlderOption);
                
                newAgeControls.appendChild(ageFilterTypeSelect);
                ageSection.appendChild(newAgeControls);
            } else if (!ageEnableCheckbox.checked && ageControls) {
                ageControls.remove();
            }
        });
        
        panel.appendChild(ageSection);

        // --- Sort Section (Compact) ---
        const sortSection = document.createElement('div');
        sortSection.className = 'filter-section';
        
        const sortLabel = document.createElement('label');
        sortLabel.className = 'filter-label';
        sortLabel.textContent = 'Sort:';
        sortSection.appendChild(sortLabel);
        
        const sortSelect = document.createElement('select');
        sortSelect.className = 'filter-select-full';
        
        const sortNone = document.createElement('option');
        sortNone.value = 'none';
        sortNone.textContent = 'None';
        if (sortOrder === 'none') sortNone.selected = true;
        sortSelect.appendChild(sortNone);
        
        const sortAsc = document.createElement('option');
        sortAsc.value = 'asc';
        sortAsc.textContent = '↑ Views ↑';
        if (sortOrder === 'asc') sortAsc.selected = true;
        sortSelect.appendChild(sortAsc);
        
        const sortDesc = document.createElement('option');
        sortDesc.value = 'desc';
        sortDesc.textContent = '↓ Views ↓';
        if (sortOrder === 'desc') sortDesc.selected = true;
        sortSelect.appendChild(sortDesc);
        
        function setupSortObserver() {
            // Clean up existing observer and interval
            if (sortObserver) {
                sortObserver.disconnect();
                sortObserver = null;
            }
            if (sortIntervalId) {
                clearInterval(sortIntervalId);
                sortIntervalId = null;
            }
            if (sortTimeout) {
                clearTimeout(sortTimeout);
                sortTimeout = null;
            }

            if (sortOrder !== 'none') {
                // Start interval sorting
                sortIntervalId = setInterval(sortVideosByViews, 500);

                // Setup MutationObserver
                sortObserver = new MutationObserver(() => {
                    clearTimeout(sortTimeout);
                    sortTimeout = setTimeout(() => {
                        sortVideosByViews();
                    }, 300);
                });

                const observeTargets = [
                    document.querySelector('ytd-browse[role="main"]'),
                    document.querySelector('#contents'),
                    document.querySelector('#primary')
                ].filter(Boolean);

                observeTargets.forEach(target => {
                    if (target) {
                        sortObserver.observe(target, {
                            childList: true,
                            subtree: true
                        });
                    }
                });
            }
        }

        sortSelect.addEventListener('change', () => {
            sortOrder = sortSelect.value;
            GM_setValue('sortOrder', sortOrder);
            sortVideosByViews();
            setupSortObserver();
        });
        
        // Make setupSortObserver available globally
        window.setupSortObserver = setupSortObserver;
        
        sortSection.appendChild(sortSelect);
        panel.appendChild(sortSection);

        // --- Apply Button (Compact) ---
        const applyButton = document.createElement('button');
        applyButton.className = 'apply-button';
        applyButton.textContent = 'Apply';
        applyButton.addEventListener('click', () => {
            GM_setValue('viewCountThreshold', parseInt(viewInput.value, 10));
            GM_setValue('viewFilterType', viewFilterSelect.value);

            GM_setValue('ageFilterEnabled', ageEnableCheckbox.checked);
            const ageValueInput = ageSection.querySelector('.filter-input-compact');
            if (ageValueInput) {
                GM_setValue('ageValue', parseInt(ageValueInput.value, 10));
            }
            const ageUnitSelect = ageSection.querySelectorAll('.filter-select-compact')[0];
            if (ageUnitSelect) {
                GM_setValue('ageUnit', ageUnitSelect.value);
            }
            const ageFilterTypeSelect = ageSection.querySelectorAll('.filter-select-compact')[1];
            if (ageFilterTypeSelect) {
                GM_setValue('ageFilterType', ageFilterTypeSelect.value);
            }

            GM_setValue('sortOrder', sortSelect.value);
            sortOrder = sortSelect.value;

            location.reload();
        });
        panel.appendChild(applyButton);

        // --- Toggle Button ---
        const toggleButton = document.createElement('button');
        toggleButton.id = 'view-filter-toggle-btn';
        container.appendChild(toggleButton);

        function updatePanelVisibility() {
            if (isPanelVisible) {
                panel.style.display = 'flex';
                toggleButton.textContent = '⚙';
            } else {
                panel.style.display = 'none';
                toggleButton.textContent = '⚙';
            }
        }

        toggleButton.addEventListener('click', () => {
            isPanelVisible = !isPanelVisible;
            GM_setValue('isPanelVisible', isPanelVisible);
            updatePanelVisibility();
        });

        updatePanelVisibility();
    }

    GM_addStyle(`
        #view-filter-container {
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        #view-filter-toggle-btn {
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: #ffffff;
            border: 1px solid #404040;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 6px;
            margin-bottom: 6px;
            order: -1;
            font-size: 14px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        #view-filter-toggle-btn:hover {
            background: linear-gradient(135deg, #2d2d2d 0%, #3d3d3d 100%);
            transform: translateY(-1px);
            box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        }
        #view-filter-panel {
            background: linear-gradient(135deg, #1e1e1e 0%, #252525 100%);
            color: #ffffff;
            border: 1px solid #383838;
            padding: 10px;
            border-radius: 10px;
            width: 200px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset;
            display: flex;
            flex-direction: column;
            gap: 8px;
            backdrop-filter: blur(10px);
        }
        .filter-toggle-wrapper {
            width: 100%;
            margin-bottom: 2px;
        }
        .filter-toggle-btn {
            width: 100%;
            padding: 6px 10px;
            background: linear-gradient(135deg, #272727 0%, #1a1a1a 100%);
            color: #ffffff;
            border: 1px solid #404040;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
            text-align: center;
        }
        .filter-toggle-btn[data-enabled="true"] {
            background: linear-gradient(135deg, #3ea6ff 0%, #2a8ae0 100%);
            border-color: #3ea6ff;
            color: #ffffff;
            box-shadow: 0 0 8px rgba(62, 166, 255, 0.3);
        }
        .filter-toggle-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .filter-section {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .filter-label {
            font-size: 11px;
            color: #b3b3b3;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .filter-header {
            display: flex;
            align-items: center;
        }
        .checkbox-label {
            display: flex;
            align-items: center;
            font-size: 11px;
            color: #b3b3b3;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
        }
        .filter-controls-inline {
            display: grid;
            grid-template-columns: 1fr auto auto;
            gap: 4px;
            align-items: center;
        }
        .filter-input-compact,
        .filter-select-compact {
            padding: 5px 8px;
            border-radius: 5px;
            border: 1px solid #404040;
            background-color: #161616;
            color: #ffffff;
            font-size: 12px;
            transition: all 0.2s ease;
            box-sizing: border-box;
        }
        .filter-input-compact {
            min-width: 0;
        }
        .filter-select-compact {
            padding: 5px 6px;
            min-width: 45px;
            cursor: pointer;
        }
        .filter-select-full {
            padding: 5px 8px;
            border-radius: 5px;
            border: 1px solid #404040;
            background-color: #161616;
            color: #ffffff;
            font-size: 12px;
            transition: all 0.2s ease;
            box-sizing: border-box;
            width: 100%;
            cursor: pointer;
        }
        .filter-select-full:focus {
            outline: none;
            border-color: #3ea6ff;
            box-shadow: 0 0 0 2px rgba(62, 166, 255, 0.1);
            background-color: #1a1a1a;
        }
        .filter-input-compact:focus,
        .filter-select-compact:focus {
            outline: none;
            border-color: #3ea6ff;
            box-shadow: 0 0 0 2px rgba(62, 166, 255, 0.1);
            background-color: #1a1a1a;
        }
        .filter-checkbox {
            width: 14px;
            height: 14px;
            margin-right: 6px;
            cursor: pointer;
            accent-color: #3ea6ff;
        }
        .apply-button {
            width: 100%;
            padding: 7px 12px;
            background: linear-gradient(135deg, #3ea6ff 0%, #2a8ae0 100%);
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-top: 2px;
            box-shadow: 0 2px 6px rgba(62, 166, 255, 0.2);
        }
        .apply-button:hover {
            background: linear-gradient(135deg, #4db4ff 0%, #3ea6ff 100%);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(62, 166, 255, 0.3);
        }
        .apply-button:active {
            transform: translateY(0);
        }
    `);

    // --- SCRIPT INITIALIZATION ---
    function initScript() {
        try {
            createMenu();
        } catch (error) {
            console.error('Failed to create menu:', error);
        }
        
        try {
            setTimeout(() => {
                filterVideos();
                if (sortOrder !== 'none') {
                    sortVideosByViews();
                }
            }, 1000); // Initial fast filter
            
            // Filter interval
            setInterval(filterVideos, 2000);
            
            // Setup initial sort observer if needed (wait for menu to be created)
            setTimeout(() => {
                if (sortOrder !== 'none' && filterEnabled && window.setupSortObserver) {
                    window.setupSortObserver();
                }
            }, 1500);
        } catch (error) {
            console.error('Failed to start filter timers:', error);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else {
        initScript();
    }

})();