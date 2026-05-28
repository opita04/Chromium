
// ThunderScans Sorter - Optimized & Safe Edition

const SELECTORS = {
    containerCandidates: [
        '.listupd',
        '.page-content-listing .row',
        '#manga-item-container',
        '.manga-item-container',
        '.c-page-content .row',
        '.list-listing .row'
    ],
    itemCandidates: [
        '.bsx',
        '.page-item-detail',
        '.manga-item',
        '.col-6',
        '.item-summary'
    ]
};

let activeContainer = null;
let activeItemSelector = null;
let observer = null;
let debounceTimer = null;
let discoveryRetries = 0;
const MAX_RETRIES = 3;

function init() {
    console.log('ThunderScans Sorter: Initializing Safe Mode...');
    // Only run discovery once after initial load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(safeDiscover, 1500));
    } else {
        setTimeout(safeDiscover, 1500);
    }
}

function safeDiscover() {
    if (discoveryRetries >= MAX_RETRIES) {
        console.log('ThunderScans Sorter: Max retries reached, stopping auto-discovery.');
        injectControls(false); // Inject controls but show "Manual" status
        return;
    }

    // Disconnect observer while we work
    if (observer) observer.disconnect();

    discoverLayout();
    injectControls(!!activeContainer);

    // Re-attach observer strictly to relevant parts if possible, or body with debounce
    attachObserver();
}

function discoverLayout() {
    console.log('ThunderScans Sorter: Scanning layout...');
    discoveryRetries++;

    let bestContainer = null;
    let bestItemSelector = null;
    let maxItems = 0;

    // Fast check: specific IDs/Classes first
    for (const cSelector of SELECTORS.containerCandidates) {
        const container = document.querySelector(cSelector);
        if (container) {
            for (const iSelector of SELECTORS.itemCandidates) {
                // Direct children check is safer/faster than general querySelectorAll
                // But structure might differ, so we use filtered querySelectorAll
                const items = container.querySelectorAll(iSelector);
                if (items.length > 4) {
                    // Quick integrity check on the first item only
                    const first = items[0];
                    if (first.querySelector('a') || first.querySelector('img')) {
                        if (items.length > maxItems) {
                            maxItems = items.length;
                            bestContainer = container;
                            bestItemSelector = iSelector;
                        }
                    }
                }
            }
        }
    }

    if (bestContainer) {
        activeContainer = bestContainer;
        activeItemSelector = bestItemSelector;
        console.log(`ThunderScans Sorter: Found ${maxItems} items in ${activeContainer.className}`);
        return true;
    }
    return false;
}

function injectControls(layoutFound) {
    if (document.getElementById('ts-sorter-controls')) {
        updateItemCount();
        return;
    }

    const controlPanel = document.createElement('div');
    controlPanel.id = 'ts-sorter-controls';
    controlPanel.className = 'ts-glass-panel';
    controlPanel.innerHTML = `
        <div class="ts-header">
            <span>ThunderScans Sorter</span>
            <div id="ts-item-count" style="font-size: 0.7rem; opacity: 0.6;">
                ${layoutFound ? 'Ready' : 'Standby'}
            </div>
        </div>
        <div class="ts-body">
            <select id="ts-sort-by">
                <option value="default">Default Order</option>
                <option value="rating-desc">Rating: High to Low</option>
                <option value="rating-asc">Rating: Low to High</option>
                <option value="title-asc">Title: A - Z</option>
                <option value="title-desc">Title: Z - A</option>
            </select>
            <button id="ts-sort-btn">Apply Sort</button>
            <button id="ts-retry-btn">Refind Container</button>
        </div>
    `;

    document.body.appendChild(controlPanel);

    document.getElementById('ts-sort-btn').addEventListener('click', () => {
        const sortBy = document.getElementById('ts-sort-by').value;
        if (sortBy === 'default') {
            window.location.reload();
            return;
        }
        performSort(sortBy);
    });

    document.getElementById('ts-retry-btn').addEventListener('click', () => {
        discoveryRetries = 0; // Reset retries on manual click
        safeDiscover();
    });
}

function updateItemCount() {
    const countEl = document.getElementById('ts-item-count');
    if (!countEl) return;

    if (activeContainer && activeItemSelector) {
        const count = activeContainer.querySelectorAll(activeItemSelector).length;
        countEl.innerText = `${count} items found`;
    } else {
        countEl.innerText = 'No items found';
    }
}

function performSort(criteria) {
    if (!activeContainer) {
        // Try one last time
        if (!discoverLayout()) {
            alert("Could not find list of comics. Try scrolling down to load items.");
            return;
        }
    }

    // Stop observer to prevent loop during sorting DOM manipulation
    if (observer) observer.disconnect();

    const items = Array.from(activeContainer.querySelectorAll(activeItemSelector));
    if (items.length === 0) return;

    activeContainer.style.opacity = '0.5';

    // Process in next tick to allow UI update
    setTimeout(() => {
        const sortedItems = [...items].sort((a, b) => {
            const dataA = getItemData(a);
            const dataB = getItemData(b);

            if (criteria === 'rating-desc') return dataB.rating - dataA.rating;
            if (criteria === 'rating-asc') return dataA.rating - dataB.rating;
            if (criteria === 'title-asc') return dataA.title.localeCompare(dataB.title);
            if (criteria === 'title-desc') return dataB.title.localeCompare(dataA.title);
            return 0;
        });

        // Use Fragment for single reflow
        const fragment = document.createDocumentFragment();
        sortedItems.forEach(item => fragment.appendChild(item));

        activeContainer.innerHTML = '';
        activeContainer.appendChild(fragment);

        activeContainer.style.opacity = '1';

        // Re-attach observer after we are done
        attachObserver();
    }, 50);
}

function getItemData(item) {
    // Optimized data lookup - limit scope
    let rating = 0;
    // Common rating containers
    const ratingNode = item.querySelector('.num-score, .score, .rating');
    if (ratingNode) {
        const txt = ratingNode.textContent;
        // Simple parse
        const match = txt.match(/(\d+(\.\d+)?)/);
        if (match) rating = parseFloat(match[0]);
    } else {
        // Fallback: look for typical "10" or "9.5" text floating alone
        // This is expensive, use sparingly
    }

    // Title lookup
    const titleNode = item.querySelector('h3, h4, .title, a');
    const title = titleNode ? titleNode.textContent.trim().toLowerCase() : '';

    return { rating, title };
}

function attachObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
        // Debounce heavily
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Only care if controls are gone OR if we have a container and it got new items
            if (!document.getElementById('ts-sorter-controls')) {
                injectControls(!!activeContainer);
            } else if (activeContainer) {
                updateItemCount();
            }
        }, 2000); // 2 second debounce
    });

    // Observe body allows catching unexpected overwrites, but is costly.
    // Try to observe a wrapper if possible, otherwise body.
    observer.observe(document.body, { childList: true, subtree: false }); // Disable subtree for performance!
}

init();
