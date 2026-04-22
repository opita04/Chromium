import os
import sys
from playwright.sync_api import sync_playwright

def test_extension():
    extension_path = r"c:\AI\Chromium\mark-watched-extension"
    
    with open("test_output.log", "w", encoding="utf-8") as log_file:
        def log(msg):
            print(msg)
            log_file.write(msg + "\n")
            
        with sync_playwright() as p:
            log("Launching Chromium...")
            browser_args = [
                f"--disable-extensions-except={extension_path}",
                f"--load-extension={extension_path}",
                "--headless=new"
            ]
            
            context = p.chromium.launch_persistent_context(
                "",
                headless=False,
                args=browser_args,
            )
            
            page = context.pages[0]
            
            page.on("console", lambda msg: log(f"CONSOLE [{msg.type}]: {msg.text}"))
            page.on("pageerror", lambda err: log(f"PAGE ERROR: {err}"))
            
            log("Navigating to YouTube...")
            page.goto("https://www.youtube.com", wait_until="networkidle", timeout=60000)
            
            log("Waiting 5 seconds for extension to run...")
            page.wait_for_timeout(5000)
            
            # Click the settings button to toggle some things or check classes
            # Let's see what MWYV logs out
            buttons = page.locator(".YT-HWV-BUTTONS").count()
            log(f"Number of YT-HWV-BUTTONS: {buttons}")
            
            watched = page.locator(".watched").count()
            log(f"Number of manually watched videos (.watched): {watched}")
            
            context.close()
            log("Done.")

if __name__ == "__main__":
    test_extension()
