/*
 * PelisHub Index v1.0.0 - GrayJay source (ES5)
 * Indexador liviano: NO scrapea nada. Pide catalogo y fuentes ya resueltas al Cloudflare Worker (pelishub).
 * Las URLs internas siguen siendo streamflixhub://... para no romper items guardados del plugin anterior.
 */

var PLATFORM = "PelisHub";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e99";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "streamflixhub://";
var FEED_MIXED = (typeof Type !== "undefined" && Type && Type.Feed && Type.Feed.Mixed) ? Type.Feed.Mixed : "MIXED";
var ORDER_CHRONO = (typeof Type !== "undefined" && Type && Type.Order && Type.Order.Chronological) ? Type.Order.Chronological : "CHRONOLOGICAL";

var _settings = {};

function setting(name) { var v = _settings && _settings[name]; return v == null ? "" : String(v); }
function flag(name) { var v = _settings && _settings[name]; return v === true || v === "true" || v === 1 || v === "1"; }
function enc(s) { return encodeURIComponent(String(s == null ? "" : s)); }
function unixOf(s) { if (!s) return 0; var t = new Date(String(s)).getTime(); return isNaN(t) ? 0 : Math.floor(t / 1000); }

/* ------------------------------------------------------------------ */
/* cliente del Worker                                                  */
/* ------------------------------------------------------------------ */

function apiGet(path) {
    var base = setting("apiBase").replace(/\/+$/, "");
    if (!base) throw new ScriptException("Falta la URL del Worker. Configurala en los ajustes del source (apiBase).");
    var headers = { "Accept": "application/json" };
    if (setting("apiKey")) headers["X-Api-Key"] = setting("apiKey");
    var r = http.GET(base + path, headers, false), j = null;
    try { j = JSON.parse(r.body); } catch (e) { j = null; }
    if (!r.isOk && !(j && (j.sources || j.error))) throw new ScriptException("Worker respondio HTTP " + r.code + " en " + path);
    if (!j) throw new ScriptException("Worker devolvio una respuesta que no es JSON en " + path);
    return j;
}

/* ------------------------------------------------------------------ */
/* URLs internas                                                       */
/* ------------------------------------------------------------------ */

