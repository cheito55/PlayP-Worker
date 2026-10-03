/*
 * PelisHub Worker client.
 * Mismos hooks que PlayPelis_GrayJay_v4 (source.enable / getHome / search / getContentDetails).
 * Misma llamada HTTP que PlPro y Mxltv: http.GET(url, headers) y JSON.parse(body).
 * No scrapea sitios: el Worker ya devuelve el catalogo y las fuentes.
 */
var PLATFORM = "PelisHubWorker";
var PID = (typeof config != "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e99";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "pelishubworker://";
var UA = "GrayJay-PelisHubWorker";
var API_BASE = "https://pelishub.cheito55.workers.dev";
var _settings = {};

function applySettings(s) {
    _settings = s || {};
    var base = String(_settings.apiBase || "");
    base = trimStr(base);
    while (base.length && base.charAt(base.length - 1) == "/") base = base.substring(0, base.length - 1);
    if (base && base.indexOf("xxxxx") < 0) API_BASE = base;
}
function trimStr(s) {
    s = String(s || "");
    var a = 0, b = s.length;
    while (a < b && (s.charAt(a) == " " || s.charAt(a) == "\n" || s.charAt(a) == "\r" || s.charAt(a) == "\t")) a++;
    while (b > a && (s.charAt(b - 1) == " " || s.charAt(b - 1) == "\n" || s.charAt(b - 1) == "\r" || s.charAt(b - 1) == "\t")) b--;
    return s.substring(a, b);
}
function on(v) { return v === true || v === "true" || v === 1 || v === "1"; }
function httpGet(url) {
    try {
        var h = { "User-Agent": UA, "Accept": "application/json" };
        var key = trimStr(_settings.apiKey || "");
        if (key) h["x-api-key"] = key;
        var r = http.GET(url, h);
        return (r && r.body) ? r.body : "";
    } catch (e) {
        return "";
    }
}
function apiGet(path) {
    var body = httpGet(API_BASE + path);
    if (!body) return null;
    try { return JSON.parse(body); } catch (e) { return null; }
}
function qExtra() {
    var q = [];
    if (on(_settings.servidoresPlus)) q.push("plus=1");
    if (on(_settings.extraSites)) q.push("extra=1");
    if (on(_settings.debugMode)) q.push("debug=1");
    var mode = parseInt(_settings.serverMode, 10);
    if (isNaN(mode) || mode < 0 || mode > 2) mode = 0;
    q.push("mode=" + ["fast", "normal", "full"][mode]);
    return q.join("&");
}
function withQuery(path) {
    var extra = qExtra();
    if (!extra) return path;
    return path + (path.indexOf("?") >= 0 ? "&" : "?") + extra;
}
function thumb(u) { return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]); }
function author() { return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0); }
function mkUrl(parts) { return SCHEME + parts.join("/"); }
function mapItem(it) {
    if (!it || !it.id) return null;
    var kind = it.kind, id = String(it.id), url = "", title = it.title || "Sin titulo";
    if (kind == "movie") {
        url = mkUrl(["movie", id]);
        if (it.year) title += " (" + it.year + ")";
    } else if (kind == "tv") {
        url = mkUrl(["tv", id, "1", "1"]);
    } else return null;
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, kind + "_" + id, PID),
        name: title,
        thumbnails: thumb(it.poster),
        author: author(),
        uploadDate: 0,
        viewCount: 0,
        duration: 0,
        isLive: false,
        url: url
    });
}
function mapItems(list) {
    var out = [], i, v;
    for (i = 0; i < (list || []).length; i++) { v = mapItem(list[i]); if (v) out.push(v); }
    return out;
}
function pager(path) {
    var d = apiGet(path + (path.indexOf("?") >= 0 ? "&" : "?") + "page=1") || {};
    var page = 1;
    var p = new VideoPager(mapItems(d.results), d.hasMore === true, {});
    p.nextPage = function () {
        page++;
        var n = apiGet(path + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + page) || {};
        this.results = mapItems(n.results);
        this.hasMore = n.hasMore === true;
        return this;
    };
    return p;
}
function toSource(s) {
    if (!s || !s.url) return null;
    try {
        if (s.type == "hls" || String(s.url).indexOf(".m3u8") >= 0) {
            return new HLSSource({ name: s.name || "HLS", url: s.url, duration: 0, priority: false });
        }
        return new VideoUrlSource({
            name: s.name || "Video", url: s.url, width: 0, height: 0,
            container: s.container || "video/mp4", codec: "", bitrate: 0, duration: 0
        });
    } catch (e) { return null; }
}
function parseUrl(url) {
    var s = String(url || "");
    if (s.indexOf(SCHEME) != 0) return null;
    var p = s.substring(SCHEME.length).split("/");
    if (p[0] == "movie" && p[1]) return { kind: "movie", id: p[1] };
    if (p[0] == "tv" && p[1]) return { kind: "tv", id: p[1], season: p[2] || "1", episode: p[3] || "1" };
    if (p[0] == "show" && p[1]) return { kind: "show", id: p[1] };
    return null;
}

