// Generic direct video provider for ordinary HTML5 video and direct media links.

class GenericProvider extends BaseVideoProvider {
    constructor() {
        super('generic');
    }

    canHandle(url) {
        if (!url || url.startsWith('blob:')) return false;

        try {
            const parsed = new URL(url, window.location.href);
            const pathname = parsed.pathname.toLowerCase();
            return /\.(mp4|m4v|mov|webm|mkv|m3u8)(?:$|\?)/.test(pathname) ||
                parsed.searchParams.get('format') === 'mp4' ||
                parsed.searchParams.get('type') === 'video';
        } catch (error) {
            return false;
        }
    }

    extractVideoId(url) {
        try {
            const parsed = new URL(url, window.location.href);
            return parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
        } catch (error) {
            return url;
        }
    }

    getNormalizedUrl(videoId) {
        return videoId;
    }

    getDisplayName() {
        return 'Direct Video';
    }

    detectInClassroom(document) {
        return this.detectInCommunityPost(document.body);
    }

    detectInCommunityPost(element) {
        const videos = [];
        const foundUrls = new Set();

        const addVideo = (url, sourceElement, titleFallback) => {
            if (!url) return;

            const absoluteUrl = new URL(url, window.location.href).href;
            if (!this.canHandle(absoluteUrl) || foundUrls.has(absoluteUrl)) return;

            foundUrls.add(absoluteUrl);
            const titleElement = findNearestTitle(sourceElement);
            const title = sourceElement.title ||
                sourceElement.getAttribute?.('aria-label') ||
                titleElement?.textContent?.trim() ||
                titleFallback ||
                document.title ||
                'Direct Video';

            videos.push({
                videoId: this.extractVideoId(absoluteUrl),
                url: absoluteUrl,
                title,
                element: sourceElement,
                thumbnail: this.extractThumbnailFromElement(sourceElement),
                provider: 'generic',
                type: 'generic'
            });
        };

        element.querySelectorAll('video').forEach(video => {
            addVideo(video.currentSrc || video.src, video, 'HTML5 Video');
            video.querySelectorAll('source').forEach(source => {
                addVideo(source.src || source.getAttribute('src'), video, 'HTML5 Video');
            });
        });

        element.querySelectorAll('a[href], source[src], [data-src], [data-video-url], [data-hls-url]').forEach(candidate => {
            addVideo(
                candidate.href ||
                    candidate.src ||
                    candidate.dataset?.src ||
                    candidate.dataset?.videoUrl ||
                    candidate.dataset?.hlsUrl,
                candidate,
                'Direct Video'
            );
        });

        return videos;
    }

    getSelectors() {
        return {
            iframe: [],
            link: ['a[href$=".mp4"]', 'a[href*=".mp4?"]', 'a[href$=".m3u8"]', 'a[href*=".m3u8?"]'],
            embed: ['video', 'source[src]', '[data-video-url]', '[data-hls-url]'],
            thumbnail: ['video[poster]']
        };
    }
}
