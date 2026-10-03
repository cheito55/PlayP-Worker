/*
 * PelisHub API - GrayJay source
 * API base: https://pelishub.cheito55.workers.dev
 *
 * The API advertises:
 * /api/home?page=1
 * /api/search?q=texto[&extra=1]
 * /api/movie/:tmdbId
 * /api/tv/:tmdbId/:season/:episode
 * /api/show/:tmdbId
 * /api/juanita/search?q=
 * /api/juanita/movie/:slug
 * /api/juanita/show/:slug
 * /api/juanita/tv/:slug/:s/:e
 * /api/jk/search?q=
 * /api/jk/serie/:slug
 * /api/jk/ep/:slug/:n
 * /api/okru/plan...
 * /api/okru/hits
 * /api/okru/sources
 * /proxy?u=...
 *
 * The JSON parser below intentionally accepts several common response shapes
 * because the Worker can evolve independently of this GrayJay source.
 */

var API = "https://pelishub.cheito55.workers.dev";
var CONFIG = null;
var PLATFORM = "PelisHubAPI";

function enc(s) {
    return encodeURIComponent(String(s == null ? "" : s));
}

function str(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    try { return String(v); } catch (e) { return ""; }
}

function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : (d == null ? 0 : d);
}

function first(obj, keys, fallback) {
    if (!obj || typeof obj !== "object") return fallback;
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return fallback;
}

function requestJson(url) {
    var r = Http.get(url);
    if (!r) throw new Error("PelisHub: empty HTTP response");
    var body = "";
    try {
        if (r.body && typeof r.body.string === "function") body = r.body.string();
        else if (typeof r.body === "string") body = r.body;
        else if (r.body && typeof r.body.toString === "function") body = r.body.toString();
    } catch (e) {
        body = "";
    }
    if (!body) throw new Error("PelisHub: empty response");
    return JSON.parse(body);
}

function unwrap(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;

    var keys = [
        "results", "items", "data", "movies", "shows", "series",
        "videos", "contents", "hits", "sources", "entries"
    ];

    for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (Array.isArray(v)) return v;
        if (v && typeof v === "object") {
            var nested = unwrap(v);
            if (nested.length) return nested;
        }
    }

    // A single object is also a valid item.
    return [data];
}

function titleOf(x) {
    if (!x || typeof x !== "object") return "";
    return str(first(x, [
        "title", "name", "original_title", "originalName",
        "displayName", "label", "movieTitle", "showTitle"
    ], ""));
}

function idOf(x) {
    if (!x || typeof x !== "object") return "";
    var v = first(x, [
        "tmdbId", "tmdb_id", "id", "movieId", "movie_id",
        "showId", "show_id", "videoId", "video_id", "slug"
    ], "");
    if (v && typeof v === "object") {
        v = first(v, ["id", "value", "tmdbId", "tmdb_id"], "");
    }
    return str(v);
}

function typeOf(x) {
    var t = str(first(x, ["type", "mediaType", "media_type", "kind", "contentType"], "")).toLowerCase();
    if (t.indexOf("tv") >= 0 || t.indexOf("serie") >= 0 || t.indexOf("show") >= 0 || t.indexOf("series") >= 0) return "tv";
    return "movie";
}

function imageOf(x) {
    if (!x || typeof x !== "object") return "";
    var v = first(x, [
        "poster", "posterUrl", "poster_url", "poster_path",
        "thumbnail", "thumbnailUrl", "thumbnail_url",
        "image", "imageUrl", "cover", "coverUrl", "backdrop"
    ], "");
    if (v && typeof v === "object") {
        v = first(v, ["url", "src", "path"], "");
    }
    v = str(v);
    if (v.indexOf("//") === 0) return "https:" + v;
    return v;
}

function descriptionOf(x) {
    if (!x || typeof x !== "object") return "";
    return str(first(x, ["overview", "description", "synopsis", "plot", "summary"], ""));
}

function durationOf(x) {
    if (!x || typeof x !== "object") return -1;
    return num(first(x, ["duration", "durationSeconds", "duration_seconds", "runtime"], -1), -1);
}

function normalizeDuration(v) {
    var n = num(v, -1);
    if (n < 0) return -1;
    // Runtime is commonly minutes; seconds are usually much larger.
    if (n > 0 && n < 1000) return Math.round(n * 60);
    return Math.round(n);
}

