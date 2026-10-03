/*
 * PelisHub Worker - cliente GrayJay (ES5) para el Cloudflare Worker.
 */

var PLATFORM = "PelisHubWorker";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e99";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "pelishubworker://";

var _settings = {};
var API_BASE = "";
var API_KEY = "";
var OK_QUERIES = 3;
var OK_EMBEDS = 3;
var MODES = ["fast", "normal", "full"];

function truthy(v) { return v === true || v === "true" || v === 1 || v === "1"; }


function trimStr(s) {
    s = String(s || "");
    var a = 0, b = s.length;
    while (a < b && (s.charAt(a) === " " || s.charAt(a) === "\t" || s.charAt(a) === "\n" || s.charAt(a) === "\r")) a++;
    while (b > a && (s.charAt(b - 1) === " " || s.charAt(b - 1) === "\t" || s.charAt(b - 1) === "\n" || s.charAt(b - 1) === "\r")) b--;
    return s.substring(a, b);
}
function stripSlash(s) {
    s = String(s || "");
    while (s.length && s.charAt(s.length - 1) === "/") s = s.substring(0, s.length - 1);
    return s;
}
function isDigits(s) {
    s = String(s || "");
    if (!s.length) return false;
    var i;
    for (i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        if (c < "0" || c > "9") return false;
    }
    return true;
}
function stripPrefix(s, pre) {
    s = String(s || "");
    if (s.indexOf(pre) === 0) return s.substring(pre.length);
    return s;
}
function hasAny(s, words) {
    s = String(s || "").toLowerCase();
    var i;
    for (i = 0; i < words.length; i++) if (s.indexOf(words[i]) >= 0) return true;
    return false;
}
function heightOf(name) {
    return heightOfName(name);
}

function hasKeys(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) return true; return false; }

function toSource(s) {
    if (!s || !s.url) return null;
    var rm = (!s.bare && s.headers && hasKeys(s.headers)) ? { headers: s.headers } : null;
    try {
        if (s.type === "hls") {
            return new HLSSource({ name: s.name || "HLS", url: s.url, duration: 0, priority: false, requestModifier: rm });
        }
        var h = heightOf(s.name), w = h ? Math.round(h * 16 / 9) : 0;
        return new VideoUrlSource({
            name: s.name || "Video", url: s.url, width: w, height: h,
            container: s.container || "video/mp4", codec: "", bitrate: 0, duration: 0, requestModifier: rm
        });
    } catch (e) { return null; }
}

function debugOn() { return truthy(_settings.debugMode); }

function pathFor(p) {
    var q = optQuery(), d = debugOn() ? "&debug=1" : "";
    if (p.kind === "movie") return "/api/movie/" + p.id + "?" + q + d;
    if (p.kind === "tv") return "/api/tv/" + p.id + "/" + p.season + "/" + p.episode + "?" + q + d;
    if (p.kind === "jm") return "/api/juanita/movie/" + encodeURIComponent(p.id) + "?" + (debugOn() ? "debug=1" : "");
    if (p.kind === "jt") return "/api/juanita/tv/" + encodeURIComponent(p.id) + "/" + p.season + "/" + p.episode + "?" + (debugOn() ? "debug=1" : "");
    if (p.kind === "jk") return "/api/jk/ep/" + encodeURIComponent(p.id) + "/" + p.episode + "?" + (debugOn() ? "debug=1" : "");
    return "";
}

function detailsId(p) {
    var k = p.kind + "_" + p.id;
    if (p.season !== undefined) k += "_" + p.season;
    if (p.episode !== undefined) k += "_" + p.episode;
    return new PlatformID(PLATFORM, k, PID);
}