var FEED_MIXED = (typeof Type != "undefined" && Type && Type.Feed && Type.Feed.Mixed) ? Type.Feed.Mixed : "MIXED";

if (typeof source != "undefined") {
    source.enable = function (conf, settings) { applySettings(settings); };
    source.setSettings = function (s) { applySettings(s); };
    source.getHome = function () {
        try { return pager("/api/home"); }
        catch (e) { return new VideoPager([], false, {}); }
    };
    source.searchSuggestions = function () { return []; };
    source.getSearchCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.search = function (q) {
        try {
            q = q || "";
            if (!q) return new VideoPager([], false, {});
            return pager("/api/search?q=" + encodeURIComponent(q) + (on(_settings.extraSites) ? "&extra=1" : ""));
        } catch (e) { return new VideoPager([], false, {}); }
    };
    source.isContentDetailsUrl = function (u) {
        var p = parseUrl(u);
        return p && (p.kind == "movie" || p.kind == "tv");
    };
    source.getContentDetails = function (u) {
        var p = parseUrl(u);
        if (!p) throw new ScriptException("URL no valida");
        var path = p.kind == "movie" ? "/api/movie/" + p.id : "/api/tv/" + p.id + "/" + p.season + "/" + p.episode;
        var data = apiGet(withQuery(path));
        if (!data) throw new ScriptException("Sin respuesta del worker");
        var raw = data.sources || [], sources = [], i, s;
        for (i = 0; i < raw.length; i++) { s = toSource(raw[i]); if (s) sources.push(s); }
        var desc = data.overview || "";
        if (data.debug) desc += "\n\n=== DEBUG ===\n" + (typeof data.debug == "string" ? data.debug : String(data.debug));
        if (!sources.length) throw new ScriptException("Sin fuentes: " + (data.title || "") + (desc ? "\n" + desc : ""));
        return new PlatformVideoDetails({
            id: new PlatformID(PLATFORM, p.kind + "_" + p.id, PID),
            name: data.title || "Sin titulo",
            thumbnails: thumb(data.still || data.backdrop || data.poster),
            author: author(),
            uploadDate: 0,
            duration: data.duration || 0,
            viewCount: 0,
            isLive: false,
            url: u,
            description: desc,
            video: new VideoSourceDescriptor(sources)
        });
    };
    source.isChannelUrl = function (u) {
        var p = parseUrl(u);
        return p && p.kind == "show";
    };
    source.getChannel = function (u) {
        var p = parseUrl(u);
        var d = p ? apiGet("/api/show/" + p.id) : null;
        return new PlatformChannel({
            id: new PlatformID(PLATFORM, "show_" + (p ? p.id : ""), PID),
            name: (d && d.title) || "Serie",
            thumbnail: (d && d.poster) || "",
            banner: (d && d.backdrop) || "",
            subscribers: 0,
            description: (d && d.overview) || "",
            url: u,
            urlAlternatives: [u],
            links: {}
        });
    };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [], filters: [] }; };
    source.getChannelContents = function (u) {
        var p = parseUrl(u), vids = [], d, seasons, i, j, e, eps;
        if (!p) return new VideoPager([], false, {});
        d = apiGet("/api/show/" + p.id) || {};
        seasons = d.seasons || [];
        for (i = 0; i < seasons.length; i++) {
            eps = seasons[i].episodes || [];
            for (j = 0; j < eps.length && vids.length < 400; j++) {
                e = eps[j];
                vids.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, "tv_" + p.id + "_" + seasons[i].season + "_" + e.episode, PID),
                    name: "S" + seasons[i].season + "E" + e.episode + " " + (e.name || ""),
                    thumbnails: thumb(e.still || d.poster),
                    author: author(),
                    uploadDate: 0,
                    viewCount: 0,
                    duration: e.runtime || 0,
                    isLive: false,
                    url: mkUrl(["tv", p.id, String(seasons[i].season), String(e.episode)])
                }));
            }
        }
        return new VideoPager(vids, false, {});
    };
}
