// Default settings
const DEFAULT_SETTINGS = {
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
};

// Load settings when page opens
document.addEventListener('DOMContentLoaded', loadSettings);

async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        
        // Populate form fields
        document.getElementById('downloadClient').value = result.downloadClient;
        document.getElementById('clientHost').value = result.clientHost;
        document.getElementById('clientPort').value = result.clientPort;
        document.getElementById('clientScheme').value = result.clientScheme;
        document.getElementById('clientUsername').value = result.clientUsername;
        document.getElementById('clientPassword').value = result.clientPassword;
        document.getElementById('downloadCategory').value = result.downloadCategory;
        document.getElementById('savePathBase').value = result.savePathBase;
        document.getElementById('pageLimit').value = result.pageLimit;
        
        // Populate URL list
        populateUrlList(result.audiobookbayDomains);
        
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Error loading settings', 'error');
    }
}

function populateUrlList(domains) {
    const urlList = document.getElementById('urlList');
    urlList.innerHTML = '';
    
    if (domains && domains.length > 0) {
        domains.forEach(domain => {
            const urlItem = createUrlItem(domain);
            urlList.appendChild(urlItem);
        });
    } else {
        const emptyMessage = document.createElement('p');
        emptyMessage.textContent = 'No domains configured. Add some domains above.';
        emptyMessage.style.color = '#666';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.margin = '20px';
        urlList.appendChild(emptyMessage);
    }
}

function createUrlItem(domain) {
    const urlItem = document.createElement('div');
    urlItem.className = 'url-item';
    
    const domainSpan = document.createElement('span');
    domainSpan.textContent = domain;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => removeUrl(domain);
    
    urlItem.appendChild(domainSpan);
    urlItem.appendChild(removeBtn);
    
    return urlItem;
}

async function addUrl() {
    const newUrlInput = document.getElementById('newUrlInput');
    const domain = newUrlInput.value.trim();
    
    if (!domain) {
        showStatus('Please enter a domain name', 'error');
        return;
    }
    
    // Clean up the domain (remove protocol, www, trailing slash)
    const cleanDomain = cleanupDomain(domain);
    
    if (!isValidDomain(cleanDomain)) {
        showStatus('Please enter a valid domain name', 'error');
        return;
    }
    
    try {
        const result = await chrome.storage.sync.get(['audiobookbayDomains']);
        const currentDomains = result.audiobookbayDomains || [];
        
        if (currentDomains.includes(cleanDomain)) {
            showStatus('Domain already exists', 'error');
            return;
        }
        
        const updatedDomains = [...currentDomains, cleanDomain];
        await chrome.storage.sync.set({ audiobookbayDomains: updatedDomains });
        
        populateUrlList(updatedDomains);
        newUrlInput.value = '';
        showStatus('Domain added successfully', 'success');
        
    } catch (error) {
        console.error('Error adding domain:', error);
        showStatus('Error adding domain', 'error');
    }
}

async function addPresetUrl(domain) {
    try {
        const result = await chrome.storage.sync.get(['audiobookbayDomains']);
        const currentDomains = result.audiobookbayDomains || [];
        
        if (currentDomains.includes(domain)) {
            showStatus(`${domain} is already added`, 'error');
            return;
        }
        
        const updatedDomains = [...currentDomains, domain];
        await chrome.storage.sync.set({ audiobookbayDomains: updatedDomains });
        
        populateUrlList(updatedDomains);
        showStatus(`${domain} added successfully`, 'success');
        
    } catch (error) {
        console.error('Error adding preset domain:', error);
        showStatus('Error adding domain', 'error');
    }
}

async function removeUrl(domainToRemove) {
    try {
        const result = await chrome.storage.sync.get(['audiobookbayDomains']);
        const currentDomains = result.audiobookbayDomains || [];
        const updatedDomains = currentDomains.filter(domain => domain !== domainToRemove);
        
        await chrome.storage.sync.set({ audiobookbayDomains: updatedDomains });
        populateUrlList(updatedDomains);
        showStatus('Domain removed successfully', 'success');
        
    } catch (error) {
        console.error('Error removing domain:', error);
        showStatus('Error removing domain', 'error');
    }
}

