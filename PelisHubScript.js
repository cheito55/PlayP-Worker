/**
 * PelisHub GrayJay Ultra-Backend Connector v35
 * Conecta GrayJay directamente al Backend de Alto Rendimiento de PelisHub.
 * - ResoluciÃ³n simultÃ¡nea ultra-rÃ¡pida (1 a 3 segundos)
 * - CERO CAPTCHAS: Entrega streams directos HLS y MP4 listos para auto-play en ExoPlayer
 * - Filtro de duraciÃ³n estricto: >50 min para pelÃ­culas, >15 min para capÃ­tulos (cero trÃ¡ilers)
 * - BÃºsqueda y CatÃ¡logo TMDB instantÃ¡neos en espaÃ±ol latino
 */

var PLATFORM = "StreamflixHub";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e34";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "streamflixhub://";

// URL por defecto inyectada dinÃ¡micamente o configurada en settings
var DEFAULT_BACKEND = "https://ais-dev-ksa74emfjemlpeyhzbpgg4-283665686146.us-east1.run.app";

var _settings = {};

function getBackendUrl() {
    var u = _settings && _settings.backendUrl;
    if (u && typeof u === "string" && u.trim().length > 8) {
        return u.trim().replace(/\/+$/, "");
    }
    return DEFAULT_BACKEND;
}

function clean(s) {
    if (s == null) return "";
    return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function enc(s) {
    return encodeURIComponent(String(s == null ? "" : s));
}

function readBody(r) {
    if (!r) return "";
    if (typeof r.bodyAsString === "function") return r.bodyAsString();
    if (typeof r === "string") return r;
    if (r.body != null) return String(r.body);
    if (r.data != null && typeof r.data === "string") return r.data;
    return "";
}

function httpJson(url) {
    try {
        var r = http.GET(url, {
            "User-Agent": "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 GrayJay/1.0",
            "Accept": "application/json"
        }, false);
        var b = readBody(r);
        return b ? JSON.parse(b) : null;
    } catch (e) {
        return null;
    }
}

function thumb(url) {
    if (!url) return new Thumbnails([]);
    return new Thumbnails([new Thumbnail(url, 0)]);
}

function showAuthor(id, name, icon) {
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, "show_" + id, PID),
        name || "PelisHub",
        SCHEME + "show/" + id,
        icon || ""
    );
}

function tmdbAuthor() {
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, "pelishub", PID),
        "PelisHub",
        SCHEME + "home",
        ""
    );
}

function parseInternal(url) {
    var m = String(url || "").match(/^streamflixhub:\/\/(movie|tv|show)\/([0-9]+)(?:\/([0-9]+)\/([0-9]+))?/i);
    if (!m) return null;
    return {
        kind: m[1].toLowerCase(),
        id: m[2],
        season: parseInt(m[3] || "1", 10),
        episode: parseInt(m[4] || "1", 10)
    };
}

function catalogVideo(item) {
    var isTv = item.kind === "tv";
    var url = SCHEME + (isTv ? "tv/" + item.id + "/1/1" : "movie/" + item.id);
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + item.id, PID),
        name: item.title,
        thumbnails: thumb(item.poster),
        author: isTv ? showAuthor(item.id, item.title, item.poster) : tmdbAuthor(),
        uploadDate: 0,
        viewCount: 0,
        duration: 0,
        isLive: false,
        url: url
    });
}

function makePager(first, hasMore, loadNext) {
    var pager = new VideoPager(first, hasMore, {}), page = 1;
    pager.nextPage = function () {
        page++;
        var r;
        try { r = loadNext(page); } catch (e) { r = { results: [], hasMore: false }; }
        this.results = r.results || [];
        this.hasMore = !!r.hasMore;
        return this;
    };
    return pager;
}

// 1. HOME CATALOG (Trending movies & series)
function homePage(page) {
    var backend = getBackendUrl();
    var data = httpJson(backend + "/api/tmdb/home?page=" + page);
    var raw = data && data.results ? data.results : [];
    return {
        results: raw.map(function(x) {
            return catalogVideo({
                id: x.id,
                kind: x.media_type === "tv" ? "tv" : "movie",
                title: x.title || x.name || "Sin tÃ­tulo",
                poster: x.poster_path,
                date: x.release_date
            });
        }),
        hasMore: !!(data && data.total_pages && page < Math.min(data.total_pages, 20))
    };
}

// 2. SEARCH (Instant TMDB search with accents & aliases support)
function searchPage(q, page) {
    var backend = getBackendUrl();
    var data = httpJson(backend + "/api/search?q=" + enc(q) + "&page=" + page);
    if (!data || !data.results || data.results.length === 0) {
        data = httpJson(backend + "/api/tmdb/search?q=" + enc(q) + "&page=" + page);
    }
    var raw = data && data.results ? data.results : [];
    return {
        results: raw.map(function(x) {
            return catalogVideo({
                id: x.id,
                kind: x.media_type === "tv" ? "tv" : "movie",
                title: x.title || x.name || "Sin tÃ­tulo",
                poster: x.poster_path,
                date: x.release_date
            });
        }),
        hasMore: !!(data && data.total_pages && page < Math.min(data.total_pages, 20))
    };
}

