from playwright.sync_api import sync_playwright

def test_page():
    extension_path = r'c:\AI\Chromium\mark-watched-extension'
    with sync_playwright() as p:
        browser_args = [
            f'--disable-extensions-except={extension_path}',
            f'--load-extension={extension_path}',
            '--headless=new'
        ]
        context = p.chromium.launch_persistent_context('', headless=False, args=browser_args)
        page = context.pages[0]
        
        page.goto('https://www.youtube.com/results?search_query=programming', wait_until='networkidle')
        page.wait_for_timeout(5000)
        
        page.evaluate('''() => {
            const data = {entries: {"ZzhLI6gXgY0": 123456789}, index: ["ZzhLI6gXgY0"]};
            chrome.storage.local.set({ watchedVideos: JSON.stringify(data) });
        }''')
        
        page.wait_for_timeout(2000)
        
        # trigger getHistory
        page.evaluate('''() => {
            window.dispatchEvent(new Event('focus'));
        }''')
        page.wait_for_timeout(2000)
        
        items = page.locator('.watched').count()
        print(f'watched count: {items}')
        
        context.close()

test_page()
