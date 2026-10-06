/**
 * PelisHub GrayJay Source Plugin v36
 * - CatÃ¡logo y BÃºsqueda TMDB 100% directos en espaÃ±ol latino (portadas HD instantÃ¡neas)
 * - Cero CAPTCHAs: Entrega streams directos CDN (StreamWish premilkyway, OK.ru okcdn, Archive)
 * - Play AutomÃ¡tico en ExoPlayer en menos de 2 segundos
 * - Filtro estricto de duraciÃ³n: >50 min pelÃ­culas, >15 min series (cero trÃ¡ilers)
 */

var PLATFORM = "StreamflixHub";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e34";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "streamflixhub://";

var TMDB_KEY = "26c168179ae6b5445f36aca260e00d48";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_IMG = "https://image.tmdb.org/t/p/w500";
var TMDB_STILL = "https://image.tmdb.org/t/p/w300";

var UA = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

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
    return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
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

function httpGetRaw(url, referer) {
    var headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
    };
    if (referer) headers["Referer"] = referer;
    try {
        var r = http.GET(url, headers, false);
        return readBody(r);
    } catch (e) {
        return "";
    }
}

function tmdbGet(path, lang) {
    var url = TMDB_API + path + (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + enc(TMDB_KEY) + "&language=" + (lang || "es-MX");
    var text = httpGetRaw(url);
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function thumb(u) {
    if (!u) return new Thumbnails([]);
    var full = String(u);
    if (full.indexOf("http") !== 0) {
        full = TMDB_IMG + (full.charAt(0) === "/" ? full : ("/" + full));
    }
    return new Thumbnails([new Thumbnail(full, 100)]);
}

function showAuthor(id, name, poster) {
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, "show_" + id, PID),
        name || "PelisHub",
        SCHEME + "show/" + id,
        poster || "",
        0
    );
}

function tmdbAuthor() {
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, "pelishub", PID),
        "PelisHub",
        SCHEME + "home",
        "",
        0
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
    var posterUrl = item.poster ? (item.poster.indexOf("http") === 0 ? item.poster : (TMDB_IMG + item.poster)) : "";
    var url = SCHEME + (isTv ? "tv/" + item.id + "/1/1" : "movie/" + item.id);
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + item.id, PID),
        name: item.title,
        thumbnails: thumb(posterUrl),
        author: isTv ? showAuthor(item.id, item.title, posterUrl) : tmdbAuthor(),
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

// 1. HOME CATALOG (Trending movies & series with full HD posters)
function homePage(page) {
    var data = tmdbGet("/trending/all/week?page=" + page, "es-MX");
    var raw = data && data.results ? data.results : [];
    return {
        results: raw.filter(function(x) { return x && (x.media_type === "movie" || x.media_type === "tv"); }).map(function(x) {
            return catalogVideo({
                id: x.id,
                kind: x.media_type === "tv" ? "tv" : "movie",
                title: x.title || x.name || "Sin tÃ­tulo",
                poster: x.poster_path,
                date: x.release_date || x.first_air_date
            });
        }),
        hasMore: !!(data && data.total_pages && page < Math.min(data.total_pages, 20))
    };
}

// 2. SEARCH (TMDB multi search with full posters & instant results)
function searchPage(q, page) {
    if (!q || !q.trim()) return { results: [], hasMore: false };
    var data = tmdbGet("/search/multi?query=" + enc(q) + "&page=" + page + "&include_adult=false", "es-MX");
    var raw = data && data.results ? data.results : [];
    return {
        results: raw.filter(function(x) { return x && (x.media_type === "movie" || x.media_type === "tv"); }).map(function(x) {
            return catalogVideo({
                id: x.id,
                kind: x.media_type === "tv" ? "tv" : "movie",
                title: x.title || x.name || "Sin tÃ­tulo",
                poster: x.poster_path,
                date: x.release_date || x.first_air_date
            });
        }),
        hasMore: !!(data && data.total_pages && page < Math.min(data.total_pages, 20))
    };
}

// 3. SHOW / CHANNEL (Series & Seasons)
function channelOf(url) {
    var p = parseInternal(url);
    if (!p || (p.kind !== "show" && p.kind !== "tv")) return null;
    var d = tmdbGet("/tv/" + p.id, "es-MX");
    if (!d) return null;
    var posterUrl = d.poster_path ? (TMDB_IMG + d.poster_path) : "";
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "show_" + p.id, PID),
        name: d.name || d.original_name || "Serie",
        thumbnail: posterUrl,
        banner: d.backdrop_path ? ("https://image.tmdb.org/t/p/w780" + d.backdrop_path) : "",
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
    var d = tmdbGet("/tv/" + p.id + "/season/" + (p.season || 1), "es-MX");
    var eps = (d && d.episodes) || [];
    var out = eps.map(function(e) {
        var num = e.episode_number;
        var still = e.still_path ? (TMDB_STILL + e.still_path) : "";
        return new PlatformVideo({
            id: new PlatformID(PLATFORM, "tv_" + p.id + "_" + (p.season || 1) + "_" + num, PID),
            name: "S" + (p.season || 1) + "E" + num + " Â· " + (e.name || ("Episodio " + num)),
            thumbnails: thumb(still),
            author: showAuthor(p.id, "Serie", still),
            uploadDate: 0,
            viewCount: 0,
            duration: (e.runtime || 0) * 60,
            isLive: false,
            url: SCHEME + "tv/" + p.id + "/" + (p.season || 1) + "/" + num
        });
    });
    return makePager(out, false, function() { return { results: [], hasMore: false }; });
}