function cleanupDomain(domain) {
    // Remove protocol
    domain = domain.replace(/^https?:\/\//, '');
    // Remove www.
    domain = domain.replace(/^www\./, '');
    // Remove trailing slash
    domain = domain.replace(/\/$/, '');
    // Remove any path
    domain = domain.split('/')[0];
    
    return domain.toLowerCase();
}

function isValidDomain(domain) {
    // Basic domain validation
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    return domainRegex.test(domain);
}

async function saveSettings() {
    try {
        const settings = {
            downloadClient: document.getElementById('downloadClient').value,
            clientHost: document.getElementById('clientHost').value,
            clientPort: parseInt(document.getElementById('clientPort').value) || 8080,
            clientScheme: document.getElementById('clientScheme').value,
            clientUsername: document.getElementById('clientUsername').value,
            clientPassword: document.getElementById('clientPassword').value,
            downloadCategory: document.getElementById('downloadCategory').value,
            savePathBase: document.getElementById('savePathBase').value,
            pageLimit: parseInt(document.getElementById('pageLimit').value) || 5
        };
        
        // Don't overwrite domains, just update other settings
        const result = await chrome.storage.sync.get(['audiobookbayDomains']);
        settings.audiobookbayDomains = result.audiobookbayDomains;
        
        await chrome.storage.sync.set(settings);
        showStatus('Settings saved successfully!', 'success');
        
        // Notify background script that settings changed
        chrome.runtime.sendMessage({ action: 'settingsUpdated' });
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Error saving settings', 'error');
    }
}

async function testConnection() {
    try {
        const downloadClient = document.getElementById('downloadClient').value;
        const clientHost = document.getElementById('clientHost').value;
        const clientPort = parseInt(document.getElementById('clientPort').value);
        const clientScheme = document.getElementById('clientScheme').value;
        const clientUsername = document.getElementById('clientUsername').value;
        const clientPassword = document.getElementById('clientPassword').value;
        
        if (!clientHost || !clientPort) {
            showStatus('Please fill in host and port fields', 'error');
            return;
        }
        
        showStatus('Testing connection...', 'success');
        
        // Send test message to background script
        const response = await chrome.runtime.sendMessage({
            action: 'testTorrentConnection',
            config: {
                downloadClient,
                clientHost,
                clientPort,
                clientScheme,
                clientUsername,
                clientPassword
            }
        });
        
        if (response && response.success) {
            showStatus('Connection successful!', 'success');
        } else {
            showStatus(`Connection failed: ${response.error || 'Unknown error'}`, 'error');
        }
        
    } catch (error) {
        console.error('Error testing connection:', error);
        showStatus('Error testing connection', 'error');
    }
}

function updateClientFields() {
    const downloadClient = document.getElementById('downloadClient').value;
    const portField = document.getElementById('clientPort');
    
    // Set default ports based on client type
    switch (downloadClient) {
        case 'qbittorrent':
            if (!portField.value || portField.value === '9091' || portField.value === '8112') {
                portField.value = '8080';
            }
            break;
        case 'transmission':
            if (!portField.value || portField.value === '8080' || portField.value === '8112') {
                portField.value = '9091';
            }
            break;
        case 'delugeweb':
            if (!portField.value || portField.value === '8080' || portField.value === '9091') {
                portField.value = '8112';
            }
            break;
    }
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('saveStatus');
    statusDiv.textContent = message;
    statusDiv.className = `save-status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// Handle Enter key in new URL input
document.addEventListener('DOMContentLoaded', () => {
    const newUrlInput = document.getElementById('newUrlInput');
    if (newUrlInput) {
        newUrlInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                addUrl();
            }
        });
    }
});
