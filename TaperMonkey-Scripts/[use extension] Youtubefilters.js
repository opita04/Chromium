// ==UserScript==
// @name         YouTube View & Age Filter (with Quick Toggle)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Context-aware filter for YouTube with a one-click button to instantly enable or disable all filters without a page reload.
// @author       Your Name
// @match        *://www.youtube.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    // --- --- CONFIGURATION --- ---
    let filtersGloballyEnabled = GM_getValue('filtersGloballyEnabled', true);
    let viewCountThreshold = GM_getValue('viewCountThreshold', 1000);
    let viewFilterType = GM_getValue('viewFilterType', 'greater');
    let ageFilterEnabled = GM_getValue('ageFilterEnabled', false);
    let ageValue = GM_getValue('ageValue', 1);
    let ageUnit = GM_getValue('ageUnit', 'years');
    let ageFilterType = GM_getValue('ageFilterType', 'newer');
    let isPanelVisible = GM_getValue('isPanelVisible', true);
    // --- --- --- --- --- --- --- ---

    let lastUrl = '';

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
        if (!ageStr) return Infinity;
        const cleanedStr = ageStr.toLowerCase();
        const num = parseInt(cleanedStr.match(/\d+/)) || 0;
        if (cleanedStr.includes('year')) return num * 365;
        if (cleanedStr.includes('month')) return num * 30;
        if (cleanedStr.includes('week')) return num * 7;
        if (cleanedStr.includes('day')) return num;
        if (cleanedStr.includes('hour') || cleanedStr.includes('minute') || cleanedStr.includes('second')) return 0;
        return Infinity;
    }

    function getVideoElements() {
        return document.querySelectorAll(
            'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer'
        );
    }

    function showAllVideos() {
        getVideoElements().forEach(video => {
            if (video.style.display === 'none') {
                video.style.display = '';
            }
        });
    }

    function filterVideos() {
        const videos = getVideoElements();
        const ageThresholdInDays = (ageFilterEnabled) ?
              (ageUnit === 'years' ? ageValue * 365 : (ageUnit === 'months' ? ageValue * 30 : ageValue))
              : 0;

        videos.forEach(video => {
            const metadataSpans = video.querySelectorAll('#metadata-line span');
            let viewText = '', ageText = '';
            metadataSpans.forEach(span => {
                const text = span.textContent.toLowerCase();
                if (text.includes('view')) viewText = text;
                else if (text.includes('ago')) ageText = text;
            });

            const views = parseViews(viewText);
            const ageInDays = parseAgeToDays(ageText);

            let shouldHide = false;
            if (views > 0) {
                if (viewFilterType === 'greater' && views < viewCountThreshold) shouldHide = true;
                else if (viewFilterType === 'less' && views > viewCountThreshold) shouldHide = true;
            }
            if (!shouldHide && ageFilterEnabled && ageInDays !== Infinity) {
                if (ageFilterType === 'newer' && ageInDays > ageThresholdInDays) shouldHide = true;
                else if (ageFilterType === 'older' && ageInDays < ageThresholdInDays) shouldHide = true;
            }

            if (video.style.display !== (shouldHide ? 'none' : '')) {
                video.style.display = shouldHide ? 'none' : '';
            }
        });
    }

    function isFilterablePage() {
        const path = window.location.pathname;
        return ['/', '/feed/subscriptions', '/feed/history', '/results', '/feed/trending'].includes(path);
    }

    function createMenu() {
        const container = document.createElement('div');
        container.id = 'view-filter-container';
        document.body.appendChild(container);

        // --- Quick Filter Toggle Button ---
        const quickToggleButton = document.createElement('button');
        quickToggleButton.id = 'quick-toggle-filter-btn';
        container.appendChild(quickToggleButton);

        function updateQuickToggleButton() {
            if (filtersGloballyEnabled) {
                quickToggleButton.textContent = 'Filters On';
                quickToggleButton.classList.add('filters-on');
                quickToggleButton.classList.remove('filters-off');
            } else {
                quickToggleButton.textContent = 'Filters Off';
                quickToggleButton.classList.add('filters-off');
                quickToggleButton.classList.remove('filters-on');
            }
        }

        quickToggleButton.addEventListener('click', () => {
            filtersGloballyEnabled = !filtersGloballyEnabled;
            GM_setValue('filtersGloballyEnabled', filtersGloballyEnabled);
            updateQuickToggleButton();
            mainLogic(true); // Force immediate re-evaluation of filters
        });

        // --- Panel Hide/Show Button ---
        const toggleButton = document.createElement('button');
        toggleButton.id = 'view-filter-toggle-btn';
        container.appendChild(toggleButton);

        // --- Main Settings Panel ---
        const panel = document.createElement('div');
        panel.id = 'view-filter-panel';
        container.appendChild(panel);

        // (The rest of the panel creation is the same as before)
        const viewTitle = document.createElement('h3'); viewTitle.textContent = 'View Count Filter'; panel.appendChild(viewTitle);
        const viewInput = document.createElement('input'); viewInput.type = 'number'; viewInput.value = viewCountThreshold; panel.appendChild(viewInput);
        const viewFilterSelect = document.createElement('select'); viewFilterSelect.innerHTML = `<option value="greater" ${viewFilterType === 'greater' ? 'selected' : ''}>Greater Than</option><option value="less" ${viewFilterType === 'less' ? 'selected' : ''}>Less Than</option>`; panel.appendChild(viewFilterSelect);
        panel.appendChild(document.createElement('hr'));
        const ageTitle = document.createElement('h3'); ageTitle.textContent = 'Video Age Filter'; panel.appendChild(ageTitle);
        const ageEnableLabel = document.createElement('label'); ageEnableLabel.style.cssText = 'display: flex; align-items: center; margin-bottom: 10px;';
        const ageEnableCheckbox = document.createElement('input'); ageEnableCheckbox.type = 'checkbox'; ageEnableCheckbox.checked = ageFilterEnabled;
        ageEnableLabel.appendChild(ageEnableCheckbox); ageEnableLabel.appendChild(document.createTextNode(' Enable Age Filter')); panel.appendChild(ageEnableLabel);
        const ageValueInput = document.createElement('input'); ageValueInput.type = 'number'; ageValueInput.value = ageValue; panel.appendChild(ageValueInput);
        const ageUnitSelect = document.createElement('select'); ageUnitSelect.innerHTML = `<option value="days" ${ageUnit === 'days' ? 'selected' : ''}>Days</option><option value="months" ${ageUnit === 'months' ? 'selected' : ''}>Months</option><option value="years" ${ageUnit === 'years' ? 'selected' : ''}>Years</option>`; panel.appendChild(ageUnitSelect);
        const ageFilterTypeSelect = document.createElement('select'); ageFilterTypeSelect.innerHTML = `<option value="newer" ${ageFilterType === 'newer' ? 'selected' : ''}>Newer Than</option><option value="older" ${ageFilterType === 'older' ? 'selected' : ''}>Older Than</option>`; panel.appendChild(ageFilterTypeSelect);
        panel.appendChild(document.createElement('hr'));
        const applyButton = document.createElement('button'); applyButton.textContent = 'Apply Settings & Reload'; applyButton.style.marginTop = '10px';
        applyButton.addEventListener('click', () => {
            GM_setValue('viewCountThreshold', parseInt(viewInput.value, 10)); GM_setValue('viewFilterType', viewFilterSelect.value);
            GM_setValue('ageFilterEnabled', ageEnableCheckbox.checked); GM_setValue('ageValue', parseInt(ageValueInput.value, 10)); GM_setValue('ageUnit', ageUnitSelect.value); GM_setValue('ageFilterType', ageFilterTypeSelect.value);
            location.reload();
        });
        panel.appendChild(applyButton);

        function updatePanelVisibility() {
            if (isPanelVisible) {
                panel.style.display = 'block';
                toggleButton.textContent = 'Hide Controls';
            } else {
                panel.style.display = 'none';
                toggleButton.textContent = 'Show Controls';
            }
        }
        toggleButton.addEventListener('click', () => { isPanelVisible = !isPanelVisible; GM_setValue('isPanelVisible', isPanelVisible); updatePanelVisibility(); });

        // Initialize button states
        updateQuickToggleButton();
        updatePanelVisibility();
    }

    function mainLogic(force = false) {
        const currentUrl = window.location.href;
        const menuContainer = document.getElementById('view-filter-container');

        if (currentUrl !== lastUrl || force) {
            showAllVideos(); // Always reset on URL change or when forced
            lastUrl = currentUrl;

            if (isFilterablePage()) {
                if (menuContainer) menuContainer.style.display = 'flex';
                if (filtersGloballyEnabled) {
                    filterVideos();
                }
            } else {
                if (menuContainer) menuContainer.style.display = 'none';
            }
        }
    }

    GM_addStyle(`
        #view-filter-container { position: fixed; top: 80px; right: 20px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; }
        #quick-toggle-filter-btn, #view-filter-toggle-btn {
            border: 1px solid #3f3f3f; padding: 5px 10px; cursor: pointer; border-radius: 5px; margin-bottom: 5px; order: -1; font-weight: bold;
        }
        #quick-toggle-filter-btn.filters-on { background-color: #27813a; color: white; }
        #quick-toggle-filter-btn.filters-off { background-color: #555; color: #ddd; }
        #view-filter-toggle-btn { background-color: #0f0f0f; color: white; }
        #view-filter-panel { background-color: #282828; color: white; border: 1px solid #3f3f3f; padding: 15px; border-radius: 8px; width: 180px; box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
        #view-filter-panel h3 { margin: 0 0 10px 0; font-size: 16px; text-align: center; border-bottom: 1px solid #444; padding-bottom: 5px; }
        #view-filter-panel input, #view-filter-panel select, #view-filter-panel button { display: block; width: 100%; margin-bottom: 10px; box-sizing: border-box; padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #1e1e1e; color: white; }
        #view-filter-panel hr { border: none; border-top: 1px solid #444; margin: 15px 0; }
        #view-filter-panel input[type="checkbox"] { width: auto; margin-right: 10px; }
        #view-filter-panel button { background-color: #3ea6ff; color: black; font-weight: bold; cursor: pointer; }
        #view-filter-panel button:hover { opacity: 0.9; }
    `);

    if (document.body) createMenu(); else document.addEventListener('DOMContentLoaded', createMenu);
    setInterval(mainLogic, 500); // Check more frequently for SPA navigation changes
})();