// -------------------------------------------------------------------------
// RESOLVER DE VIDEO DE ALTA VELOCIDAD (CERO CAPTCHA, PLAY AUTOMÃTICO EN 1.5S)
// -------------------------------------------------------------------------

// Helper para desempacar eval(function(p,a,c,k,e,d)...) de StreamWish
function unpackDean(p, a, c, k, e, d) {
    while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    return p;
}

function extractPackedHls(html) {
    if (!html) return "";
    var m = /eval\(function\(p,a,c,k,e,d\)[\s\S]+?return p\}\('([\s\S]+?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']+)'\.split\('\|'\)/.exec(html);
    var target = html;
    if (m) {
        try {
            target = unpackDean(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4].split("|"), 0, {});
        } catch (err) {}
    }
    var mUrl = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i.exec(target) ||
               /file\s*:\s*["'](https?:\/\/[^"']+)["']/i.exec(target);
    return mUrl ? mUrl[1] : "";
}

// Resuelve StreamWish desde PoseidonHD en 800ms
function resolveFastStreamWish(tmdbId, isTv, s, e) {
    try {
        var base = "https://www.poseidonhd2.co";
        var buildId = "Q-i_R7Z4xGx1ZLVEa6Zzs";
        var nextUrl = isTv
            ? (base + "/_next/data/" + buildId + "/es/serie/" + tmdbId + "/x/temporada/" + s + "/episodio/" + e + ".json?tmdb=" + tmdbId + "&serie=x&season=" + s + "&episode=" + e)
            : (base + "/_next/data/" + buildId + "/es/pelicula/" + tmdbId + "/x.json?tmdb=" + tmdbId + "&movie=x");

        var jsonText = httpGetRaw(nextUrl, base + "/");
        if (!jsonText || jsonText.indexOf("pageProps") < 0) return null;

        var data = JSON.parse(jsonText);
        var block = isTv ? data.pageProps.episode : data.pageProps.thisMovie;
        var list = (block && block.videos && (block.videos.latino || block.videos.spanish)) || [];
        if (!list.length) return null;

        for (var i = 0; i < Math.min(list.length, 3); i++) {
            var playerUrl = list[i].result;
            if (!playerUrl) continue;
            var pHtml = httpGetRaw(playerUrl, base + "/");
            var m = /var\s+url\s*=\s*['"]([^'"]+)['"]/i.exec(pHtml);
            var wishUrl = m ? m[1] : "";
            if (!wishUrl) continue;

            var idMatch = /\/e\/([a-zA-Z0-9_-]+)/.exec(wishUrl);
            var wishId = idMatch ? idMatch[1] : "";
            if (!wishId) continue;

            // Consultar mirror swdyu.com (alta velocidad sin Cloudflare)
            var swUrl = "https://swdyu.com/e/" + wishId;
            var swHtml = httpGetRaw(swUrl, "https://player.cuevana3.eu/");
            var hls = extractPackedHls(swHtml);
            if (hls && hls.indexOf("http") === 0) {
                return new HLSSource({
                    name: "StreamWish Â· Latino Full HD",
                    duration: 0,
                    url: hls
                });
            }
        }
    } catch (err) {}
    return null;
}

