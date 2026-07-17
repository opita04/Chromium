import functools
import http.server
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


EXTENSION_ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


class WatchedHidingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=EXTENSION_ROOT)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            headless=True,
            executable_path=cls.playwright.chromium.executable_path,
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    def assert_watched_cards_hidden(self, section='misc'):
        page = self.browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        suffix = '?section=subscriptions' if section == 'subscriptions' else ''
        page.goto(
            f'http://127.0.0.1:{self.server.server_port}/tests/watched-hiding-fixture.html{suffix}',
            wait_until='load',
        )
        page.wait_for_timeout(1_200)
        result = page.evaluate(
            """() => Object.fromEntries(
              ['expired-video', 'recent-video', 'modern-recent-video', 'youtube-progress-video', 'low-progress-video'].map(id => {
                const el = document.getElementById(id);
                return [id, { classes: [...el.classList], display: getComputedStyle(el).display }];
              })
            )"""
        )
        page.close()

        self.assertNotEqual(result['expired-video']['display'], 'none')
        self.assertEqual(result['recent-video']['display'], 'none')
        self.assertEqual(result['modern-recent-video']['display'], 'none')
        self.assertEqual(result['youtube-progress-video']['display'], 'none')
        self.assertNotEqual(result['low-progress-video']['display'], 'none')
        self.assertEqual(errors, [])

    def test_watched_cards_hide_on_original_section(self):
        self.assert_watched_cards_hidden()

    def test_watched_visibility_applies_to_subscriptions(self):
        self.assert_watched_cards_hidden('subscriptions')


if __name__ == '__main__':
    unittest.main()
