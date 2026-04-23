// Chrome Extension Version of "Mark Watched YouTube Videos"
// Ported from TamperMonkey script by jcunews
// Original version: 1.4.63

(() => {
  // Chrome storage helpers to replace GM_getValue/GM_setValue
  function gmGet(key, defaultValue = undefined) {
    return new Promise(resolve => {
      chrome.storage.local.get([key], result => {
        resolve(result[key] ?? defaultValue);
      });
    });
  }

  function gmSet(key, value) {
    return chrome.storage.local.set({ [key]: value });
  }

  //=== config start ===
  var maxWatchedVideoAge = 10 * 365; // number of days. set to zero to disable (not recommended)
  var contentLoadMarkDelay = 600; // number of milliseconds to wait before marking video items on content load phase (increase if slow network/browser)
  var markerMouseButtons = [0, 1]; // one or more mouse buttons to use for manual marker toggle. 0=left, 1=right, 2=middle
  //=== config end ===

  var
    watchedVideos, ageMultiplier = 24 * 60 * 60 * 1000, xu = /(?:\/watch(?:\?|.*?&)v=|\/embed\/)([^\/\?&]+)|\/shorts\/([^\/\?]+)/,
    querySelector = Element.prototype.querySelector, querySelectorAll = Element.prototype.querySelectorAll;

  function getVideoId(url) {
    var vid = url.match(xu);
    if (vid) vid = vid[1] || vid[2];
    return vid;
  }

  function watched(vid) {
    return !!watchedVideos.entries[vid];
  }

  function processVideoItems(selector) {
    var items = document.querySelectorAll(selector), i;
    for (i = items.length - 1; i >= 0; i--) {
      var videoId = extractVideoIdFromContainer(items[i]);
      if (videoId && watched(videoId)) {
        items[i].classList.add("watched");
      } else {
        items[i].classList.remove("watched");
      }
    }
  }

  function processAllVideoItems() {
    processVideoItems(`
      ytd-rich-item-renderer,
      ytd-video-renderer,
      ytd-grid-video-renderer,
      ytd-compact-video-renderer,
      ytd-playlist-video-renderer,
      ytd-playlist-panel-video-renderer,
      ytd-reel-item-renderer,
      ytd-rich-grid-media,
      .yt-shelf-grid-item,
      .video-list-item,
      .ytd-newspaper-renderer,
      .browse-list-item-container,
      .ytd-channel-featured-content-renderer,
      .pl-video
    `);
  }

  async function addHistory(vid, time, noSave, i) {
    if (!watchedVideos.entries[vid]) {
      watchedVideos.index.push(vid);
    } else {
      i = watchedVideos.index.indexOf(vid);
      if (i >= 0) watchedVideos.index.push(watchedVideos.index.splice(i, 1)[0])
    }
    watchedVideos.entries[vid] = time;
    if (!noSave) await gmSet("watchedVideos", JSON.stringify(watchedVideos));
  }

  async function delHistory(index, noSave) {
    delete watchedVideos.entries[watchedVideos.index[index]];
    watchedVideos.index.splice(index, 1);
    if (!noSave) await gmSet("watchedVideos", JSON.stringify(watchedVideos));
  }

  var dc, ut;
  function parseData(s, a, i, j, z) {
    try {
      dc = false;
      s = JSON.parse(s);
      //convert to new format if old format.
      //old: [{id:<strVID>, timestamp:<numDate>}, ...]
      //new: {entries:{<stdVID>:<numDate>, ...}, index:[<strVID>, ...]}
      if (Array.isArray(s) && (!s.length || (("object" === typeof s[0]) && s[0].id && s[0].timestamp))) {
        a = s;
        s = { entries: {}, index: [] };
        a.forEach(o => {
          s.entries[o.id] = o.timestamp;
          s.index.push(o.id);
        });
      } else if (("object" !== typeof s) || ("object" !== typeof s.entries) || !Array.isArray(s.index)) return null;
      //reconstruct index if broken
      if (s.index.length !== (a = Object.keys(s.entries)).length) {
        s.index = a.map(k => [k, s.entries[k]]).sort((x, y) => x[1] - y[1]).map(v => v[0]);
        dc = true;
      }
      return s;
    } catch (z) {
      return null;
    }
  }

  function parseYouTubeData(s, a) {
    try {
      s = JSON.parse(s);
      //convert to native format if YouTube format.
      //old: [{titleUrl:<strUrl>, time:<strIsoDate>}, ...] (excludes irrelevant properties)
      //new: {entries:{<stdVID>:<numDate>, ...}, index:[<strVID>, ...]}
      if (Array.isArray(s) && (!s.length || (("object" === typeof s[0]) && s[0].titleUrl && s[0].time))) {
        a = s;
        s = { entries: {}, index: [] };
        a.forEach((o, m, t) => {
          if (o.titleUrl && (m = o.titleUrl.match(xu))) {
            if (isNaN(t = (new Date(o.time)).getTime())) t = (new Date()).getTime();
            s.entries[m[1] || m[2]] = t;
            s.index.push(m[1] || m[2]);
          }
        });
        s.index.reverse();
        return s;
      } else return null;
    } catch (a) {
      return null;
    }
  }

  function mergeData(o, a) {
    o.index.forEach(i => {
      if (watchedVideos.entries[i]) {
        if (watchedVideos.entries[i] < o.entries[i]) watchedVideos.entries[i] = o.entries[i];
      } else watchedVideos.entries[i] = o.entries[i];
    });
    a = Object.keys(watchedVideos.entries);
    watchedVideos.index = a.map(k => [k, watchedVideos.entries[k]]).sort((x, y) => x[1] - y[1]).map(v => v[0]);
  }

  async function getHistory(a, b) {
    console.log('getHistory started');
    a = await gmGet("watchedVideos");
    console.log('gmGet returned: ' + (typeof a));
    if (a === undefined) {
      a = '{"entries": {}, "index": []}';
    } else if ("object" === typeof a) a = JSON.stringify(a);
    if (b = parseData(a)) {
      watchedVideos = b;
      if (dc) b = JSON.stringify(b);
    } else b = JSON.stringify(watchedVideos = { entries: {}, index: [] });
    await gmSet("watchedVideos", b);
  }

  async function doProcessPage() {
    console.log('doProcessPage started');
    //get list of watched videos
    await getHistory();
    console.log('After getHistory, watchedVideos index length: ' + (watchedVideos ? watchedVideos.index.length : 'undefined'));

    //remove old watched video history
    var now = (new Date()).valueOf(), changed, vid;
    if (maxWatchedVideoAge > 0) {
      while (watchedVideos.index.length) {
        if (((now - watchedVideos.entries[watchedVideos.index[0]]) / ageMultiplier) > maxWatchedVideoAge) {
          await delHistory(0, true);
          changed = true;
        } else break;
      }
      if (changed) await gmSet("watchedVideos", JSON.stringify(watchedVideos));
    }

    //check and remember current video
    if ((vid = getVideoId(location.href)) && !watched(vid)) await addHistory(vid, now);

    //mark watched videos
    processAllVideoItems();

    // One-shot: auto-import videos YouTube already knows are watched (delayed to let thumbnails render)
    setTimeout(() => autoImportWatchedFromProgressBars().catch(console.error), contentLoadMarkDelay);
  }

  function processPage() {
    setTimeout(() => doProcessPage().catch(console.error), Math.floor(contentLoadMarkDelay / 2));
  }

  function delayedProcessPage() {
    setTimeout(() => doProcessPage().catch(console.error), contentLoadMarkDelay);
  }

  async function toggleMarker(ele, i) {
    if (ele) {
      if (!ele.href && (i = ele.closest('a'))) ele = i;
      if (ele.href) {
        i = getVideoId(ele.href);
      } else {
        while (ele) {
          while (ele && (!ele.__data || !ele.__data.data || !ele.__data.data.videoId)) ele = ele.__dataHost || ele.parentNode;
          if (ele) {
            i = ele.__data.data.videoId;
            break
          }
        }
      }
      if (i) {
        if ((ele = watchedVideos.index.indexOf(i)) >= 0) {
          await delHistory(ele);
        } else await addHistory(i, (new Date()).valueOf());
        processAllVideoItems();
      }
    }
  }

  var rxListUrl = /\/\w+_ajax\?|\/results\?search_query|\/v1\/(browse|next|search)\?/;
  var xhropen = XMLHttpRequest.prototype.open, xhrsend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.url_mwyv = url;
    return xhropen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (method, url) {
    if (rxListUrl.test(this.url_mwyv) && !this.listened_mwyv) {
      this.listened_mwyv = 1;
      this.addEventListener("load", delayedProcessPage);
    }
    return xhrsend.apply(this, arguments);
  };

  var fetch_ = window.fetch;
  window.fetch = function (opt) {
    let url = opt.url || opt;
    if (rxListUrl.test(opt.url || opt)) {
      return fetch_.apply(this, arguments).finally(delayedProcessPage);
    } else return fetch_.apply(this, arguments);
  };
  var nac = window.Node.prototype.appendChild;
  window.Node.prototype.appendChild = function (e) {
    var z;
    if ((this.tagName === "BODY") && (e?.tagName === "IFRAME")) {
      var r = nac.apply(this, arguments);
      try {
        if (/^about:blank\b/.test(e.contentWindow.location.href)) e.contentWindow.fetch = fetch
      } catch (z) { }
      return r
    } else return nac.apply(this, arguments)
  }

  var to = { createHTML: s => s };
  console.log('Checking for trustedTypes availability');
  var tp = (typeof window !== 'undefined' && typeof window.trustedTypes !== 'undefined' && window.trustedTypes.createPolicy)
    ? window.trustedTypes.createPolicy("", to)
    : to;
  console.log('trustedTypes policy set: ' + (tp === to ? 'fallback' : 'created'));
  var html = s => tp.createHTML(s);

  addEventListener("DOMContentLoaded", sty => {
    sty = document.createElement("STYLE");
    sty.innerHTML = html(`
.watched:not(ytd-thumbnail):not(.details):not(.metadata), .watched .yt-ui-ellipsis
  { outline: .2em solid #4CAF50 !important; border-radius: 1em; background-color: #E8F5E8 !important }
html[dark] .watched:not(ytd-thumbnail):not(.details):not(.metadata), html[dark] .watched .yt-ui-ellipsis,
.playlist-videos-container>.playlist-videos-list>li.watched,
.playlist-videos-container>.playlist-videos-list>li.watched>a,
.playlist-videos-container>.playlist-videos-list>li.watched .yt-ui-ellipsis
  { outline: .2em solid #2E7D32 !important; border-radius: 1em; background-color: #1B5E20 !important }

/* Tooltip styles */
.mwyv-tooltip {
  position: fixed;
  background: #333;
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-family: Arial, sans-serif;
  z-index: 10000;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
  max-width: 250px;
  line-height: 1.3;
}
.mwyv-tooltip.show {
  opacity: 1;
}`);
    document.head.appendChild(sty);
    var nde = Node.prototype.dispatchEvent;
    Node.prototype.dispatchEvent = function (ev) {
      if (ev.type === "yt-service-request-completed") {
        clearTimeout(ut);
        ut = setTimeout(() => doProcessPage().catch(console.error), contentLoadMarkDelay / 2)
      }
      return nde.apply(this, arguments)
    };
  });

  var lastFocusState = document.hasFocus();
  addEventListener("blur", () => {
    lastFocusState = false;
  });
  addEventListener("focus", () => {
    if (!lastFocusState) processPage();
    lastFocusState = true;
  });
  addEventListener("click", (ev) => {
    if ((markerMouseButtons.indexOf(ev.button) >= 0) && ev.altKey) {
      ev.stopImmediatePropagation();
      ev.stopPropagation();
      ev.preventDefault();
      toggleMarker(ev.target).catch(console.error);
    }
  }, true);

  if (markerMouseButtons.indexOf(1) >= 0) {
    addEventListener("contextmenu", (ev) => {
      if (ev.altKey) toggleMarker(ev.target).catch(console.error);
    });
  }
  if (window["body-container"]) { //old
    addEventListener("spfdone", processPage);
    processPage();
  } else { //new
    var t = 0;
    function pl() {
      clearTimeout(t);
      t = setTimeout(processPage, 300);
    }
    (function init(vm) {
      if (vm = document.getElementById("visibility-monitor")) {
        vm.addEventListener("viewport-load", pl);
      } else setTimeout(init, 100);
    })();
    (function init2(mh) {
      if (mh = document.getElementById("masthead")) {
        mh.addEventListener("yt-rendererstamper-finished", pl);
      } else setTimeout(init2, 100);
    })();
    addEventListener("load", delayedProcessPage);
    addEventListener("spfprocess", delayedProcessPage);
  }

  // Replace GM_registerMenuCommand with simulated menu functionality
  // Create statistics display function
  async function displayHistoryStats() {
    function sum(r, v) {
      return r + v;
    }
    function avg(arr, cnt) {
      arr = Object.values(arr);
      cnt = cnt || arr?.length;
      return arr?.length ? Math.round(arr.reduce(sum, 0) / cnt) : "(n/a)";
    }
    var t0 = Infinity, t1 = -Infinity, d0 = Infinity, d1 = -Infinity, ld = {}, e0, e1, o0, o1, sp, ad, am, ay;
    await getHistory();
    Object.keys(watchedVideos.entries).forEach((k, t, a) => {
      t = new Date(watchedVideos.entries[k]);
      a = t.getTime();
      if (a < t0) t0 = a;
      if (a > t1) t1 = a;
      a = Math.floor(a / 86400000);
      if (a < d0) d0 = a;
      if (a > d1) d1 = a;
      ld[a] = (ld[a] || 0) + 1;
    });
    d1 -= d0 - 1;
    if (watchedVideos.index.length) {
      e0 = (o0 = new Date(t0)).toLocaleString();
      e1 = (o1 = new Date(t1)).toLocaleString();
      t1 = o1.getFullYear() - o0.getFullYear();
      if ((t0 = o1.getMonth() - o0.getMonth()) < 0) {
        t0 += 12;
        t1--
      }
      if ((d0 = o1.getDate() - o0.getDate()) < 0) {
        d0 += 30;
        if (--t0 < 0) {
          t0 += 12;
          t1--
        }
      }
      sp = `${t1} years ${t0} months ${d0} days (${d1} days total)`;
      ad = avg(ld, d1);
      am = avg(ld, d1 / 30);
      ay = avg(ld, d1 / 365);
    } else e0 = e1 = sp = ad = am = ay = "(n/a)";
    alert(`\
Number of entries: ${watchedVideos.index.length}
Oldest entry: ${e0}
Newest entry: ${e1}
Time span: ${sp}

Average viewed videos per day: ${ad}
Average viewed videos per month: ${am}
Average viewed videos per year: ${ay}

History data size: ${JSON.stringify(watchedVideos).length} bytes\
`);
  }

  // Backup history data function
  async function backupHistoryData() {
    await getHistory();
    const blob = new Blob([JSON.stringify(watchedVideos)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = `MarkWatchedYouTubeVideos_${(new Date()).toISOString()}.json`;

    try {
      // Try using Chrome downloads API
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
    } catch (e) {
      // Fallback to traditional download method
      const a = document.createElement("A");
      document.body.appendChild(a);
      a.href = url;
      a.download = filename;
      a.click();
      a.remove();
    }
    URL.revokeObjectURL(url);
  }

  // Restore history data function
  async function restoreHistoryData() {
    function askRestore(o) {
      const mergeCheckbox = document.getElementById('mwyvrhm_ujs');
      if (confirm(`Selected history data file contains ${o.index.length} entries.\n\nRestore from this data?`)) {
        if (mergeCheckbox && mergeCheckbox.checked) {
          mergeData(o);
        } else watchedVideos = o;
        gmSet("watchedVideos", JSON.stringify(watchedVideos));
        a.remove();
        doProcessPage().catch(console.error);
      }
    }
    if (window.mwyvrh_ujs) return;
    let a = document.createElement("DIV");
    a.id = "mwyvrh_ujs";
    a.innerHTML = html(`<style>
#mwyvrh_ujs{
  display:flex;position:fixed;z-index:99999;left:0;top:0;right:0;bottom:0;margin:0;border:none;padding:0;background:rgb(0,0,0,0.5);
  color:#000;font-family:sans-serif;font-size:12pt;line-height:12pt;font-weight:normal;cursor:pointer;
}
#mwyvrhb_ujs{
  margin:auto;border:.3rem solid #007;border-radius:.3rem;padding:.5rem .5em;background-color:#fff;cursor:auto;
}
#mwyvrht_ujs{margin-bottom:1rem;font-size:14pt;line-height:14pt;font-weight:bold}
#mwyvrhmc_ujs{margin:.5em 0 1em 0;text-align:center}
#mwyvrhi_ujs{display:block;margin:1rem auto .5rem auto;overflow:hidden}
</style>
<div id="mwyvrhb_ujs">
  <div id="mwyvrht_ujs">Mark Watched YouTube Videos</div>
  Please select a file to restore history data from.
  <div id="mwyvrhmc_ujs"><label><input id="mwyvrhm_ujs" type="checkbox" checked /> Merge history data instead of replace.</label></div>
  <input id="mwyvrhi_ujs" type="file" multiple />
</div>`);
    a.onclick = e => {
      (e.target === a) && a.remove();
    };
    let b = querySelector.call(a, "#mwyvrhi_ujs");
    b.onchange = r => {
      r = new FileReader();
      r.onload = (o, t) => {
        if (o = parseData(r = r.result)) { //parse as native format
          if (o.index.length) {
            askRestore(o);
          } else alert("File doesn't contain any history entry.");
        } else if (o = parseYouTubeData(r)) { //parse as YouTube format
          if (o.index.length) {
            askRestore(o);
          } else alert("File doesn't contain any history entry.");
        } else { //parse as URL list
          o = { entries: {}, index: [] };
          t = (new Date()).getTime();
          r = r.replace(/\r/g, "").split("\n");
          while (r.length && !r[0].trim()) r.shift();
          if (r.length && xu.test(r[0])) {
            r.forEach(s => {
              if (s = s.match(xu)) {
                o.entries[s[1] || s[2]] = t;
                o.index.push(s[1] || s[2]);
              }
            });
            if (o.index.length) {
              askRestore(o);
            } else alert("File doesn't contain any history entry.");
          } else alert("Invalid history data file.");
        }
      };
      r.readAsText(b.files[0]);
    };
    document.documentElement.appendChild(a);
    b.click();
  }

  // === Hide_and_Dim-inspired watched/shorts detection and UI ===
  // --- CSS for dimming/hiding watched videos and shorts ---
  (function addWatchedDimCSS() {
    const style = document.createElement('style');
    style.textContent = `
      .YT-HWV-WATCHED-HIDDEN, 
      ytd-rich-item-renderer.YT-HWV-WATCHED-HIDDEN, 
      ytd-video-renderer.YT-HWV-WATCHED-HIDDEN,
      ytd-grid-video-renderer.YT-HWV-WATCHED-HIDDEN,
      ytd-compact-video-renderer.YT-HWV-WATCHED-HIDDEN { display: none !important; opacity: 0 !important; height: 0 !important; width: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; border: 0 !important; }
      
      .YT-HWV-WATCHED-DIMMED,
      ytd-rich-item-renderer.YT-HWV-WATCHED-DIMMED, 
      ytd-video-renderer.YT-HWV-WATCHED-DIMMED,
      ytd-grid-video-renderer.YT-HWV-WATCHED-DIMMED,
      ytd-compact-video-renderer.YT-HWV-WATCHED-DIMMED { opacity: 0.3 !important; }
      
      .YT-HWV-SHORTS-HIDDEN { display: none !important; opacity: 0 !important; height: 0 !important; width: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
      .YT-HWV-SHORTS-DIMMED { opacity: 0.3 !important; }
      .YT-HWV-HIDDEN-ROW-PARENT { padding-bottom: 10px !important; }
      .YT-HWV-BUTTONS {
        background: transparent !important;
        border: 1px solid var(--ytd-searchbox-legacy-border-color, rgba(255,255,255,0.2)) !important;
        border-radius: 40px !important;
        display: flex !important;
        gap: 5px !important;
        margin: 0 20px !important;
      }
      .YT-HWV-BUTTON {
        align-items: center !important;
        background: transparent !important;
        border: 0 !important;
        border-radius: 40px !important;
        color: var(--yt-spec-icon-inactive, #909090) !important;
        cursor: pointer !important;
        display: flex !important;
        height: 40px !important;
        justify-content: center !important;
        outline: 0 !important;
        width: 40px !important;
      }
      .YT-HWV-BUTTON:focus,
      .YT-HWV-BUTTON:hover {
        background: var(--yt-spec-badge-chip-background, rgba(255,255,255,0.1)) !important;
      }
      .YT-HWV-BUTTON-DISABLED { color: var(--yt-spec-icon-disabled, #606060) !important; }
      html[dark] .YT-HWV-BUTTON { color: var(--yt-spec-icon-inactive, #aaa) !important; }
      html[dark] .YT-HWV-BUTTON-DISABLED { color: var(--yt-spec-icon-disabled, #606060) !important; }
      html[dark] .YT-HWV-BUTTONS { border-color: var(--ytd-searchbox-legacy-border-color, rgba(255,255,255,0.2)) !important; }
    `;
    document.head.appendChild(style);
  })();

  // --- Settings storage and default ---
  const THRESHOLD_KEY = 'MWYV_HIDDEN_THRESHOLD_PERCENT';
  const AUTO_IMPORT_KEY = 'MWYV_AUTO_IMPORT_PROGRESS';
  function getThreshold() {
    let v = localStorage.getItem(THRESHOLD_KEY);
    v = v === null ? 10 : parseInt(v, 10);
    if (isNaN(v) || v < 0 || v > 100) v = 10;
    return v;
  }
  function setThreshold(v) {
    v = Math.max(0, Math.min(100, parseInt(v, 10)));
    localStorage.setItem(THRESHOLD_KEY, v);
  }
  function getAutoImport() {
    return localStorage.getItem(AUTO_IMPORT_KEY) !== 'false'; // default true
  }
  function setAutoImport(v) {
    localStorage.setItem(AUTO_IMPORT_KEY, v ? 'true' : 'false');
  }

  // --- Watched video detection using multiple YouTube signals ---
  function getProgressPercent(bar) {
    // Check inline style width
    if (bar.style.width) {
      const w = Number.parseInt(bar.style.width, 10);
      if (!isNaN(w)) return w;
    }
    // Check computed width as percentage of parent
    try {
      const parent = bar.parentElement;
      if (parent && parent.offsetWidth > 0) {
        const pct = Math.round((bar.offsetWidth / parent.offsetWidth) * 100);
        if (pct > 0) return pct;
      }
    } catch (_) { /* ignore */ }
    return 0;
  }

  // Returns the VIDEO CONTAINER elements (not inner bar elements) for all YouTube-detected watched videos
  function findWatchedContainers() {
    const threshold = getThreshold();
    const seen = new WeakSet();
    const results = [];

    function addContainer(el) {
      if (!el) return;
      // Walk up to find the outermost video item container
      const container = el.closest('ytd-rich-item-renderer')
        || el.closest('ytd-video-renderer')
        || el.closest('ytd-grid-video-renderer')
        || el.closest('ytd-compact-video-renderer')
        || el.closest('ytd-playlist-video-renderer')
        || el.closest('ytd-rich-grid-media')
        || el.closest('.ytd-item-section-renderer')
        || el;
      if (container && !seen.has(container)) {
        seen.add(container);
        results.push(container);
      }
    }

    // Signal 1: Red progress bar with sufficient width
    document.querySelectorAll(
      'ytd-thumbnail-overlay-resume-playback-renderer #progress, ' +
      '.ytd-thumbnail-overlay-resume-playback-renderer, ' +
      '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegmentModern'
    ).forEach(bar => {
      // If it's the parent renderer, the width might be on the child #progress
      const actualBar = bar.id === 'progress' || bar.style.width ? bar : (bar.querySelector('#progress') || bar);
      if (getProgressPercent(actualBar) >= threshold) addContainer(bar);
    });

    // Signal 2: Explicit "WATCHED" badge
    document.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer[overlay-style="WATCHED"]').forEach(addContainer);

    return results;
  }

  // --- Auto-import: add progress-bar-detected videos to internal store ---
  function extractVideoIdFromContainer(container) {
    if (!container) return null;
    // Try finding an anchor with a video URL
    const link = container.querySelector('a#thumbnail[href*="/watch?"], a#thumbnail[href*="/shorts/"], a.ytd-thumbnail[href*="/watch?"], a.ytd-thumbnail[href*="/shorts/"]');
    if (link && link.href) return getVideoId(link.href);
    
    // Fallback to any anchor if no thumbnail anchor is found
    const fallbackLink = container.querySelector('a[href*="/watch?"], a[href*="/shorts/"]');
    if (fallbackLink && fallbackLink.href) return getVideoId(fallbackLink.href);

    // Try YT data model
    let el = container;
    while (el) {
      if (el.__data?.data?.videoId) return el.__data.data.videoId;
      el = el.__dataHost || el.parentNode;
      if (el === document) break;
    }
    return null;
  }

  async function autoImportWatchedFromProgressBars() {
    if (!getAutoImport() || !watchedVideos) return;
    // Use containers directly — no .closest() traversal needed
    const containers = findWatchedContainers();
    let imported = 0;
    const now = (new Date()).valueOf();
    for (const container of containers) {
      const vid = extractVideoIdFromContainer(container);
      if (vid && !watched(vid)) {
        await addHistory(vid, now, true); // noSave=true, batch save after loop
        imported++;
      }
    }
    if (imported > 0) {
      await gmSet("watchedVideos", JSON.stringify(watchedVideos));
      console.log(`[MWYV] Auto-imported ${imported} video(s) from YouTube signals`);
      // Update green outlines for newly-imported videos
      processAllVideoItems();
    }
  }

  // --- Shorts detection ---
  function findShortsContainers() {
    const shortsContainers = [
      document.querySelectorAll('[is-shorts]'),
      document.querySelectorAll('ytd-reel-shelf-renderer ytd-reel-item-renderer'),
      document.querySelectorAll('ytd-rich-shelf-renderer ytd-rich-grid-slim-media'),
      document.querySelectorAll('ytd-reel-shelf-renderer ytd-thumbnail'),
      document.querySelectorAll('ytd-reel-shelf-renderer .ytd-reel-shelf-renderer'),
    ].reduce((acc, matches) => {
      matches?.forEach(child => {
        const container = child.closest('ytd-reel-shelf-renderer') || child.closest('ytd-rich-shelf-renderer');
        if (container && !acc.includes(container)) acc.push(container);
      });
      return acc;
    }, []);
    document.querySelectorAll('.ytd-thumbnail-overlay-time-status-renderer[aria-label="Shorts"]').forEach(child => {
      const container = child.closest('ytd-video-renderer') || child.closest('ytd-rich-item-renderer') || child.closest('ytd-grid-video-renderer') || child.closest('ytd-compact-video-renderer') || child;
      if (container && !shortsContainers.includes(container)) shortsContainers.push(container);
    });
    return shortsContainers;
  }

  // --- Section detection for per-section state ---
  function determineYoutubeSection() {
    const { href } = window.location;
    let youtubeSection = 'misc';
    if (href.includes('/watch?')) youtubeSection = 'watch';
    else if (href.match(/.*\/(user|channel|c)\/.+\/videos/u) || href.match(/.*\/@.*/u)) youtubeSection = 'channel';
    else if (href.includes('/feed/subscriptions')) youtubeSection = 'subscriptions';
    else if (href.includes('/feed/trending')) youtubeSection = 'trending';
    else if (href.includes('/playlist?')) youtubeSection = 'playlist';
    else if (href.includes('/results?')) youtubeSection = 'search';
    return youtubeSection;
  }

  // --- Update watched/shorts classes (SYNC — no async/await here) ---
  function updateClassOnWatchedItems() {
    // Clear previous dim/hide classes
    document.querySelectorAll('.YT-HWV-WATCHED-DIMMED').forEach(el => el.classList.remove('YT-HWV-WATCHED-DIMMED'));
    document.querySelectorAll('.YT-HWV-WATCHED-HIDDEN').forEach(el => el.classList.remove('YT-HWV-WATCHED-HIDDEN'));
    if (window.location.href.indexOf('/feed/history') >= 0) return;

    const section = determineYoutubeSection();
    const state = localStorage[`MWYV_STATE_${section}`];
    if (!state || state === 'normal') return; // nothing to do

    // Collect all containers: YouTube-detected + internally tracked
    const containerSet = new Set();

    // Source 1: YouTube signals (red bar, resume renderer, WATCHED badge)
    findWatchedContainers().forEach(c => containerSet.add(c));

    // Source 2: internally tracked (green outline .watched class already applied to containers)
    document.querySelectorAll('.watched').forEach(el => containerSet.add(el));

    console.log(`[MWYV] dim/hide "${state}" → ${containerSet.size} watched containers (YT signals: ${findWatchedContainers().length}, internal: ${document.querySelectorAll('.watched').length})`);

    containerSet.forEach(container => {
      if (!container) return;
      if (state === 'dimmed') container.classList.add('YT-HWV-WATCHED-DIMMED');
      else if (state === 'hidden') container.classList.add('YT-HWV-WATCHED-HIDDEN');
    });
  }

  function updateClassOnShortsItems() {
    const section = determineYoutubeSection();
    document.querySelectorAll('.YT-HWV-SHORTS-DIMMED').forEach(el => el.classList.remove('YT-HWV-SHORTS-DIMMED'));
    document.querySelectorAll('.YT-HWV-SHORTS-HIDDEN').forEach(el => el.classList.remove('YT-HWV-SHORTS-HIDDEN'));
    const state = localStorage[`MWYV_STATE_SHORTS_${section}`];
    findShortsContainers().forEach(item => {
      if (state === 'dimmed') item.classList.add('YT-HWV-SHORTS-DIMMED');
      else if (state === 'hidden') item.classList.add('YT-HWV-SHORTS-HIDDEN');
    });
  }

  // --- Header menu buttons ---
  const MWYV_BUTTONS = [
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="currentColor" d="M24 9C14 9 5.46 15.22 2 24c3.46 8.78 12 15 22 15 10.01 0 18.54-6.22 22-15-3.46-8.78-11.99-15-22-15zm0 25c-5.52 0-10-4.48-10-10s4.48-10 10-10 10 4.48 10 10-4.48 10-10 10zm0-16c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/></svg>',
      iconHidden: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="currentColor" d="M24 14c5.52 0 10 4.48 10 10 0 1.29-.26 2.52-.71 3.65l5.85 5.85c3.02-2.52 5.4-5.78 6.87-9.5-3.47-8.78-12-15-22.01-15-2.8 0-5.48.5-7.97 1.4l4.32 4.31c1.13-.44 2.36-.71 3.65-.71zM4 8.55l4.56 4.56.91.91C6.17 16.6 3.56 20.03 2 24c3.46 8.78 12 15 22 15 3.1 0 6.06-.6 8.77-1.69l.85.85L39.45 44 42 41.46 6.55 6 4 8.55zM15.06 19.6l3.09 3.09c-.09.43-.15.86-.15 1.31 0 3.31 2.69 6 6 6 .45 0 .88-.06 1.3-.15l3.09 3.09C27.06 33.6 25.58 34 24 34c-5.52 0-10-4.48-10-10 0-1.58.4-3.06 1.06-4.4zm8.61-1.57 6.3 6.3L30 24c0-3.31-2.69-6-6-6l-.33.03z"/></svg>',
      name: 'Toggle Watched Videos',
      stateKey: 'MWYV_STATE',
      type: 'toggle',
      tooltip: 'Show/hide watched videos (normal → dimmed → hidden)\n\nTip: Alt+Click any video thumbnail to manually toggle watched status'
    },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="currentColor" d="M31.95 3c-1.11 0-2.25.3-3.27.93l-15.93 9.45C10.32 14.79 8.88 17.67 9 20.7c.15 3 1.74 5.61 4.17 6.84.06.03 2.25 1.05 2.25 1.05l-2.7 1.59c-3.42 2.04-4.74 6.81-2.94 10.65C11.07 43.47 13.5 45 16.05 45c1.11 0 2.22-.3 3.27-.93l15.93-9.45c2.4-1.44 3.87-4.29 3.72-7.35-.12-2.97-1.74-5.61-4.17-6.81-.06-.03-2.25-1.05-2.25-1.05l2.7-1.59c3.42-2.04 4.74-6.81 2.91-10.65C36.93 4.53 34.47 3 31.95 3z"/></svg>',
      iconHidden: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><g fill="currentColor"><g clip-path="url(#slashGap)"><path d="M31.97 3c-1.11 0-2.25.3-3.27.93l-15.93 9.45c-2.43 1.41-3.87 4.29-3.75 7.32.15 3 1.74 5.61 4.17 6.84.06.03 2.25 1.05 2.25 1.05l-2.7 1.59C9.32 32.22 8 36.99 9.8 40.83c1.29 2.64 3.72 4.17 6.27 4.17 1.11 0 2.22-.3 3.27-.93l15.93-9.45c2.4-1.44 3.87-4.29 3.72-7.35-.12-2.97-1.74-5.61-4.17-6.81-.06-.03-2.25-1.05-2.25-1.05l2.7-1.59c3.42-2.04 4.74-6.81 2.91-10.65C36.95 4.53 34.49 3 31.97 3z"/></g><path d="m7.501 5.55 4.066-2.42 24.26 40.78-4.065 2.418z"/></g></svg>',
      name: 'Toggle Shorts',
      stateKey: 'MWYV_STATE_SHORTS',
      type: 'toggle',
      tooltip: 'Show/hide YouTube Shorts (normal → dimmed → hidden)'
    },
    {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="currentColor" d="M12 9.5a2.5 2.5 0 0 1 0 5 2.5 2.5 0 0 1 0-5m0-1c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zM13.22 3l.55 2.2.13.51.5.18c.61.23 1.19.56 1.72.98l.4.32.5-.14 2.17-.62 1.22 2.11-1.63 1.59-.37.36.08.51c.05.32.08.64.08.98s-.03.66-.08.98l-.08.51.37.36 1.63 1.59-1.22 2.11-2.17-.62-.5-.14-.4.32c-.53.43-1.11.76-1.72.98l-.5.18-.13.51-.55 2.24h-2.44l-.55-2.2-.13-.51-.5-.18c-.6-.23-1.18-.56-1.72-.99l-.4-.32-.5.14-2.17.62-1.21-2.12 1.63-1.59.37-.36-.08-.51c-.05-.32-.08-.65-.08-.98s.03-.66.08-.98l.08-.51-.37-.36L3.6 8.56l1.22-2.11 2.17.62.5.14.4-.32c.53-.44 1.11-.77 1.72-.99l.5-.18.13-.51.54-2.21h2.44M14 2h-4l-.74 2.96c-.73.27-1.4.66-2 1.14l-2.92-.83-2 3.46 2.19 2.13c-.06.37-.09.75-.09 1.14s.03.77.09 1.14l-2.19 2.13 2 3.46 2.92-.83c.6.48 1.27.87 2 1.14L10 22h4l.74-2.96c.73-.27 1.4-.66 2-1.14l2.92.83 2-3.46-2.19-2.13c.06-.37.09-.75.09-1.14s-.03-.77-.09-1.14l2.19-2.13-2-3.46-2.92.83c-.6-.48-1.27-.87-2-1.14L14 2z"/></svg>',
      name: 'Settings',
      type: 'settings',
      tooltip: 'Extension settings: threshold, statistics, backup & restore'
    }
  ];

  // --- Trusted Types policy for YouTube header injection ---
  let trustedPolicy = null;
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    trustedPolicy = window.trustedTypes.createPolicy('default', {
      createHTML: input => input,
      createScript: input => input,
      createScriptURL: input => input
    });
  }

  function renderMWYVButtons() {
    console.log('renderMWYVButtons called');
    // Find button area target
    const target = document.querySelector('#container #end #buttons') ||
      document.querySelector('ytd-masthead #end #buttons') ||
      document.querySelector('ytd-masthead #buttons');
    console.log('Button target:', target);
    // Did we already render the buttons?
    const existingButtons = document.querySelector('.YT-HWV-BUTTONS');
    // Generate buttons area DOM
    const buttonArea = document.createElement('div');
    buttonArea.classList.add('YT-HWV-BUTTONS');
    MWYV_BUTTONS.forEach(({ icon, iconHidden, name, stateKey, type }) => {
      const section = determineYoutubeSection();
      const storageKey = [stateKey, section].join('_');
      const toggleButtonState = localStorage.getItem(storageKey) || 'normal';
      const button = document.createElement('button');
      button.title = type === 'toggle' ? `${name} : currently "${toggleButtonState}" for section "${section}"` : `${name}`;
      button.classList.add('YT-HWV-BUTTON');
      if (toggleButtonState !== 'normal') button.classList.add('YT-HWV-BUTTON-DISABLED');
      // Use Trusted Types for innerHTML
      const iconHTML = toggleButtonState === 'hidden' ? iconHidden : icon;
      button.innerHTML = trustedPolicy ? trustedPolicy.createHTML(iconHTML) : iconHTML;
      buttonArea.appendChild(button);
      switch (type) {
        case 'toggle':
          button.addEventListener('click', () => {
            let newState = 'dimmed';
            if (toggleButtonState === 'dimmed') newState = 'hidden';
            else if (toggleButtonState === 'hidden') newState = 'normal';
            localStorage.setItem(storageKey, newState);
            // Process all video items first to ensure watched status is up to date
            processAllVideoItems();
            updateClassOnWatchedItems();
            updateClassOnShortsItems();
            renderMWYVButtons();
          });
          // Add tooltip functionality
          if (MWYV_BUTTONS.find(b => b.stateKey === stateKey)?.tooltip) {
            setupTooltip(button, MWYV_BUTTONS.find(b => b.stateKey === stateKey).tooltip);
          }
          break;
        case 'settings':
          button.addEventListener('click', () => {
            showSettingsMenu();
          });
          // Add tooltip functionality
          if (MWYV_BUTTONS.find(b => b.type === 'settings')?.tooltip) {
            setupTooltip(button, MWYV_BUTTONS.find(b => b.type === 'settings').tooltip);
          }
          break;
        case 'stats':
          button.addEventListener('click', () => {
            displayHistoryStats().catch(console.error);
          });
          break;
        case 'backup':
          button.addEventListener('click', () => {
            backupHistoryData().catch(console.error);
          });
          break;
        case 'restore':
          button.addEventListener('click', () => {
            restoreHistoryData().catch(console.error);
          });
          break;
      }
    });
    if (target) {
      if (existingButtons) {
        // If the buttons exist but have a different parent, replaceChild will throw an error
        if (existingButtons.parentNode === target.parentNode) {
          target.parentNode.replaceChild(buttonArea, existingButtons);
        } else {
          existingButtons.remove();
          target.parentNode.insertBefore(buttonArea, target);
        }
        console.log('Re-rendered menu buttons in header');
      } else {
        target.parentNode.insertBefore(buttonArea, target);
        console.log('Rendered menu buttons in header');
      }
    } else {
      // fallback: inject in fixed position if header not found
      if (existingButtons) existingButtons.remove();
      buttonArea.style.position = 'fixed';
      buttonArea.style.top = '80px';
      buttonArea.style.right = '20px';
      buttonArea.style.zIndex = '9999';
      document.body.appendChild(buttonArea);
      console.log('Rendered menu buttons in fixed position (fallback)');
    }
  }

  // --- Debounce function (from Hide_and_Dim) ---
  function debounce(func, wait, immediate) {
    let timeout;
    return function (...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func.apply(this, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(this, args);
    };
  }

  // --- Run function (from Hide_and_Dim) ---
  const run = debounce((mutations) => {
    // Don't react if only our own buttons changed state
    if (
      mutations &&
      mutations.length === 1 &&
      mutations[0].target &&
      mutations[0].target.classList &&
      (mutations[0].target.classList.contains('YT-HWV-BUTTON') ||
        mutations[0].target.classList.contains('YT-HWV-BUTTON-SHORTS'))
    ) {
      return;
    }
    processAllVideoItems();
    updateClassOnWatchedItems(); // sync — safe to call directly
    updateClassOnShortsItems();
    renderMWYVButtons();
  }, 250);

  // --- observeDOM function (from Hide_and_Dim) ---
  const observeDOM = (() => {
    const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
    const eventListenerSupported = window.addEventListener;
    return (obj, callback) => {
      if (!obj) return;
      if (MutationObserver) {
        const obs = new MutationObserver((mutations, _observer) => {
          if (
            mutations.length === 1 &&
            mutations[0].addedNodes?.length === 1 &&
            mutations[0].addedNodes[0] &&
            mutations[0].addedNodes[0].classList &&
            mutations[0].addedNodes[0].classList.contains('YT-HWV-BUTTONS')
          ) {
            return;
          }
          if (
            mutations[0].addedNodes.length ||
            mutations[0].removedNodes.length
          ) {
            callback(mutations);
          }
        });
        obs.observe(obj, { childList: true, subtree: true });
      } else if (eventListenerSupported) {
        obj.addEventListener('DOMNodeInserted', callback, false);
        obj.addEventListener('DOMNodeRemoved', callback, false);
      }
    };
  })();

  // --- Tooltip functionality ---
  let currentTooltip = null;
  function setupTooltip(element, text) {
    element.addEventListener('mouseenter', (e) => {
      showTooltip(e, text);
    });
    element.addEventListener('mouseleave', hideTooltip);
    element.addEventListener('mousemove', (e) => {
      if (currentTooltip) {
        currentTooltip.style.left = (e.clientX + 10) + 'px';
        currentTooltip.style.top = (e.clientY - 30) + 'px';
      }
    });
  }

  function showTooltip(event, text) {
    hideTooltip(); // Remove existing tooltip
    currentTooltip = document.createElement('div');
    currentTooltip.className = 'mwyv-tooltip';
    currentTooltip.textContent = text;
    currentTooltip.style.left = (event.clientX + 10) + 'px';
    currentTooltip.style.top = (event.clientY - 30) + 'px';
    document.body.appendChild(currentTooltip);
    setTimeout(() => {
      if (currentTooltip) {
        currentTooltip.classList.add('show');
      }
    }, 10);
  }

  function hideTooltip() {
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
  }

  // --- Settings menu functionality ---
  function showSettingsMenu() {
    if (document.getElementById('mwyv-settings-menu')) return; // Prevent multiple menus

    const menuHtml = `
      <style>
        #mwyv-settings-menu {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Arial, sans-serif;
        }
        #mwyv-settings-content {
          background: white;
          border-radius: 8px;
          padding: 20px;
          min-width: 400px;
          max-width: 500px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        #mwyv-settings-content h3 {
          margin: 0 0 15px 0;
          color: #333;
          border-bottom: 2px solid #4CAF50;
          padding-bottom: 8px;
        }
        .mwyv-setting-row {
          margin: 15px 0;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .mwyv-setting-label {
          font-weight: bold;
          margin-bottom: 5px;
          color: #333;
        }
        .mwyv-setting-desc {
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
        }
        .mwyv-button {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 8px;
          margin-bottom: 5px;
        }
        .mwyv-button:hover {
          background: #45a049;
        }
        .mwyv-button.secondary {
          background: #2196F3;
        }
        .mwyv-button.secondary:hover {
          background: #1976D2;
        }
        .mwyv-input {
          padding: 6px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 80px;
        }
        #mwyv-close-btn {
          position: absolute;
          top: 10px;
          right: 15px;
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #666;
        }
      </style>
      <div id="mwyv-settings-content" style="position: relative;">
        <button id="mwyv-close-btn">&times;</button>
        <h3>🎯 Mark Watched Videos - Settings</h3>
        
        <div class="mwyv-setting-row">
          <div class="mwyv-setting-label">⚙️ Progress Bar Threshold</div>
          <div class="mwyv-setting-desc">Videos with YouTube's red progress bar ≥ this percentage are detected as watched</div>
          <input type="number" id="mwyv-threshold" class="mwyv-input" min="0" max="100" value="${getThreshold()}">%
          <button class="mwyv-button" id="mwyv-save-threshold">Save</button>
        </div>
        
        <div class="mwyv-setting-row">
          <div class="mwyv-setting-label">🔄 Auto-Import Detected Videos</div>
          <div class="mwyv-setting-desc">Automatically save videos detected by YouTube's progress bar into your watch history so they persist and get dimmed/hidden</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
            <input type="checkbox" id="mwyv-auto-import" ${getAutoImport() ? 'checked' : ''}>
            <span>Auto-import progress-bar detected videos</span>
          </label>
        </div>
        
        <div class="mwyv-setting-row">
          <div class="mwyv-setting-label">📊 Watch History Statistics</div>
          <div class="mwyv-setting-desc">View detailed statistics about your viewing history</div>
          <button class="mwyv-button secondary" id="mwyv-show-stats">Show Statistics</button>
        </div>
        
        <div class="mwyv-setting-row">
          <div class="mwyv-setting-label">💾 Data Management</div>
          <div class="mwyv-setting-desc">Backup your watch history or restore from a backup file</div>
          <button class="mwyv-button secondary" id="mwyv-backup-data">Backup History</button>
          <button class="mwyv-button secondary" id="mwyv-restore-data">Restore History</button>
        </div>
        
        <div class="mwyv-setting-row">
          <div class="mwyv-setting-label">💡 Usage Tips</div>
          <div class="mwyv-setting-desc">
            • <strong>Alt + Click</strong> any video thumbnail to manually toggle watched status<br>
            • Use the eye/shorts buttons to cycle: normal → dimmed → hidden<br>
            • Green outlines = internally tracked · Red bar = YouTube-detected<br>
            • Both sources are combined for dim/hide behavior
          </div>
        </div>
      </div>
    `;

    const menu = document.createElement('div');
    menu.id = 'mwyv-settings-menu';
    menu.innerHTML = trustedPolicy ? trustedPolicy.createHTML(menuHtml) : menuHtml;

    // Close handlers
    const closeMenu = () => {
      menu.remove();
    };

    menu.addEventListener('click', (e) => {
      if (e.target === menu) closeMenu();
    });

    // Add event listeners after menu is in DOM
    document.body.appendChild(menu);

    // Close button
    document.getElementById('mwyv-close-btn').addEventListener('click', closeMenu);

    // Threshold setting
    document.getElementById('mwyv-save-threshold').addEventListener('click', () => {
      const threshold = parseInt(document.getElementById('mwyv-threshold').value, 10);
      if (threshold >= 0 && threshold <= 100) {
        setThreshold(threshold);
        alert(`Threshold updated to ${threshold}%`);
        updateClassOnWatchedItems();
      } else {
        alert('Please enter a value between 0 and 100');
      }
    });

    // Auto-import toggle
    document.getElementById('mwyv-auto-import').addEventListener('change', (e) => {
      setAutoImport(e.target.checked);
      if (e.target.checked) {
        autoImportWatchedFromProgressBars().then(() => {
          updateClassOnWatchedItems();
        }).catch(console.error);
      }
    });

    // Statistics
    document.getElementById('mwyv-show-stats').addEventListener('click', () => {
      displayHistoryStats().catch(console.error);
    });

    // Backup
    document.getElementById('mwyv-backup-data').addEventListener('click', () => {
      backupHistoryData().catch(console.error);
    });

    // Restore
    document.getElementById('mwyv-restore-data').addEventListener('click', () => {
      restoreHistoryData().catch(console.error);
    });
  }

  // --- Attach observer and initial run (from Hide_and_Dim) ---
  observeDOM(document.body, run);
  run();
})();