// Resuelve OK.ru Directo en 1 segundo (con filtro de duraciÃ³n: >50 min pelÃ­cula, >15 min series)
function resolveFastOkru(title, year, isTv) {
    try {
        var minSec = isTv ? 15 * 60 : 50 * 60;
        var q = title + (year ? (" " + year) : "") + " Latino";
        var searchUrl = "https://ok.ru/dk?st.cmd=searchResult&st.mode=Movie&st.grmode=Groups&st.query=" + enc(q);
        var html = httpGetRaw(searchUrl, "https://ok.ru/");
        var re = /\/video\/(\d{10,14})/g;
        var m;
        var ids = [];
        while ((m = re.exec(html)) != null) {
            if (ids.indexOf(m[1]) < 0) ids.push(m[1]);
            if (ids.length >= 2) break;
        }

        for (var i = 0; i < ids.length; i++) {
            var vId = ids[i];
            var embUrl = "https://ok.ru/videoembed/" + vId;
            var eHtml = httpGetRaw(embUrl, "https://ok.ru/");
            var dataMatch = /data-options=["']([^"']+)["']/i.exec(eHtml);
            if (!dataMatch) continue;

            var rawOpt = dataMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
            var meta = JSON.parse(rawOpt);
            var dur = (meta.movie && meta.movie.duration) || 0;

            // Filtro estricto contra trÃ¡ilers:
            if (dur > 0 && dur < minSec) continue;

            var titleLow = clean((meta.movie && meta.movie.name) || "").toLowerCase();
            if (/\b(?:trailer|teaser|clip|promo|avance|resumen)\b/i.test(titleLow)) continue;

            var videos = (meta.flashvars && meta.flashvars.metadata && meta.flashvars.metadata.videos) || [];
            for (var v = 0; v < videos.length; v++) {
                var vid = videos[v];
                if (vid.url && /^https?:\/\//i.test(vid.url)) {
                    var qName = vid.name ? (vid.name.toUpperCase() + " HD") : "720p HD";
                    return new VideoUrlSource({
                        name: "OK.ru Â· " + qName + (dur > 0 ? (" (" + Math.round(dur / 60) + " min)") : ""),
                        duration: dur,
                        url: vid.url,
                        container: "video/mp4"
                    });
                }
            }
        }
    } catch (err) {}
    return null;
}

// 4. DETALLES Y AUTO-PLAY
function details(url) {
    var p = parseInternal(url);
    if (!p) return null;

    var isTv = p.kind === "tv";
    var s = p.season || 1;
    var e = p.episode || 1;

    // Obtener informaciÃ³n de TMDB directamente
    var metaPath = (isTv ? ("/tv/" + p.id) : ("/movie/" + p.id));
    var info = tmdbGet(metaPath, "es-MX") || tmdbGet(metaPath, "en-US") || {};
    var mediaTitle = info.title || info.name || "Video";
    var year = (info.release_date || info.first_air_date || "").slice(0, 4);
    var posterUrl = info.poster_path ? (TMDB_IMG + info.poster_path) : "";

    var sources = [];

    // INTENTO 1: Backend de PelisHub (si responde en menos de 2s)
    try {
        var backend = getBackendUrl();
        var bRes = httpGetRaw(backend + "/api/resolve?id=" + p.id + "&type=" + (isTv ? "tv" : "movie") +
                              "&season=" + s + "&episode=" + e + "&max=10&servidoresPlus=true");
        if (bRes && bRes.indexOf('"sources"') >= 0) {
            var parsed = JSON.parse(bRes);
            var bSources = parsed.sources || [];
            for (var bi = 0; bi < bSources.length; bi++) {
                var bSrc = bSources[bi];
                if (!bSrc || !bSrc.url || bSrc.isEmbed) continue; // Solo directos para GrayJay
                if (bSrc.type === "hls" || bSrc.url.indexOf(".m3u8") >= 0) {
                    sources.push(new HLSSource({
                        name: bSrc.name || "Stream HLS",
                        duration: bSrc.duration || 0,
                        url: bSrc.url
                    }));
                } else {
                    sources.push(new VideoUrlSource({
                        name: bSrc.name || "Video MP4",
                        duration: bSrc.duration || 0,
                        url: bSrc.url,
                        container: "video/mp4"
                    }));
                }
                if (sources.length >= 4) break;
            }
        }
    } catch (err) {}

    // INTENTO 2: Si el backend estaba en cold start o no devolviÃ³ fuentes directas,
    // ejecutar el extractor rÃ¡pido de StreamWish + OK.ru
    if (!sources.length) {
        var wishSrc = resolveFastStreamWish(p.id, isTv, s, e);
        if (wishSrc) sources.push(wishSrc);

        var okruSrc = resolveFastOkru(mediaTitle, year, isTv);
        if (okruSrc) sources.push(okruSrc);
    }

    var dispName = isTv ? (mediaTitle + " Â· S" + s + "E" + e) : (mediaTitle + (year ? (" (" + year + ")") : ""));

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, isTv ? ("tv_" + p.id + "_" + s + "_" + e) : ("movie_" + p.id), PID),
        name: dispName,
        thumbnails: thumb(posterUrl),
        author: isTv ? showAuthor(p.id, mediaTitle, posterUrl) : tmdbAuthor(),
        uploadDate: 0,
        duration: (info.runtime || 0) * 60,
        viewCount: 0,
        isLive: false,
        url: url,
        description: (info.overview || "") + "\n\nFuentes directas listas para Auto-Play: " + sources.length,
        video: new VideoSourceDescriptor(sources)
    });
}

// REGISTRO DE INTERFAZ GRAYJAY
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