function makeMovieUrl(id) { return SCHEME + "movie/" + id; }
function makeTvUrl(id, s, e) { return SCHEME + "tv/" + id + "/" + s + "/" + e; }
function makeShowUrl(id) { return SCHEME + "show/" + id; }
function parseInternal(url) {
    var s = String(url || ""), m = s.match(/^streamflixhub:\/\/movie\/(\d+)$/);
    if (m) return { kind: "movie", id: m[1] };
    m = s.match(/^streamflixhub:\/\/tv\/(\d+)\/(\d+)\/(\d+)$/);
    if (m) return { kind: "tv", id: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
    m = s.match(/^streamflixhub:\/\/show\/(\d+)$/);
    if (m) return { kind: "show", id: m[1] };
    return null;
}

/* ------------------------------------------------------------------ */
/* objetos GrayJay                                                     */
/* ------------------------------------------------------------------ */

function thumb(u) { return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]); }
function tmdbAuthor() { return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0); }
function showAuthor(id, name, poster) {
    return new PlatformAuthorLink(new PlatformID(PLATFORM, "show_" + id, PID), name || "Serie", makeShowUrl(id), poster || "", 0);
}
function catalogVideo(x) {
    var isTv = x.kind == "tv", name = (x.title || "Sin t\u00edtulo") + (x.year ? " (" + x.year + ")" : "") + (isTv ? " \u00b7 Serie" : "");
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + x.id, PID),
        name: name,
        thumbnails: thumb(x.poster),
        author: isTv ? showAuthor(x.id, x.title, x.poster) : tmdbAuthor(),
        uploadDate: unixOf(x.date),
        viewCount: 0,
        duration: 0,
        isLive: false,
        url: isTv ? makeTvUrl(x.id, 1, 1) : makeMovieUrl(x.id)
    });
}
function episodeVideo(show, poster, e) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "tv_" + e.showId + "_" + e.season + "_" + e.episode, PID),
        name: "S" + e.season + "E" + e.episode + " \u00b7 " + (e.name || ("Episodio " + e.episode)),
        thumbnails: thumb(e.still || poster),
        author: showAuthor(e.showId, show, poster),
        uploadDate: unixOf(e.date),
        viewCount: 0,
        duration: e.runtime || 0,
        isLive: false,
        url: makeTvUrl(e.showId, e.season, e.episode)
    });
}
function mapItems(list) {
    var out = [], i;
    for (i = 0; i < (list || []).length; i++) out.push(catalogVideo(list[i]));
    return out;
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

/* fuente resuelta por el Worker -> objeto GrayJay */
function toSource(s) {
    if (!s || !s.url) return null;
    var o = { name: s.name || "Video", url: s.url, duration: 0 }, h = s.headers, bare = !!s.bare;
    if (h) {
        o.requestModifier = {
            headers: h,
            modifyRequest: function (url, headers) {
                var nh = bare ? {} : (headers || {}), k;
                for (k in h) if (h.hasOwnProperty(k)) nh[k] = h[k];
                return { url: url, headers: nh };
            }
        };
    }
    try {
        if (s.type == "hls") return new HLSSource(o);
        if (s.type == "dash" && typeof DashSource == "function") return new DashSource(o);
        var q = s.quality || 0;
        o.width = q ? Math.round(q * 16 / 9) : 0;
        o.height = q;
        o.container = /\.webm(?:[?#]|$)/i.test(s.url) ? "video/webm" : (/\.mkv(?:[?#]|$)/i.test(s.url) ? "video/x-matroska" : "video/mp4");
        o.codec = "";
        o.bitrate = 0;
        return new VideoUrlSource(o);
    } catch (e) { return null; }
}

/* ------------------------------------------------------------------ */
/* detalle                                                             */
/* ------------------------------------------------------------------ */

function details(url) {
    var p = parseInternal(url), isTv, path, res, m, sources = [], i, s, name, desc;
    if (!p) return null;
    if (p.kind == "show") p = { kind: "tv", id: p.id, season: 1, episode: 1 };
    isTv = p.kind == "tv";
    path = isTv ? "/resolve/tv/" + p.id + "/" + p.season + "/" + p.episode : "/resolve/movie/" + p.id;
    if (flag("debugMode")) path += "?debug=1";
    res = apiGet(path);
    m = res.meta || {};
    for (i = 0; i < (res.sources || []).length; i++) { s = toSource(res.sources[i]); if (s) sources.push(s); }
    name = isTv ? ((m.title || "Serie") + " \u00b7 S" + p.season + "E" + p.episode + (m.episodeName ? " \u00b7 " + m.episodeName : ""))
        : ((m.title || "Pel\u00edcula") + (m.year ? " (" + m.year + ")" : ""));
    if (!sources.length) {
        var msg = "Sin fuentes reproducibles: " + name + (res.error ? "\n" + res.error : "");
        if (res.debug && res.debug.length) msg += "\n\n" + res.debug.slice(Math.max(0, res.debug.length - 40)).join("\n").substring(0, 3500);
        else msg += "\n\nActiva el modo diagn\u00f3stico en los ajustes para ver el detalle.";
        throw new ScriptException(msg);
    }
    desc = (m.overview || "") + "\n\nFuentes: " + sources.length + (res.cached ? " (cache)" : "");
    if (res.debug && res.debug.length && flag("debugMode")) desc += "\n\n=== DEBUG ===\n" + res.debug.slice(Math.max(0, res.debug.length - 60)).join("\n");
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, isTv ? ("tv_" + p.id + "_" + p.season + "_" + p.episode) : ("movie_" + p.id), PID),
        name: name,
        thumbnails: thumb(m.poster),
        author: isTv ? showAuthor(p.id, m.title, m.poster) : tmdbAuthor(),
        uploadDate: unixOf(m.date),
        duration: m.runtime || 0,
        viewCount: 0,
        isLive: false,
        url: url,
        description: desc,
        video: new VideoSourceDescriptor(sources)
    });
}
function errorDetails(url, msg) {
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "error", PID), name: "PelisHub: " + msg, thumbnails: new Thumbnails([]), author: tmdbAuthor(),
        uploadDate: 0, viewCount: 0, isLive: false, url: String(url || ""), video: new VideoSourceDescriptor([]), description: msg
    });
}

/* ------------------------------------------------------------------ */
/* series como canal                                                   */
/* ------------------------------------------------------------------ */

