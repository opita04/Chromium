// ==UserScript==
// @name        Youtube - Mark, Hide and Dims
// @namespace   MarkWatchedYouTubeVideos
// @version     1.4.63
// @license     AGPL v3
// @author      jcunews
// @description Add an indicator for watched videos on YouTube. Use GM menus to display history statistics, backup history, and restore/merge history.
// @website     https://greasyfork.org/en/users/85671-jcunews
// @match       *://www.youtube.com/*
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_setValue
// @grant       unsafeWindow
// @run-at      document-end
// @downloadURL https://update.greasyfork.org/scripts/30261/Mark%20Watched%20YouTube%20Videos.user.js
// ==/UserScript==

/*
- Use ALT+LeftClick or ALT+RightClick on a video list item to manually toggle the watched marker. The mouse button is defined in the script and can be changed.
- For restoring/merging history, source file can also be a YouTube's history data JSON (downloadable from https://support.google.com/accounts/answer/3024190?hl=en). Or a list of YouTube video URLs (using current time as timestamps).
*/

(() => {

    //=== config start ===
    var maxWatchedVideoAge = 10 * 365; // number of days. set to zero to disable (not recommended)
    var contentLoadMarkDelay = 600; // number of milliseconds to wait before marking video items on content load phase (increase if slow network/browser)
    var markerMouseButtons = [0, 1]; // one or more mouse buttons to use for manual marker toggle. 0=left, 1=right, 2=middle. e.g.:
    // if `[0]`, only left button is used, which is ALT+LeftClick.
    // if `[1]`, only right button is used, which is ALT+RightClick.
    // if `[0,1]`, any left or right button can be used, which is: ALT+LeftClick or ALT+RightClick.
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
      var items = document.querySelectorAll(selector), i, link;
      for (i = items.length-1; i >= 0; i--) {
        if (link = querySelector.call(items[i], "A")) {
          if (watched(getVideoId(link.href))) {
            items[i].classList.add("watched");
          } else items[i].classList.remove("watched");
        }
      }
    }
  
    function processAllVideoItems() {
      //home page
      processVideoItems(`.yt-uix-shelfslider-list>.yt-shelf-grid-item`);
      processVideoItems(`
#contents.ytd-rich-grid-renderer>ytd-rich-item-renderer,
#contents.ytd-rich-shelf-renderer ytd-rich-item-renderer.ytd-rich-shelf-renderer,
#contents.ytd-rich-grid-renderer>ytd-rich-grid-row ytd-rich-grid-media`);
      //subscriptions page
      processVideoItems(`.multirow-shelf>.shelf-content>.yt-shelf-grid-item`);
      //history:watch page
      processVideoItems(`ytd-section-list-renderer[page-subtype="history"] .ytd-item-section-renderer>ytd-video-renderer`);
      //channel/user home page
      processVideoItems(`
#contents>.ytd-item-section-renderer>.ytd-newspaper-renderer,
#items>.yt-horizontal-list-renderer`); //old
      processVideoItems(`
#contents>.ytd-channel-featured-content-renderer,
#contents>.ytd-shelf-renderer>#grid-container>.ytd-expanded-shelf-contents-renderer`); //new
      //channel/user video page
      processVideoItems(`
#contents>.ytd-item-section-renderer>.ytd-newspaper-renderer,
#items>.yt-horizontal-list-renderer`);
      //channel/user shorts page
      processVideoItems(`
ytd-rich-item-renderer ytd-rich-grid-slim-media`);
      //channel/user playlist page
      processVideoItems(`
.expanded-shelf>.expanded-shelf-content-list>.expanded-shelf-content-item-wrapper,
.ytd-playlist-video-renderer`);
      //channel/user playlist item page
      processVideoItems(`
.pl-video-list .pl-video-table .pl-video,
ytd-playlist-panel-video-renderer`);
      //channel/user search page
      if (/^\/(?:(?:c|channel|user)\/)?.*?\/search/.test(location.pathname)) {
        processVideoItems(`.ytd-browse #contents>.ytd-item-section-renderer`); //new
      }
      //search page
      processVideoItems(`
#results>.section-list .item-section>li,
#browse-items-primary>.browse-list-item-container`); //old
      processVideoItems(`
.ytd-search #contents>ytd-video-renderer,
.ytd-search #contents>ytd-playlist-renderer,
.ytd-search #items>ytd-video-renderer`); //new
      //video page
      processVideoItems(`
.watch-sidebar-body>.video-list>.video-list-item,
.playlist-videos-container>.playlist-videos-list>li`); //old
      processVideoItems(`
.ytd-compact-video-renderer,
.ytd-compact-radio-renderer`); //new
    }
  
    function addHistory(vid, time, noSave, i) {
      if (!watchedVideos.entries[vid]) {
        watchedVideos.index.push(vid);
      } else {
        i = watchedVideos.index.indexOf(vid);
        if (i >= 0) watchedVideos.index.push(watchedVideos.index.splice(i, 1)[0])
      }
      watchedVideos.entries[vid] = time;
      if (!noSave) GM_setValue("watchedVideos", JSON.stringify(watchedVideos));
    }
  
    function delHistory(index, noSave) {
      delete watchedVideos.entries[watchedVideos.index[index]];
      watchedVideos.index.splice(index, 1);
      if (!noSave) GM_setValue("watchedVideos", JSON.stringify(watchedVideos));
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
          s = {entries: {}, index: []};
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
      } catch(z) {
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
          s = {entries: {}, index: []};
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
      } catch(a) {
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
  
    function getHistory(a, b) {
      console.log('getHistory started');
      a = GM_getValue("watchedVideos"); console.log('GM_getValue returned: ' + (typeof a));
      if (a === undefined) {
        a = '{"entries": {}, "index": []}';
      } else if ("object" === typeof a) a = JSON.stringify(a);
      if (b = parseData(a)) {
        watchedVideos = b;
        if (dc) b = JSON.stringify(b);
      } else b = JSON.stringify(watchedVideos = {entries: {}, index: []});
      GM_setValue("watchedVideos", b);
    }
  
    function doProcessPage() {
      console.log('doProcessPage started');
      //get list of watched videos
      getHistory(); console.log('After getHistory, watchedVideos index length: ' + (watchedVideos ? watchedVideos.index.length : 'undefined'));
  
      //remove old watched video history
      var now = (new Date()).valueOf(), changed, vid;
      if (maxWatchedVideoAge > 0) {
        while (watchedVideos.index.length) {
          if (((now - watchedVideos.entries[watchedVideos.index[0]]) / ageMultiplier) > maxWatchedVideoAge) {
            delHistory(0, false);
            changed = true;
          } else break;
        }
        if (changed) GM_setValue("watchedVideos", JSON.stringify(watchedVideos));
      }
  
      //check and remember current video
      if ((vid = getVideoId(location.href)) && !watched(vid)) addHistory(vid, now);
  
      //mark watched videos
      processAllVideoItems();
    }
  
    function processPage() {
      setTimeout(doProcessPage, Math.floor(contentLoadMarkDelay / 2));
    }
  
    function delayedProcessPage() {
      setTimeout(doProcessPage, contentLoadMarkDelay);
    }
  
    function toggleMarker(ele, i) {
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
            delHistory(ele);
          } else addHistory(i, (new Date()).valueOf());
          processAllVideoItems();
        }
      }
    }
  
    var rxListUrl = /\/\w+_ajax\?|\/results\?search_query|\/v1\/(browse|next|search)\?/;
    var xhropen = XMLHttpRequest.prototype.open, xhrsend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.url_mwyv = url;
      return xhropen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(method, url) {
      if (rxListUrl.test(this.url_mwyv) && !this.listened_mwyv) {
        this.listened_mwyv = 1;
        this.addEventListener("load", delayedProcessPage);
      }
      return xhrsend.apply(this, arguments);
    };
  
    var fetch_ = unsafeWindow.fetch;
    unsafeWindow.fetch = function(opt) {
      let url = opt.url || opt;
      if (rxListUrl.test(opt.url || opt)) {
        return fetch_.apply(this, arguments).finally(delayedProcessPage);
      } else return fetch_.apply(this, arguments);
    };
    var nac = unsafeWindow.Node.prototype.appendChild;
    unsafeWindow.Node.prototype.appendChild = function(e) {
      var z;
      if ((this.tagName === "BODY") && (e?.tagName === "IFRAME")) {
        var r = nac.apply(this, arguments);
        try {
          if (/^about:blank\b/.test(e.contentWindow.location.href)) e.contentWindow.fetch = fetch
        } catch(z) {}
        return r
      } else return nac.apply(this, arguments)
    }
  
    var to = {createHTML: s => s};
    console.log('Checking for trustedTypes availability');