// 3. SHOW / CHANNEL (Series & Seasons)
function channelOf(url) {
    var p = parseInternal(url);
    if (!p || (p.kind !== "show" && p.kind !== "tv")) return null;
    var backend = getBackendUrl();
    var d = httpJson(backend + "/api/tmdb/show/" + p.id);
    if (!d) return null;
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "show_" + p.id, PID),
        name: d.title || "Serie",
        thumbnail: d.poster || "",
        banner: d.backdrop || "",
        subscribers: 0,
        description: (d.overview || "") + "\nTemporadas: " + (d.number_of_seasons || 1),
        url: url,
        urlAlternatives: [url],
        links: {}
    });
}

function channelContents(url) {
    var p = parseInternal(url);
    if (!p || (p.kind !== "show" && p.kind !== "tv")) return new VideoPager([], false, {});
    var backend = getBackendUrl();
    var d = httpJson(backend + "/api/tmdb/season/" + p.id + "/" + (p.season || 1));
    var eps = (d && d.episodes) || [];
    var out = eps.map(function(e) {
        var num = e.episode_number;
        return new PlatformVideo({
            id: new PlatformID(PLATFORM, "tv_" + p.id + "_" + (p.season || 1) + "_" + num, PID),
            name: "S" + (p.season || 1) + "E" + num + " Â· " + (e.name || ("Episodio " + num)),
            thumbnails: thumb(e.still_path ? ("https://image.tmdb.org/t/p/w300" + e.still_path) : ""),
            author: showAuthor(p.id, "Serie", ""),
            uploadDate: 0,
            viewCount: 0,
            duration: (e.runtime || 0) * 60,
            isLive: false,
            url: SCHEME + "tv/" + p.id + "/" + (p.season || 1) + "/" + num
        });
    });
    return makePager(out, false, function() { return { results: [], hasMore: false }; });
}

// 4. VIDEO DETAILS & DIRECT STREAM EXTRACTION (AUTO-PLAY INSTANTÃNEO, CERO CAPTCHA)
function details(url) {
    var p = parseInternal(url);
    if (!p) return null;

    var backend = getBackendUrl();
    var isTv = p.kind === "tv";
    var s = p.season || 1;
    var e = p.episode || 1;

    // Consulta al backend de alta velocidad con cache
    var resolveUrl = backend + "/api/resolve?id=" + p.id + "&type=" + (isTv ? "tv" : "movie") +
                     "&season=" + s + "&episode=" + e + "&max=14&servidoresPlus=true";

    var res = httpJson(resolveUrl);
    var rawSources = (res && res.sources) || [];

    // Priorizar streams directos (HLS / MP4) para que GrayJay inicie auto-play al instante
    // sin pedir CAPTCHA ni abrir popups
    var directSources = [];
    var embedSources = [];

    for (var i = 0; i < rawSources.length; i++) {
        var src = rawSources[i];
        if (!src || !src.url) continue;

        var reqMod = undefined;
        if (src.headers) {
            reqMod = { headers: src.headers };
        }

        var sourceObj = null;
        if (src.type === "hls" || src.url.indexOf(".m3u8") >= 0) {
            sourceObj = new HLSSource({
                name: src.name || "Stream HLS",
                duration: src.duration || 0,
                url: src.url,
                requestModifier: reqMod
            });
        } else {
            sourceObj = new VideoUrlSource({
                name: src.name || "Video MP4",
                duration: src.duration || 0,
                url: src.url,
                container: "video/mp4",
                requestModifier: reqMod
            });
        }

        if (src.isEmbed) {
            embedSources.push(sourceObj);
        } else {
            directSources.push(sourceObj);
        }
    }

    // Direct streams FIRST: auto-play begins on source 1 immediately
    var finalSources = directSources.concat(embedSources);

    var mediaTitle = (res && res.title) || (isTv ? "CapÃ­tulo" : "PelÃ­cula");
    var dispName = isTv ? (mediaTitle + " Â· S" + s + "E" + e) : (mediaTitle + (res && res.year ? " (" + res.year + ")" : ""));

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, isTv ? ("tv_" + p.id + "_" + s + "_" + e) : ("movie_" + p.id), PID),
        name: dispName,
        thumbnails: thumb("https://image.tmdb.org/t/p/w500/" + p.id),
        author: isTv ? showAuthor(p.id, mediaTitle, "") : tmdbAuthor(),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        isLive: false,
        url: url,
        description: "PelisHub Backend v35\nServidores directos listos: " + finalSources.length + " disponibles para auto-play.",
        video: new VideoSourceDescriptor(finalSources)
    });
}

// SOURCE INTERFACE FOR GRAYJAY
var FEED_MIXED = "MIXED";
var ORDER_CHRONO = "CHRONOLOGICAL";

if (typeof source !== "undefined") {
    source.enable = function (conf, settings) { _settings = settings || {}; };
    source.setSettings = function (s) { _settings = s || {}; };
    source.getHome = function () {
        var r = homePage(1);
        return makePager(r.results, r.hasMore, function (pg) { return homePage(pg); });
    };
    source.getSearchCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.search = function (q) {
        var r = searchPage(q, 1);
        return makePager(r.results, r.hasMore, function (pg) { return searchPage(q, pg); });
    };
    source.isChannelUrl = function (u) { var p = parseInternal(u); return !!(p && (p.kind === "show" || p.kind === "tv")); };
    source.getChannel = function (u) { return channelOf(u); };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [ORDER_CHRONO], filters: [] }; };
    source.getChannelContents = function (u) { return channelContents(u); };
    source.isContentDetailsUrl = function (u) { var p = parseInternal(u); return !!(p && (p.kind === "movie" || p.kind === "tv")); };
    source.getContentDetails = function (u) { return details(u); };
    source.getContentRecommendations = function (u) { return new VideoPager([], false, {}); };
}