function normalizeName(s) {
    return str(s).toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreMatch(query, title) {
    var q = normalizeName(query);
    var t = normalizeName(title);
    if (!q || !t) return 0;
    if (q === t) return 100;
    if (t.indexOf(q) === 0) return 90;
    if (t.indexOf(q) >= 0) return 80;
    var qa = q.split(" ");
    var hit = 0;
    for (var i = 0; i < qa.length; i++) if (t.indexOf(qa[i]) >= 0) hit++;
    return Math.round(60 * hit / Math.max(1, qa.length));
}

function makeThumbs(url) {
    var arr = [];
    if (url) {
        arr.push(new Thumbnail(url, 720));
        arr.push(new Thumbnail(url, 1080));
    }
    return new Thumbnails(arr);
}

function makeVideo(item) {
    var title = titleOf(item) || "PelisHub";
    var id = idOf(item) || title;
    var kind = typeOf(item);
    var img = imageOf(item);
    var duration = normalizeDuration(durationOf(item));

    // The URL is the API detail endpoint, so getContentDetails can resolve it later.
    var url = item.url || item.detailUrl || item.detail_url || "";
    if (!url) {
        if (kind === "tv") url = API + "/api/show/" + enc(id);
        else url = API + "/api/movie/" + enc(id);
    }

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, kind + ":" + id, CONFIG.id),
        name: title,
        thumbnails: makeThumbs(img),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "pelishub", CONFIG.id),
            "PelisHub",
            API,
            img
        ),
        uploadDate: 0,
        duration: duration,
        viewCount: num(first(item, ["viewCount", "views"], -1), -1),
        url: url,
        isLive: false
    });
}

function uniqueItems(items, query) {
    var out = [];
    var seen = {};
    items.sort(function(a, b) {
        return scoreMatch(query, titleOf(b)) - scoreMatch(query, titleOf(a));
    });

    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var t = normalizeName(titleOf(it));
        if (!t) continue;
        var k = t + "|" + typeOf(it);
        if (seen[k]) continue;
        seen[k] = true;
        out.push(it);
    }
    return out;
}

