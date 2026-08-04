import functools
import http.server
import math
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


EXTENSION_ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


class WatchedPerformanceTest(unittest.TestCase):
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

    def open_fixture(self, mode='hidden', auto_import='false', fail_read=False, section='subscriptions'):
        page = self.browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        section_query = f'&section={section}' if section else ''
        query = f'?mode={mode}&autoImport={auto_import}&failRead={str(fail_read).lower()}{section_query}'
        page.goto(
            f'http://127.0.0.1:{self.server.server_port}/tests/performance-fixture.html{query}',
            wait_until='load',
        )
        page.wait_for_function(
            "() => window.__MWYV_TEST_HOOK__?.counters?.historyReady === 1 && "
            "window.__MWYV_TEST_HOOK__?.counters?.completedReconciliations >= 1"
        )
        return page, errors

    @staticmethod
    def counters(page):
        return page.evaluate("() => ({ ...(window.__MWYV_TEST_HOOK__?.counters || {}) })")

    def test_known_card_burst_is_one_incremental_pass(self):
        page, errors = self.open_fixture()
        try:
            before = self.counters(page)
            latencies = []
            for batch in range(5):
                page.evaluate(
                    """batch => {
                      const fragment = document.createDocumentFragment();
                      for (let i = 0; i < 100; i++) {
                        fragment.appendChild(window.__MWYV_PERF_FIXTURE__.legacyCard(`batch-${batch}-${i}`));
                      }
                      window.__burstStart = performance.now();
                      document.getElementById('fixture-feed').appendChild(fragment);
                    }""",
                    batch,
                )
                page.wait_for_function(
                    """batch => Array.from({length: 100}, (_, i) => document.getElementById(`batch-${batch}-${i}`))
                      .every(card => getComputedStyle(card).display === 'none')""",
                    arg=batch,
                    timeout=1_000,
                )
                latencies.append(page.evaluate("() => performance.now() - window.__burstStart"))
            after = self.counters(page)
            p95 = sorted(latencies)[max(0, math.ceil(len(latencies) * 0.95) - 1)]
            self.assertLessEqual(p95, 100, latencies)
            self.assertEqual(after['incrementalReconciliations'] - before.get('incrementalReconciliations', 0), 5)
            self.assertEqual(after['fullFallbacks'], before.get('fullFallbacks', 0))
            self.assertEqual(after['fullCardScans'], before.get('fullCardScans', 0))
            self.assertEqual(after['headerRenders'], before.get('headerRenders', 0))
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_signal_batch_writes_history_once(self):
        page, errors = self.open_fixture(auto_import='true')
        try:
            before = self.counters(page)
            page.evaluate(
                """() => {
                  const fragment = document.createDocumentFragment();
                  fragment.appendChild(window.__MWYV_PERF_FIXTURE__.signalCard('signal-a'));
                  fragment.appendChild(window.__MWYV_PERF_FIXTURE__.signalCard('signal-b'));
                  document.getElementById('fixture-feed').appendChild(fragment);
                }"""
            )
            page.wait_for_function(
                """() => ['signal-a', 'signal-b'].every(id =>
                  document.getElementById(id)?.classList.contains('watched'))""",
                timeout=1_000,
            )
            after = self.counters(page)
            self.assertEqual(after['storageWrites'] - before.get('storageWrites', 0), 1)
            self.assertEqual(after['signalScans'] - before.get('signalScans', 0), 1)
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_zero_progress_is_not_classified_as_watched(self):
        page, errors = self.open_fixture(mode='hidden', auto_import='true')
        try:
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.zeroProgressCard('zero-progress')
                )"""
            )
            page.wait_for_function(
                """() => {
                  const card = document.getElementById('zero-progress');
                  return card?.isConnected && getComputedStyle(card).display !== 'none' &&
                    !card.classList.contains('watched');
                }""",
                timeout=1_000,
            )
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_dim_mode_and_route_transition_keep_controls_stable(self):
        page, errors = self.open_fixture(mode='dimmed')
        try:
            before = self.counters(page)
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.modernCard('burst-0')
                )"""
            )
            page.wait_for_function(
                """() => document.getElementById('burst-0')?.classList.contains('YT-HWV-WATCHED-DIMMED')""",
                timeout=1_000,
            )
            after_card = self.counters(page)
            self.assertEqual(after_card['headerRenders'], before['headerRenders'])
            page.evaluate("""() => {
              history.pushState({}, '', '/@calmmoonasmr/videos');
              window.dispatchEvent(new Event('yt-navigate-finish'));
            }""")
            page.wait_for_function(
                """() => document.getElementById('burst-0')?.classList.contains('YT-HWV-WATCHED-DIMMED') === false""",
                timeout=1_000,
            )
            after_route = self.counters(page)
            self.assertGreater(after_route['headerRenders'], after_card['headerRenders'])
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_header_reparent_rerenders_controls(self):
        page, errors = self.open_fixture()
        try:
            before = self.counters(page)
            page.evaluate("""() => {
              const existing = document.querySelector('.YT-HWV-BUTTONS');
              document.body.appendChild(existing);
              const oldEnd = document.getElementById('end');
              const newEnd = document.createElement('div');
              newEnd.id = 'end';
              newEnd.innerHTML = '<div id="buttons"></div>';
              oldEnd.replaceWith(newEnd);
              history.pushState({}, '', '/feed/subscriptions');
              window.dispatchEvent(new Event('yt-navigate-finish'));
            }""")
            page.wait_for_function(
                "before => (window.__MWYV_TEST_HOOK__?.counters?.headerRenders || 0) > before",
                arg=before['headerRenders'],
                timeout=1_000,
            )
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_overlapping_auto_imports_preserve_both_ids(self):
        page, errors = self.open_fixture(auto_import='true')
        try:
            page.evaluate("() => window.__MWYV_PERF_FIXTURE__.controls.blockWrites = true")
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.signalCard('overlap-a')
                )"""
            )
            page.wait_for_function("() => window.__MWYV_PERF_FIXTURE__.controls.pendingWrites.length === 1")
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.signalCard('overlap-b')
                )"""
            )
            page.wait_for_timeout(100)
            page.evaluate("""() => {
              window.__MWYV_PERF_FIXTURE__.controls.blockWrites = false;
              window.__MWYV_PERF_FIXTURE__.controls.releaseWrites();
            }""")
            page.wait_for_function(
                """() => {
                  const data = JSON.parse(window.__MWYV_PERF_FIXTURE__.storage.watchedVideos);
                  return data.entries['overlap-a'] && data.entries['overlap-b'];
                }""",
                timeout=2_000,
            )
            self.assertEqual(errors, [])
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_lifecycle_reload_does_not_drop_pending_imports(self):
        page, errors = self.open_fixture(auto_import='true')
        try:
            page.evaluate("() => window.__MWYV_PERF_FIXTURE__.controls.blockWrites = true")
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.signalCard('lifecycle-a')
                )"""
            )
            page.wait_for_function("() => window.__MWYV_PERF_FIXTURE__.controls.pendingWrites.length === 1")
            page.evaluate("() => document.dispatchEvent(new Event('yt-service-request-completed'))")
            page.wait_for_function(
                "() => (window.__MWYV_TEST_HOOK__?.counters?.historyReloadSkips || 0) >= 1",
                timeout=2_000,
            )
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.signalCard('lifecycle-b')
                )"""
            )
            page.wait_for_function(
                """() => ['lifecycle-a', 'lifecycle-b'].every(id =>
                  document.getElementById(id)?.classList.contains('watched'))""",
                timeout=1_000,
            )
            page.evaluate("""() => {
              window.__MWYV_PERF_FIXTURE__.controls.blockWrites = false;
              window.__MWYV_PERF_FIXTURE__.controls.releaseWrites();
            }""")
            page.wait_for_function(
                """() => {
                  const data = JSON.parse(window.__MWYV_PERF_FIXTURE__.storage.watchedVideos);
                  return data.entries['lifecycle-a'] && data.entries['lifecycle-b'];
                }""",
                timeout=2_000,
            )
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_storage_write_failure_retries_without_page_error(self):
        page, errors = self.open_fixture(auto_import='true')
        try:
            page.evaluate("() => window.__MWYV_PERF_FIXTURE__.controls.failNextWrite = true")
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.signalCard('retry-id')
                )"""
            )
            page.wait_for_function(
                """() => JSON.parse(window.__MWYV_PERF_FIXTURE__.storage.watchedVideos).entries['retry-id']""",
                timeout=2_000,
            )
            self.assertEqual(errors, [])
        finally:
            page.close()
            self.assertEqual(errors, [])

    def test_read_failure_uses_local_last_readable_state(self):
        page, errors = self.open_fixture(mode='hidden', fail_read=True, section='subscriptions')
        try:
            page.evaluate(
                """() => document.getElementById('fixture-feed').appendChild(
                  window.__MWYV_PERF_FIXTURE__.legacyCard('readable-id')
                )"""
            )
            page.wait_for_function("() => getComputedStyle(document.getElementById('readable-id')).display === 'none'")
            self.assertEqual(errors, [])
        finally:
            page.close()
            self.assertEqual(errors, [])


if __name__ == '__main__':
    unittest.main()
