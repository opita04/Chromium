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

    def open_fixture(self, section='misc', mode='hidden'):
        page = self.browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        suffix = f'?section={section}&mode={mode}'
        page.goto(
            f'http://127.0.0.1:{self.server.server_port}/tests/watched-hiding-fixture.html{suffix}',
            wait_until='load',
        )
        # The fixture's history load is deliberately asynchronous, matching the
        # extension's real storage path and the existing test convention.
        page.wait_for_timeout(1_200)
        return page, errors

    @staticmethod
    def counters(page):
        return page.evaluate(
            """() => ({ ...(window.__MWYV_TEST_HOOK__?.counters || {}) })"""
        )

    @staticmethod
    def counter(page, name):
        return page.evaluate(
            "name => window.__MWYV_TEST_HOOK__?.counters?.[name] || 0",
            name,
        )

    @staticmethod
    def watched_card_states(page):
        return page.evaluate(
            """() => Object.fromEntries(
              ['expired-video', 'recent-video', 'modern-recent-video', 'youtube-progress-video', 'low-progress-video', 'href-reuse-video'].map(id => {
                const el = document.getElementById(id);
                return [id, { classes: [...el.classList], display: getComputedStyle(el).display }];
              })
            )"""
        )

    def assert_no_page_errors(self, errors):
        self.assertEqual(errors, [])

    def test_watched_cards_remain_visible_outside_subscriptions(self):
        page, errors = self.open_fixture()
        try:
            result = self.watched_card_states(page)
            self.assertNotIn('watched', result['expired-video']['classes'])
            for card in ('recent-video', 'modern-recent-video', 'youtube-progress-video', 'low-progress-video'):
                self.assertIn('watched', result[card]['classes'])
                self.assertNotIn('YT-HWV-WATCHED-DIMMED', result[card]['classes'])
                self.assertNotEqual(result[card]['display'], 'none')
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_watched_cards_hide_in_subscriptions(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            result = self.watched_card_states(page)
            self.assertNotEqual(result['expired-video']['display'], 'none')
            for card in ('recent-video', 'modern-recent-video', 'youtube-progress-video', 'low-progress-video'):
                self.assertEqual(result[card]['display'], 'none')
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_late_legacy_card_uses_incremental_reconciliation(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            before = self.counters(page)
            page.evaluate(
                """() => {
                  window.__mwyvLateCardAt = performance.now();
                  document.getElementById('fixture-feed').appendChild(
                    window.__MWYV_FIXTURE__.legacyCard('late-legacy')
                  );
                }"""
            )
            page.wait_for_function(
                """() => getComputedStyle(document.getElementById('late-legacy')).display === 'none'""",
                timeout=1_000,
            )
            after = self.counters(page)
            latency = page.evaluate("() => performance.now() - window.__mwyvLateCardAt")
            self.assertLess(latency, 200)
            self.assertEqual(after.get('fullFallbacks', 0), before.get('fullFallbacks', 0))
            self.assertEqual(
                after.get('incrementalReconciliations', 0) - before.get('incrementalReconciliations', 0),
                1,
            )
            self.assertEqual(after.get('fullCardScans', 0), before.get('fullCardScans', 0))
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_modern_card_after_navigation_is_incremental(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            full_before_navigation = self.counter(page, 'fullReconciliations')
            page.evaluate(
                """() => {
                  history.pushState({}, '', '/feed/subscriptions?page=2');
                  window.dispatchEvent(new Event('yt-navigate-finish'));
                }"""
            )
            page.wait_for_function(
                "before => (window.__MWYV_TEST_HOOK__?.counters?.fullReconciliations || 0) > before",
                arg=full_before_navigation,
                timeout=2_000,
            )
            full_after_navigation = self.counter(page, 'fullReconciliations')
            fallback_before_append = self.counter(page, 'fullFallbacks')
            cards_before_append = self.counter(page, 'fullCardScans')
            incremental_before_append = self.counter(page, 'incrementalReconciliations')
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_FIXTURE__.modernCard('late-modern')
                )"""
            )
            page.wait_for_function(
                """() => getComputedStyle(document.getElementById('late-modern')).display === 'none'""",
                timeout=1_000,
            )
            self.assertEqual(self.counter(page, 'fullReconciliations'), full_after_navigation)
            self.assertEqual(self.counter(page, 'fullFallbacks'), fallback_before_append)
            self.assertEqual(self.counter(page, 'fullCardScans'), cards_before_append)
            self.assertEqual(self.counter(page, 'incrementalReconciliations'), incremental_before_append + 1)
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_one_hundred_card_burst_coalesces_without_full_fallback(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            page.evaluate("() => localStorage.setItem('MWYV_AUTO_IMPORT_PROGRESS', 'false')")
            before = self.counters(page)
            page.evaluate(
                """() => {
                  const fragment = document.createDocumentFragment();
                  for (let i = 0; i < 100; i++) {
                    fragment.appendChild(window.__MWYV_FIXTURE__.legacyCard(`burst-${i}`));
                  }
                  window.__mwyvBurstAt = performance.now();
                  document.getElementById('fixture-feed').appendChild(fragment);
                }"""
            )
            page.wait_for_function(
                """() => Array.from({ length: 100 }, (_, i) => document.getElementById(`burst-${i}`))
                  .every(card => getComputedStyle(card).display === 'none')""",
                timeout=2_000,
            )
            after = self.counters(page)
            latency = page.evaluate("() => performance.now() - window.__mwyvBurstAt")
            self.assertLess(latency, 200)
            self.assertEqual(
                after.get('scheduledReconciliations', 0) - before.get('scheduledReconciliations', 0),
                1,
            )
            self.assertEqual(
                after.get('incrementalReconciliations', 0) - before.get('incrementalReconciliations', 0),
                1,
            )
            self.assertEqual(after.get('fullFallbacks', 0), before.get('fullFallbacks', 0))
            self.assertEqual(after.get('fullCardScans', 0), before.get('fullCardScans', 0))
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_href_reuse_invalidates_card_identity_and_is_reversible(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            before = self.counters(page)
            page.evaluate(
                """() => {
                  document.querySelector('#href-reuse-video a').href =
                    'https://www.youtube.com/watch?v=href-new';
                }"""
            )
            page.wait_for_function(
                """() => getComputedStyle(document.getElementById('href-reuse-video')).display === 'none'""",
                timeout=1_000,
            )
            page.evaluate(
                """() => {
                  document.querySelector('#href-reuse-video a').href =
                    'https://www.youtube.com/watch?v=href-old';
                }"""
            )
            page.wait_for_function(
                """() => getComputedStyle(document.getElementById('href-reuse-video')).display !== 'none'""",
                timeout=1_000,
            )
            after = self.counters(page)
            self.assertEqual(after.get('fullFallbacks', 0), before.get('fullFallbacks', 0))
            self.assertGreaterEqual(after.get('hrefCacheInvalidations', 0) - before.get('hrefCacheInvalidations', 0), 2)
            self.assertEqual(
                after.get('incrementalReconciliations', 0) - before.get('incrementalReconciliations', 0),
                2,
            )
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_ambiguous_video_shape_uses_full_fallback(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            before = self.counter(page, 'fullFallbacks')
            page.evaluate(
                """() => {
                  const wrapper = document.createElement('div');
                  wrapper.className = 'unknown-video-renderer';
                  const link = document.createElement('a');
                  link.href = 'https://www.youtube.com/watch?v=ambiguous-video';
                  wrapper.appendChild(link);
                  document.getElementById('fixture-feed').appendChild(wrapper);
                }"""
            )
            page.wait_for_function(
                "before => (window.__MWYV_TEST_HOOK__?.counters?.fullFallbacks || 0) > before",
                arg=before,
                timeout=1_000,
            )
            self.assertEqual(
                page.evaluate("() => getComputedStyle(document.getElementById('recent-video')).display"),
                'none',
            )
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_renderer_drift_nested_under_known_card_uses_full_fallback(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            before = self.counter(page, 'fullFallbacks')
            page.evaluate(
                """() => {
                  const drift = document.createElement('div');
                  drift.className = 'drifted-renderer';
                  const link = document.createElement('a');
                  link.href = 'https://www.youtube.com/watch?v=drift-video';
                  drift.appendChild(link);
                  document.getElementById('recent-video').appendChild(drift);
                }"""
            )
            page.wait_for_function(
                "before => (window.__MWYV_TEST_HOOK__?.counters?.fullFallbacks || 0) > before",
                arg=before,
                timeout=1_000,
            )
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_native_signal_attributes_use_incremental_path(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            page.evaluate("() => localStorage.setItem('MWYV_AUTO_IMPORT_PROGRESS', 'false')")
            page.evaluate(
                """() => {
                  const feed = document.getElementById('fixture-feed');
                  feed.append(
                    window.__MWYV_FIXTURE__.signalCard('native-style', 'style'),
                    window.__MWYV_FIXTURE__.signalCard('native-aria', 'aria'),
                    window.__MWYV_FIXTURE__.signalCard('native-overlay', 'overlay'),
                    window.__MWYV_FIXTURE__.signalCard('native-class', 'class')
                  );
                }"""
            )
            page.wait_for_timeout(100)
            before = self.counters(page)
            page.evaluate(
                """() => {
                  const styleSegment = document.querySelector('#native-style .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegmentModern');
                  styleSegment.style.width = '35%';
                  const ariaSegment = document.querySelector('#native-aria [aria-valuenow]');
                  ariaSegment.setAttribute('aria-valuemax', '200');
                  ariaSegment.setAttribute('aria-valuenow', '40');
                  document.querySelector('#native-overlay ytd-thumbnail-overlay-time-status-renderer')
                    .setAttribute('overlay-style', 'WATCHED');
                  document.querySelector('#native-class .signal-segment').className =
                    'ytThumbnailOverlayProgressBarHostWatchedProgressBarSegmentModern';
                }"""
            )
            for card_id in ('native-style', 'native-aria', 'native-overlay', 'native-class'):
                page.wait_for_function(
                    "id => getComputedStyle(document.getElementById(id)).display === 'none'",
                    arg=card_id,
                    timeout=1_000,
                )
            after = self.counters(page)
            self.assertEqual(after.get('fullFallbacks', 0), before.get('fullFallbacks', 0))
            self.assertEqual(
                after.get('incrementalReconciliations', 0) - before.get('incrementalReconciliations', 0),
                1,
            )
            self.assertGreaterEqual(after.get('signalScans', 0), before.get('signalScans', 0) + 1)
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_dimmed_and_hidden_modes_are_reversible(self):
        page, errors = self.open_fixture('subscriptions', mode='dimmed')
        try:
            self.assertEqual(
                page.evaluate("() => getComputedStyle(document.getElementById('recent-video')).display"),
                'inline',
            )
            self.assertTrue(
                page.evaluate(
                    "() => document.getElementById('recent-video').classList.contains('YT-HWV-WATCHED-DIMMED')"
                )
            )
            button = page.locator('.YT-HWV-BUTTONS .YT-HWV-BUTTON').first
            button.click()
            page.wait_for_function(
                """() => getComputedStyle(document.getElementById('recent-video')).display === 'none'""",
                timeout=1_000,
            )
            button = page.locator('.YT-HWV-BUTTONS .YT-HWV-BUTTON').first
            button.click()
            page.wait_for_function(
                """() => {
                  const card = document.getElementById('recent-video');
                  return getComputedStyle(card).display !== 'none' &&
                    !card.classList.contains('YT-HWV-WATCHED-DIMMED') &&
                    !card.classList.contains('YT-HWV-WATCHED-HIDDEN');
                }""",
                timeout=1_000,
            )
        finally:
            page.close()
            self.assert_no_page_errors(errors)

    def test_unrelated_mutation_does_not_schedule_reconciliation(self):
        page, errors = self.open_fixture('subscriptions')
        try:
            before = self.counters(page)
            page.evaluate(
                """() => {
                  const unrelated = document.createElement('div');
                  unrelated.textContent = 'unrelated';
                  document.body.appendChild(unrelated);
                }"""
            )
            page.wait_for_timeout(350)
            after = self.counters(page)
            self.assertEqual(after.get('scheduledReconciliations', 0), before.get('scheduledReconciliations', 0))
            self.assertEqual(after.get('fullFallbacks', 0), before.get('fullFallbacks', 0))
            self.assertEqual(
                page.evaluate("() => getComputedStyle(document.getElementById('recent-video')).display"),
                'none',
            )
        finally:
            page.close()
            self.assert_no_page_errors(errors)


if __name__ == '__main__':
    unittest.main()