function extractStrings(root, out, depth) {
    if (!root || depth > 7) return;
    if (typeof root === "string") {
        if (/^https?:\/\//i.test(root)) out.push(root);
        return;
    }
    if (typeof root !== "object") return;

    if (Array.isArray(root)) {
        for (var i = 0; i < root.length; i++) extractStrings(root[i], out, depth + 1);
        return;
    }

    for (var k in root) {
        if (!root.hasOwnProperty(k)) continue;
        var v = root[k];
        if (typeof v === "string") {
            if (/^https?:\/\//i.test(v)) out.push(v);
        } else {
            extractStrings(v, out, depth + 1);
        }
    }
}

function collectMediaUrls(data) {
    var raw = [];
    extractStrings(data, raw, 0);
    var out = [];
    var seen = {};

    for (var i = 0; i < raw.length; i++) {
        var u = raw[i];
        var low = u.toLowerCase();

        // Skip ordinary web pages, artwork and API URLs.
        var media =
            /\.(m3u8|mp4|m4v|webm|mov)(\?|#|$)/i.test(low) ||
            low.indexOf(".m3u8?") >= 0 ||
            low.indexOf("/video/") >= 0 && low.indexOf("ok.ru") >= 0;

        if (!media) continue;
        if (u.indexOf(API + "/api/") === 0) continue;

        if (!seen[u]) {
            seen[u] = true;
            out.push(u);
        }
    }
    return out;
}

function sourceForUrl(u, duration) {
    var low = u.toLowerCase();

    if (/\.m3u8(\?|#|$)/i.test(low) || low.indexOf(".m3u8?") >= 0) {
        return new HLSSource({
            name: "HLS",
            duration: duration > 0 ? duration : undefined,
            url: u,
            priority: true,
            language: "Unknown"
        });
    }

    return new VideoUrlSource({
        width: 0,
        height: 0,
        container: "video/mp4",
        codec: "",
        name: "Direct",
        bitrate: 0,
        duration: duration > 0 ? duration : -1,
        url: u
    });
}

function detailMeta(data, fallbackId, fallbackType) {
    var items = unwrap(data);
    var x = items.length ? items[0] : {};
    return {
        item: x,
        title: titleOf(x) || fallbackId,
        id: idOf(x) || fallbackId,
        type: typeOf(x) || fallbackType || "movie",
        image: imageOf(x),
        description: descriptionOf(x),
        duration: normalizeDuration(durationOf(x))
    };
}

function detailUrlInfo(url) {
    var m = String(url || "").match(/\/api\/(movie|show|tv)\/([^/?#]+)(?:\/(\d+)\/(\d+))?/i);
    if (!m) return null;
    return {
        endpoint: m[1].toLowerCase(),
        id: decodeURIComponent(m[2]),
        season: m[3] ? Number(m[3]) : 0,
        episode: m[4] ? Number(m[4]) : 0
    };
}

function fetchDetail(info) {
    var url;

    if (info.endpoint === "movie") {
        url = API + "/api/movie/" + enc(info.id) + "?plus=1";
    } else if (info.endpoint === "tv" && info.season > 0 && info.episode > 0) {
        url = API + "/api/tv/" + enc(info.id) + "/" + info.season + "/" + info.episode + "?plus=1";
    } else {
        url = API + "/api/show/" + enc(info.id) + "?plus=1";
    }

    return requestJson(url);
}

source.enable = function(conf) {
    CONFIG = conf;
};

source.getHome = function(continuationToken) {
    var page = continuationToken ? Number(continuationToken) : 1;
    if (!page || page < 1) page = 1;

    var data = requestJson(API + "/api/home?page=" + page + "&mode=fast&extra=1");
    var items = unwrap(data);
    var videos = [];

    for (var i = 0; i < items.length; i++) {
        try { videos.push(makeVideo(items[i])); } catch (e) {}
    }

    return new PelisHubHomePager(videos, items.length > 0, page + 1);
};

source.searchSuggestions = function(query) {
    return query ? [query] : [];
};

source.getSearchCapabilities = function() {
    return {
        types: [Type.Feed.Mixed],
        sorts: []
    };
};

source.search = function(query, type, order, filters, continuationToken) {
    query = str(query).trim();
    if (!query) return new PelisHubSearchPager([], false, { query: query, page: 1 });

    var page = continuationToken ? Number(continuationToken) : 1;
    if (!page || page < 1) page = 1;

    var data = requestJson(API + "/api/search?q=" + enc(query) + "&extra=1&mode=fast");
    var items = uniqueItems(unwrap(data), query);

    // Keep the first result per title/type and prefer close title matches.
    var videos = [];
    for (var i = 0; i < items.length; i++) {
        if (scoreMatch(query, titleOf(items[i])) < 35) continue;
        try { videos.push(makeVideo(items[i])); } catch (e) {}
    }

    return new PelisHubSearchPager(videos, false, { query: query, page: page });
};

source.isContentDetailsUrl = function(url) {
    return /^https:\/\/pelishub\.cheito55\.workers\.dev\/api\/(movie|show|tv)\//i.test(String(url || ""));
};

source.getContentDetails = function(url) {
    var info = detailUrlInfo(url);
    if (!info) throw new Error("PelisHub: unsupported details URL");

    var data = fetchDetail(info);
    var meta = detailMeta(data, info.id, info.endpoint === "tv" ? "tv" : "movie");
    var media = collectMediaUrls(data);
    var sources = [];

    for (var i = 0; i < media.length; i++) {
        try { sources.push(sourceForUrl(media[i], meta.duration)); } catch (e) {}
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, meta.type + ":" + meta.id, CONFIG.id),
        name: meta.title,
        thumbnails: makeThumbs(meta.image),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "pelishub", CONFIG.id),
            "PelisHub",
            API,
            meta.image
        ),
        uploadDate: 0,
        duration: meta.duration,
        viewCount: -1,
        url: url,
        isLive: false,
        description: meta.description,
        video: new VideoSourceDescriptor(sources),
        live: null,
        rating: null,
        subtitles: []
    });
};

source.isChannelUrl = function(url) { return false; };
source.getChannel = function(url) { return null; };
source.getChannelCapabilities = function() {
    return { types: [], sorts: [] };
};
source.getChannelContents = function(url, type, order, filters, continuationToken) {
    return new PelisHubSearchPager([], false, {});
};

class PelisHubHomePager extends VideoPager {
    constructor(results, hasMore, page) {
        super(results, hasMore, { page: page });
    }
    nextPage() {
        return source.getHome(this.context.page);
    }
}

class PelisHubSearchPager extends VideoPager {
    constructor(results, hasMore, context) {
        super(results, hasMore, context || {});
    }
    nextPage() {
        return source.search(
            this.context.query,
            null,
            null,
            null,
            this.context.page
        );
    }
}