var tp = (typeof window !== 'undefined' && typeof window.trustedTypes !== 'undefined' && window.trustedTypes.createPolicy)
      ? window.trustedTypes.createPolicy("", to)
      : to; console.log('trustedTypes policy set: ' + (tp === to ? 'fallback' : 'created'));
    var html = s => tp.createHTML(s);
  
    addEventListener("DOMContentLoaded", sty => {
      sty = document.createElement("STYLE");
      sty.innerHTML = html(`
.watched:not(ytd-thumbnail):not(.details):not(.metadata), .watched .yt-ui-ellipsis
  { outline: .2em solid #aca; border-radius: 1em; background-color: #cec !important }
html[dark] .watched:not(ytd-thumbnail):not(.details):not(.metadata), html[dark] .watched .yt-ui-ellipsis,
.playlist-videos-container>.playlist-videos-list>li.watched,
.playlist-videos-container>.playlist-videos-list>li.watched>a,
.playlist-videos-container>.playlist-videos-list>li.watched .yt-ui-ellipsis
  { outline: .2em solid #040; border-radius: 1em; background-color: #030 !important }`);
      document.head.appendChild(sty);
      var nde = Node.prototype.dispatchEvent;
      Node.prototype.dispatchEvent = function(ev) {
        if (ev.type === "yt-service-request-completed") {
          clearTimeout(ut);
          ut = setTimeout(doProcessPage, contentLoadMarkDelay / 2)
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
        toggleMarker(ev.target);
      }
    }, true);
  
    if (markerMouseButtons.indexOf(1) >= 0) {
      addEventListener("contextmenu", (ev) => {
        if (ev.altKey) toggleMarker(ev.target);
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
  
    GM_registerMenuCommand("Display History Statistics", () => {
      function sum(r, v) {
        return r + v;
      }
      function avg(arr, cnt) {
        arr = Object.values(arr);
        cnt = cnt || arr?.length;
        return arr?.length ? Math.round(arr.reduce(sum, 0) / cnt) : "(n/a)";
      }
      var t0 = Infinity, t1 = -Infinity, d0 = Infinity, d1 = -Infinity, ld = {}, e0, e1, o0, o1, sp, ad, am, ay;
      getHistory();
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
            t1 --
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
    });
  
    GM_registerMenuCommand("Backup History Data", (a, b) => {
      document.body.appendChild(a = document.createElement("A")).href = URL.createObjectURL(new Blob([JSON.stringify(watchedVideos)], {type: "application/json"}));
      a.download = `MarkWatchedYouTubeVideos_${(new Date()).toISOString()}.json`;
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    });
  
    GM_registerMenuCommand("Restore History Data", (a, b) => {
      function askRestore(o) {
        const mergeCheckbox = document.getElementById('mwyvrhm_ujs');
        if (confirm(`Selected history data file contains ${o.index.length} entries.\n\nRestore from this data?`)) {
          if (mergeCheckbox && mergeCheckbox.checked) {
            mergeData(o);
          } else watchedVideos = o;
          GM_setValue("watchedVideos", JSON.stringify(watchedVideos));
          a.remove();
          doProcessPage();
        }
      }
      if (window.mwyvrh_ujs) return;
      (a = document.createElement("DIV")).id = "mwyvrh_ujs";
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
      (b = querySelector.call(a, "#mwyvrhi_ujs")).onchange = r => {
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
            o = {entries: {}, index: []};
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
    });
  
    // === Hide_and_Dim-inspired watched/shorts detection and UI ===
    // --- CSS for dimming/hiding watched videos and shorts ---
    (function addWatchedDimCSS() {
      const style = document.createElement('style');
      style.textContent = `
        .YT-HWV-WATCHED-HIDDEN { display: none !important }
        .YT-HWV-WATCHED-DIMMED { opacity: 0.3 }
        .YT-HWV-SHORTS-HIDDEN { display: none !important }
        .YT-HWV-SHORTS-DIMMED { opacity: 0.3 }
        .YT-HWV-HIDDEN-ROW-PARENT { padding-bottom: 10px }
        .YT-HWV-BUTTONS {
          background: transparent;
          border: 1px solid var(--ytd-searchbox-legacy-border-color);
          border-radius: 40px;
          display: flex;
          gap: 5px;
          margin: 0 20px;
        }
        .YT-HWV-BUTTON {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 40px;
          color: var(--yt-spec-icon-inactive);
          cursor: pointer;
          display: flex;
          height: 40px;
          justify-content: center;
          outline: 0;
          width: 40px;
        }
        .YT-HWV-BUTTON:focus,
        .YT-HWV-BUTTON:hover {
          background: var(--yt-spec-badge-chip-background);
        }
        .YT-HWV-BUTTON-DISABLED { color: var(--yt-spec-icon-disabled) }
      `;
      document.head.appendChild(style);
    })();

    // --- Settings storage and default ---
    const THRESHOLD_KEY = 'MWYV_HIDDEN_THRESHOLD_PERCENT';
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

    // --- Watched video detection using progress bar overlays ---
    function findWatchedElements() {
      const watched = document.querySelectorAll([
        '.ytd-thumbnail-overlay-resume-playback-renderer',
        '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegmentModern',
      ].join(','));
      const threshold = getThreshold();
      return Array.from(watched).filter(bar => {
        return bar.style.width && Number.parseInt(bar.style.width, 10) >= threshold;
      });
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
        const container = child.closest('ytd-video-renderer');
        if (container) shortsContainers.push(container);
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

    // --- Update watched/shorts classes ---
    function updateClassOnWatchedItems() {
      console.log('updateClassOnWatchedItems called, current section: ' + determineYoutubeSection());
      document.querySelectorAll('.YT-HWV-WATCHED-DIMMED').forEach(el => el.classList.remove('YT-HWV-WATCHED-DIMMED')); console.log('Found ' + findWatchedElements().length + ' progress-bar watched items');
      document.querySelectorAll('.YT-HWV-WATCHED-HIDDEN').forEach(el => el.classList.remove('YT-HWV-WATCHED-HIDDEN'));
      if (window.location.href.indexOf('/feed/history') >= 0) return;
      const section = determineYoutubeSection();
      const state = localStorage[`MWYV_STATE_${section}`];
      // Find all video elements that are either progress-bar watched or manually marked as watched
      // 1. Progress-bar watched
      const watchedProgress = findWatchedElements();
      // 2. Manually marked as watched (using your .watched class)
      const manuallyWatched = Array.from(document.querySelectorAll('.watched'));
      // Combine and deduplicate
      const allWatched = Array.from(new Set([...watchedProgress.map(item => {
        // Try to get the video container for progress-bar watched
        return item.closest('ytd-rich-item-renderer') || item.closest('ytd-video-renderer') || item.closest('ytd-grid-video-renderer') || item;
      }), ...manuallyWatched.map(item => {
        // Try to get the video container for manually marked
        return item.closest('ytd-rich-item-renderer') || item.closest('ytd-video-renderer') || item.closest('ytd-grid-video-renderer') || item;
      })]));
      allWatched.forEach(watchedItem => {
        if (!watchedItem) return;
        if (state === 'dimmed') watchedItem.classList.add('YT-HWV-WATCHED-DIMMED');
        else if (state === 'hidden') watchedItem.classList.add('YT-HWV-WATCHED-HIDDEN');
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
      },
      {
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="currentColor" d="M31.95 3c-1.11 0-2.25.3-3.27.93l-15.93 9.45C10.32 14.79 8.88 17.67 9 20.7c.15 3 1.74 5.61 4.17 6.84.06.03 2.25 1.05 2.25 1.05l-2.7 1.59c-3.42 2.04-4.74 6.81-2.94 10.65C11.07 43.47 13.5 45 16.05 45c1.11 0 2.22-.3 3.27-.93l15.93-9.45c2.4-1.44 3.87-4.29 3.72-7.35-.12-2.97-1.74-5.61-4.17-6.81-.06-.03-2.25-1.05-2.25-1.05l2.7-1.59c3.42-2.04 4.74-6.81 2.91-10.65C36.93 4.53 34.47 3 31.95 3z"/></svg>',
        iconHidden: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><g fill="currentColor"><g clip-path="url(#slashGap)"><path d="M31.97 3c-1.11 0-2.25.3-3.27.93l-15.93 9.45c-2.43 1.41-3.87 4.29-3.75 7.32.15 3 1.74 5.61 4.17 6.84.06.03 2.25 1.05 2.25 1.05l-2.7 1.59C9.32 32.22 8 36.99 9.8 40.83c1.29 2.64 3.72 4.17 6.27 4.17 1.11 0 2.22-.3 3.27-.93l15.93-9.45c2.4-1.44 3.87-4.29 3.72-7.35-.12-2.97-1.74-5.61-4.17-6.81-.06-.03-2.25-1.05-2.25-1.05l2.7-1.59c3.42-2.04 4.74-6.81 2.91-10.65C36.95 4.53 34.49 3 31.97 3z"/></g><path d="m7.501 5.55 4.066-2.42 24.26 40.78-4.065 2.418z"/></g></svg>',
        name: 'Toggle Shorts',
        stateKey: 'MWYV_STATE_SHORTS',
        type: 'toggle',
      },
      {
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="currentColor" d="M12 9.5a2.5 2.5 0 0 1 0 5 2.5 2.5 0 0 1 0-5m0-1c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zM13.22 3l.55 2.2.13.51.5.18c.61.23 1.19.56 1.72.98l.4.32.5-.14 2.17-.62 1.22 2.11-1.63 1.59-.37.36.08.51c.05.32.08.64.08.98s-.03.66-.08.98l-.08.51.37.36 1.63 1.59-1.22 2.11-2.17-.62-.5-.14-.4.32c-.53.43-1.11.76-1.72.98l-.5.18-.13.51-.55 2.24h-2.44l-.55-2.2-.13-.51-.5-.18c-.6-.23-1.18-.56-1.72-.99l-.4-.32-.5.14-2.17.62-1.21-2.12 1.63-1.59.37-.36-.08-.51c-.05-.32-.08-.65-.08-.98s.03-.66.08-.98l.08-.51-.37-.36L3.6 8.56l1.22-2.11 2.17.62.5.14.4-.32c.53-.44 1.11-.77 1.72-.99l.5-.18.13-.51.54-2.21h2.44M14 2h-4l-.74 2.96c-.73.27-1.4.66-2 1.14l-2.92-.83-2 3.46 2.19 2.13c-.06.37-.09.75-.09 1.14s.03.77.09 1.14l-2.19 2.13 2 3.46 2.92-.83c.6.48 1.27.87 2 1.14L10 22h4l.74-2.96c.73-.27 1.4-.66 2-1.14l2.92.83 2-3.46-2.19-2.13c.06-.37.09-.75.09-1.14s-.03-.77-.09-1.14l2.19-2.13-2-3.46-2.92.83c-.6-.48-1.27-.87-2-1.14L14 2z"/></svg>',
        name: 'Settings',
        type: 'settings',
      },
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
              updateClassOnWatchedItems();
              updateClassOnShortsItems();
              renderMWYVButtons();
            });
            break;
          case 'settings':
            button.addEventListener('click', () => {
              const current = getThreshold();
              const input = prompt('Set watched threshold percentage (0-100):', current);
              if (input !== null) {
                setThreshold(input);
                updateClassOnWatchedItems();
                renderMWYVButtons();
              }
            });
            break;
        }
      });
      if (target) {
        if (existingButtons) {
          target.parentNode.replaceChild(buttonArea, existingButtons);
          console.log('Re-rendered menu buttons in header');
        } else {
          target.parentNode.insertBefore(buttonArea, target);
          console.log('Rendered menu buttons in header');
        }
      } else {
        // fallback: inject in fixed position if header not found
        if (!existingButtons) {
          buttonArea.style.position = 'fixed';
          buttonArea.style.top = '80px';
          buttonArea.style.right = '20px';
          buttonArea.style.zIndex = '9999';
          document.body.appendChild(buttonArea);
          console.log('Rendered menu buttons in fixed position (fallback)');
        }
      }
    }
    // --- Debounce function (from Hide_and_Dim) ---
    function debounce(func, wait, immediate) {
      let timeout;
      return function(...args) {
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
        (mutations[0].target.classList.contains('YT-HWV-BUTTON') ||
          mutations[0].target.classList.contains('YT-HWV-BUTTON-SHORTS'))
      ) {
        return;
      }
      updateClassOnWatchedItems();
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
    // --- Attach observer and initial run (from Hide_and_Dim) ---
    observeDOM(document.body, run);
    run();
  })();
  