function channelOf(url) {
    var p = parseInternal(url);
    if (!p || p.kind != "show") return null;
    var d = apiGet("/tv/" + p.id);
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "show_" + p.id, PID),
        name: d.title || "Serie",
        thumbnail: d.poster || "",
        banner: d.backdrop || "",
        subscribers: 0,
        description: (d.overview || "") + "\n\nTemporadas: " + (d.numberOfSeasons || "?") + " \u00b7 Episodios: " + (d.numberOfEpisodes || "?"),
        url: url,
        urlAlternatives: [url],
        links: {}
    });
}
function seasonVideos(show, poster, id, sn) {
    var d = apiGet("/tv/" + id + "/season/" + sn), out = [], i;
    for (i = 0; i < (d.episodes || []).length; i++) out.push(episodeVideo(show, poster, d.episodes[i]));
    return out;
}
function channelContents(url) {
    var p = parseInternal(url);
    if (!p || p.kind != "show") return new VideoPager([], false, {});
    var d = apiGet("/tv/" + p.id), seasons = d.seasons || [{ number: 1 }], idx = 0;
    var first = seasonVideos(d.title, d.poster, p.id, seasons[0].number);
    return makePager(first, seasons.length > 1, function () {
        idx++;
        return { results: seasonVideos(d.title, d.poster, p.id, seasons[idx].number), hasMore: idx + 1 < seasons.length };
    });
}
function recommendations(url) {
    var p = parseInternal(url), out = [], i, d, e;
    if (!p) return [];
    if (p.kind == "tv") {
        d = apiGet("/tv/" + p.id + "/episodes");
        for (i = 0; i < (d.episodes || []).length && out.length < 300; i++) {
            e = d.episodes[i];
            if (e.season == p.season && e.episode == p.episode) continue;
            out.push(episodeVideo(d.show.title, d.show.poster, e));
        }
        return out;
    }
    if (p.kind == "movie") return mapItems(apiGet("/recommendations/movie/" + p.id).items).slice(0, 20);
    return [];
}

/* ------------------------------------------------------------------ */
/* API de GrayJay                                                      */
/* ------------------------------------------------------------------ */

if (typeof source != "undefined") {
    source.enable = function (conf, settings, savedState) { _settings = settings || {}; };
    source.setSettings = function (s) { _settings = s || {}; };
    source.saveState = function () { return ""; };

    source.getHome = function () {
        var r = apiGet("/home?page=1");
        return makePager(mapItems(r.items), !!r.hasMore, function (pg) {
            var n = apiGet("/home?page=" + pg);
            return { results: mapItems(n.items), hasMore: !!n.hasMore };
        });
    };
    source.searchSuggestions = function (q) { return []; };
    source.getSearchCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.search = function (q, type, order, filters) {
        q = q || "";
        var r = apiGet("/search?q=" + enc(q) + "&page=1");
        return makePager(mapItems(r.items), !!r.hasMore, function (pg) {
            var n = apiGet("/search?q=" + enc(q) + "&page=" + pg);
            return { results: mapItems(n.items), hasMore: !!n.hasMore };
        });
    };
    source.getSearchChannelContentsCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.searchChannels = function (q) { return new ChannelPager([], false, {}); };

    source.isChannelUrl = function (u) { var p = parseInternal(u); return !!(p && p.kind == "show"); };
    source.getChannel = function (u) { return channelOf(u); };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [ORDER_CHRONO], filters: [] }; };
    source.getChannelContents = function (u, type, order, filters) {
        try { return channelContents(u); } catch (e) { return new VideoPager([], false, {}); }
    };

    source.isContentDetailsUrl = function (u) { var p = parseInternal(u); return !!(p && (p.kind == "movie" || p.kind == "tv")); };
    source.getContentDetails = function (u) {
        try {
            var d = details(u);
            return d || errorDetails(u, "URL desconocida");
        } catch (e) {
            var em = String((e && e.message) ? e.message : e);
            if (em.indexOf("Sin fuentes reproducibles") === 0 || em.indexOf("Falta la URL del Worker") === 0) throw e;
            try { if (typeof ScriptException !== "undefined" && e instanceof ScriptException) throw e; } catch (e2) { if (e2 === e) throw e; }
            return errorDetails(u, em);
        }
    };
    source.getContentRecommendations = function (u) {
        try { return new VideoPager(recommendations(u), false, {}); } catch (e) { return new VideoPager([], false, {}); }
    };
}