if (typeof source !== "undefined") {
    source.enable = function (conf, settings, saveStateStr) {
        applySettings(settings);
    };

    source.setSettings = function (settings) {
        applySettings(settings);
    };

    source.getHome = function () {
        var d = apiGet("/api/home?page=1") || {};
        return makePager(mapItems(d.results), d.hasMore === true || (d.hasMore === undefined && 1 < (d.totalPages || 1)), function (pg) {
            return pageOf("/api/home", pg);
        });
    };

    source.getSearchCapabilities = function () {
        return { types: ["MIXED"], sorts: [], filters: [] };
    };

    source.search = function (query) {
        var q = String(query || "");
        if (!q) return new VideoPager([], false, {});
        var base = "/api/search?q=" + encodeURIComponent(q) + (truthy(_settings.extraSites) ? "&extra=1" : "");
        var d = apiGet(base + "&page=1") || {};
        return makePager(mapItems(d.results), d.hasMore === true || (d.hasMore === undefined && 1 < (d.totalPages || 1)), function (pg) {
            return pageOf(base, pg);
        });
    };

    source.isContentDetailsUrl = function (url) {
        var p = parseUrl(url);
        return !!(p && (p.kind === "movie" || p.kind === "tv" || p.kind === "jm" || p.kind === "jt" || p.kind === "jk"));
    };

    source.getContentDetails = function (url) {
        var p = parseUrl(url);
        if (!p || !pathFor(p)) throw new ScriptException("URL no valida");
        needBase();
        var dbg = [], useOk = (p.kind === "movie" || p.kind === "tv") && _settings.okruSession !== false && _settings.okruSession !== "false";

        var b = http.batch();
        b.GET(API_BASE + pathFor(p), apiHeaders(false), false);
        if (useOk) b.GET(API_BASE + "/api/okru/plan?" + okQs(p), apiHeaders(false), false);
        var rs = b.execute() || [];
        checkResp(rs[0], pathFor(p));
        var data = parseBody(rs[0]);
        if (!data || (data.error && !data.sources)) throw new ScriptException((data && data.error) || "No se pudo obtener detalles");
        var plan = useOk ? parseBody(rs[1]) : null;

        var raw = (data.sources || []).slice(0);
        if (useOk) {
            var ok = okruSources(p, plan, dbg);
            raw = ok.concat(raw);
        }

        var sources = [], i, s;
        for (i = 0; i < raw.length; i++) { s = toSource(raw[i]); if (s) sources.push(s); }

        var desc = data.overview || "";
        if (debugOn() || !sources.length) {
            var lines = [];
            if (dbg.length) lines.push("[cliente] " + dbg.join(" | "));
            if (data.debug) lines.push(typeof data.debug === "string" ? data.debug : data.debug.join("\n"));
            if (lines.length) desc += "\n\n=== DEBUG ===\n" + lines.join("\n");
        }
        if (!sources.length && !debugOn())
            throw new ScriptException("Sin fuentes reproducibles: " + (data.title || ""));

        return new PlatformVideoDetails({
            id: detailsId(p),
            name: data.title || "Sin titulo",
            thumbnails: thumb(data.still || data.backdrop || data.poster),
            author: (p.kind === "tv") ? showAuthor(mkUrl(["show", p.id]), data.title, data.poster) :
                (p.kind === "jt") ? showAuthor(mkUrl(["jshow", p.id]), data.title, "") :
                (p.kind === "jk") ? showAuthor(mkUrl(["jkshow", p.id]), data.title, "") : baseAuthor(),
            uploadDate: unixOf(data.releaseDate),
            duration: data.duration || 0,
            viewCount: 0,
            isLive: false,
            url: url,
            description: desc,
            video: new VideoSourceDescriptor(sources)
        });
    };

    source.getContentRecommendations = function (url) {
        return new VideoPager([], false, {});
    };

    source.isChannelUrl = function (url) {
        var p = parseUrl(url);
        return !!(p && (p.kind === "show" || p.kind === "jshow" || p.kind === "jkshow"));
    };

    source.getChannel = function (url) {
        var p = parseUrl(url);
        if (!p) throw new ScriptException("URL no valida");
        var path = p.kind === "show" ? "/api/show/" + p.id : p.kind === "jshow" ? "/api/juanita/show/" + encodeURIComponent(p.id) : "/api/jk/serie/" + encodeURIComponent(p.id);
        var d = apiGet(path);
        if (!d) throw new ScriptException("No se pudo obtener la serie");
        return new PlatformChannel({
            id: new PlatformID(PLATFORM, p.kind + "_" + p.id, PID),
            name: stripPrefix(stripPrefix(String(d.title || "Serie"), "[Juanita] "), "[Anime] "),
            thumbnail: d.poster || "",
            banner: d.backdrop || "",
            subscribers: 0,
            description: d.overview || "",
            url: url,
            urlAlternatives: [url],
            links: {}
        });
    };

    source.getChannelCapabilities = function () {
        return { types: ["MIXED"], sorts: [], filters: [] };
    };

    source.getChannelContents = function (url, type, order, filters) {
        var p = parseUrl(url), vids = [], i, j, e;
        if (!p) return new VideoPager([], false, {});
        if (p.kind === "show") {
            var d = apiGet("/api/show/" + p.id);
            var au = showAuthor(url, d && d.title, d && d.poster);
            var seasons = (d && d.seasons) || [];
            for (i = 0; i < seasons.length; i++) {
                var eps = seasons[i].episodes || [];
                for (j = 0; j < eps.length && vids.length < 600; j++) {
                    e = eps[j];
                    vids.push(new PlatformVideo({
                        id: new PlatformID(PLATFORM, "tv_" + p.id + "_" + seasons[i].season + "_" + e.episode, PID),
                        name: "S" + seasons[i].season + "E" + e.episode + " \u00b7 " + (e.name || ""),
                        thumbnails: thumb(e.still || d.poster),
                        author: au,
                        uploadDate: unixOf(e.airDate),
                        viewCount: 0,
                        duration: e.runtime || 0,
                        isLive: false,
                        url: mkUrl(["tv", p.id, seasons[i].season, e.episode])
                    }));
                }
            }
        } else if (p.kind === "jshow") {
            var jd = apiGet("/api/juanita/show/" + encodeURIComponent(p.id));
            var ja = showAuthor(url, jd && jd.title, "");
            var jeps = (jd && jd.episodes) || [];
            for (i = 0; i < jeps.length; i++) {
                e = jeps[i];
                vids.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, "jt_" + p.id + "_" + e.season + "_" + e.episode, PID),
                    name: e.name || ("S" + e.season + "E" + e.episode),
                    thumbnails: thumb(""),
                    author: ja,
                    uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
                    url: mkUrl(["jt", p.id, e.season, e.episode])
                }));
            }
        } else if (p.kind === "jkshow") {
            var kd = apiGet("/api/jk/serie/" + encodeURIComponent(p.id));
            var ka = showAuthor(url, kd && kd.title, kd && kd.poster);
            var keps = (kd && kd.episodes) || [];
            for (i = 0; i < keps.length; i++) {
                e = keps[i];
                vids.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, "jk_" + p.id + "_" + e.episode, PID),
                    name: e.name || ("Ep " + e.episode),
                    thumbnails: thumb(kd.poster),
                    author: ka,
                    uploadDate: 0, viewCount: 0, duration: 0, isLive: false,
                    url: mkUrl(["jk", p.id, e.episode])
                }));
            }
        }
        return new VideoPager(vids, false, {});
    };
}
