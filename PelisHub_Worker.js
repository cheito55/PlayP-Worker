/*
 * PelisHub Worker - cliente GrayJay ES5 minimo
 * Catalogo + detalles desde Cloudflare Worker.
 * Version limpia sin regex complejos (evita SyntaxError en el motor de GrayJay).
 */

var PLATFORM = "PelisHubWorker";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e99";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "pelishubworker://";

var _settings = {};
var API_BASE = "https://pelishub.cheito55.workers.dev";
var API_KEY = "";
var MODES = ["fast", "normal", "full"];

function truthy(v) {
    return v === true || v === "true" || v === 1 || v === "1";
}

function applySettings(s) {
    _settings = s || {};
    var base = "";
    if (_settings.apiBase != null && String(_settings.apiBase).length > 0) {
        base = String(_settings.apiBase);
    }
    base = base.replace(/^\s+|\s+$/g, "").replace(/\/+$/g, "");
    if (base) {
        API_BASE = base;
    }
    if (!API_BASE || API_BASE.indexOf("xxxxx") >= 0) {
        API_BASE = "https://pelishub.cheito55.workers.dev";
    }
    API_KEY = String(_settings.apiKey || "").replace(/^\s+|\s+$/g, "");
}

function needBase() {
    if (!API_BASE || API_BASE.indexOf("xxxxx") >= 0) {
        API_BASE = "https://pelishub.cheito55.workers.dev";
    }
    API_BASE = String(API_BASE).replace(/\/+$/g, "");
}

function apiHeaders(json) {
    var h = {
        "User-Agent": "GrayJay-PelisHubWorker",
        "Accept": "application/json"
    };
    if (API_KEY) {
        h["x-api-key"] = API_KEY;
    }
    if (json) {
        h["Content-Type"] = "application/json";
    }
    return h;
}

function parseBody(r) {
    if (!r || r.body == null || r.body === "") {
        return null;
    }
    try {
        return JSON.parse(r.body);
    } catch (e) {
        return null;
    }
}

function checkResp(r, path) {
    var url = API_BASE + path;
    if (!r) {
        throw new ScriptException("Sin respuesta del worker\n" + url);
    }
    var code = (r.code != null) ? r.code : 0;
    var ok = (r.isOk === true) || (code >= 200 && code < 300);
    if (code === 401) {
        throw new ScriptException("Worker: API key invalida\n" + url);
    }
    if (!ok) {
        var snip = r.body ? String(r.body).substring(0, 160) : "(sin body)";
        throw new ScriptException("Worker HTTP " + code + "\n" + url + "\n" + snip);
    }
}

function apiGet(path) {
    needBase();
    var url = API_BASE + path;
    var r = null;
    try {
        r = http.GET(url, apiHeaders(false), false);
    } catch (e) {
        throw new ScriptException("Fallo http.GET\n" + url + "\n" + String(e));
    }
    checkResp(r, path);
    var data = parseBody(r);
    if (data == null && r.body) {
        throw new ScriptException("Worker no devolvio JSON\n" + url);
    }
    return data;
}

function optQuery() {
    var q = [];
    if (truthy(_settings.servidoresPlus)) {
        q.push("plus=1");
    }
    var mi = parseInt(_settings.serverMode, 10);
    if (isNaN(mi) || mi < 0 || mi > 2) {
        mi = 0;
    }
    q.push("mode=" + MODES[mi]);
    if (truthy(_settings.extraSites)) {
        q.push("extra=1");
    }
    if (truthy(_settings.debugMode)) {
        q.push("debug=1");
    }
    return q.join("&");
}

function thumb(u) {
    if (u) {
        return new Thumbnails([new Thumbnail(u, 100)]);
    }
    return new Thumbnails([]);
}

function unixOf(d) {
    if (!d) {
        return 0;
    }
    var t = Date.parse(d);
    return isNaN(t) ? 0 : Math.floor(t / 1000);
}

function baseAuthor() {
    return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0);
}

function showAuthor(chanUrl, name, poster) {
    return new PlatformAuthorLink(PPID, name || "Serie", chanUrl, poster || "", 0);
}

function mkUrl(parts) {
    return SCHEME + parts.join("/");
}

function parseUrl(url) {
    var s = String(url || "");
    if (s.indexOf(SCHEME) !== 0) {
        return null;
    }
    var p = s.substring(SCHEME.length).split("/");
    var t = p[0];
    function n(x, d) {
        var v = parseInt(x, 10);
        return isNaN(v) ? d : v;
    }
    if (t === "movie" && p[1] && /^\d+$/.test(p[1])) {
        return { kind: "movie", id: p[1] };
    }
    if (t === "tv" && p[1] && /^\d+$/.test(p[1])) {
        return { kind: "tv", id: p[1], season: n(p[2], 1), episode: n(p[3], 1) };
    }
    if (t === "show" && p[1] && /^\d+$/.test(p[1])) {
        return { kind: "show", id: p[1] };
    }
    return null;
}

function mapItem(it) {
    if (!it) {
        return null;
    }
    var kind = it.kind;
    var id = String(it.id);
    var url = "";
    var chan = "";
    var vid = kind + "_" + id;
    if (kind === "movie") {
        url = mkUrl(["movie", id]);
    } else if (kind === "tv") {
        url = mkUrl(["tv", id, "1", "1"]);
        chan = mkUrl(["show", id]);
    } else {
        return null;
    }
    var title = it.title || "Sin titulo";
    if (it.year && kind === "movie") {
        title = title + " (" + it.year + ")";
    }
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, vid, PID),
        name: title,
        thumbnails: thumb(it.poster),
        author: chan ? showAuthor(chan, it.title, it.poster) : baseAuthor(),
        uploadDate: unixOf(it.date),
        viewCount: 0,
        duration: 0,
        isLive: false,
        url: url
    });
}

function mapItems(list) {
    var out = [];
    var i;
    for (i = 0; i < (list || []).length; i++) {
        var v = mapItem(list[i]);
        if (v) {
            out.push(v);
        }
    }
    return out;
}

function makePager(results, hasMore, loadNext) {
    var pager = new VideoPager(results || [], !!hasMore, {});
    var page = 1;
    pager.nextPage = function () {
        page = page + 1;
        var r = null;
        try {
            r = loadNext(page);
        } catch (e) {
            r = null;
        }
        r = r || { results: [], hasMore: false };
        this.results = r.results || [];
        this.hasMore = !!r.hasMore;
        return this;
    };
    return pager;
}

function pageOf(path, pg) {
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    var d = apiGet(path + sep + "page=" + pg) || {};
    var more = d.hasMore === true;
    if (d.hasMore === undefined && pg < (d.totalPages || 1)) {
        more = true;
    }
    return { results: mapItems(d.results), hasMore: more };
}

function heightOf(name) {
    var m = /(\d{3,4})p/i.exec(name || "");
    if (m) {
        return parseInt(m[1], 10);
    }
    if (/4k|ultra/i.test(name || "")) {
        return 2160;
    }
    if (/full/i.test(name || "")) {
        return 1080;
    }
    if (/\bhd\b/i.test(name || "")) {
        return 720;
    }
    return 0;
}

function hasKeys(o) {
    var k;
    for (k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) {
            return true;
        }
    }
    return false;
}

function toSource(s) {
    if (!s || !s.url) {
        return null;
    }
    var rm = null;
    if (!s.bare && s.headers && hasKeys(s.headers)) {
        rm = { headers: s.headers };
    }
    try {
        if (s.type === "hls") {
            return new HLSSource({
                name: s.name || "HLS",
                url: s.url,
                duration: 0,
                priority: false,
                requestModifier: rm
            });
        }
        var h = heightOf(s.name);
        var w = h ? Math.round(h * 16 / 9) : 0;
        return new VideoUrlSource({
            name: s.name || "Video",
            url: s.url,
            width: w,
            height: h,
            container: s.container || "video/mp4",
            codec: "",
            bitrate: 0,
            duration: 0,
            requestModifier: rm
        });
    } catch (e) {
        return null;
    }
}

function pathFor(p) {
    var q = optQuery();
    if (p.kind === "movie") {
        return "/api/movie/" + p.id + "?" + q;
    }
    if (p.kind === "tv") {
        return "/api/tv/" + p.id + "/" + p.season + "/" + p.episode + "?" + q;
    }
    return "";
}

function detailsId(p) {
    var k = p.kind + "_" + p.id;
    if (p.season !== undefined) {
        k = k + "_" + p.season;
    }
    if (p.episode !== undefined) {
        k = k + "_" + p.episode;
    }
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
        var more = d.hasMore === true;
        if (d.hasMore === undefined && 1 < (d.totalPages || 1)) {
            more = true;
        }
        return makePager(mapItems(d.results), more, function (pg) {
            return pageOf("/api/home", pg);
        });
    };

    source.getSearchCapabilities = function () {
        return { types: ["MIXED"], sorts: [], filters: [] };
    };

    source.search = function (query) {
        var q = String(query || "");
        if (!q) {
            return new VideoPager([], false, {});
        }
        var base = "/api/search?q=" + encodeURIComponent(q);
        if (truthy(_settings.extraSites)) {
            base = base + "&extra=1";
        }
        var d = apiGet(base + "&page=1") || {};
        var more = d.hasMore === true;
        if (d.hasMore === undefined && 1 < (d.totalPages || 1)) {
            more = true;
        }
        return makePager(mapItems(d.results), more, function (pg) {
            return pageOf(base, pg);
        });
    };

    source.isContentDetailsUrl = function (url) {
        var p = parseUrl(url);
        return !!(p && (p.kind === "movie" || p.kind === "tv"));
    };

    source.getContentDetails = function (url) {
        var p = parseUrl(url);
        if (!p || !pathFor(p)) {
            throw new ScriptException("URL no valida");
        }
        var data = apiGet(pathFor(p));
        if (!data || (data.error && !data.sources)) {
            throw new ScriptException((data && data.error) ? data.error : "No se pudo obtener detalles");
        }

        var sources = [];
        var raw = data.sources || [];
        var i;
        for (i = 0; i < raw.length; i++) {
            var s = toSource(raw[i]);
            if (s) {
                sources.push(s);
            }
        }

        var desc = data.overview || "";
        if (truthy(_settings.debugMode) || !sources.length) {
            if (data.debug) {
                var dbg = typeof data.debug === "string" ? data.debug : data.debug.join("\n");
                desc = desc + "\n\n=== DEBUG ===\n" + dbg;
            }
        }
        if (!sources.length && !truthy(_settings.debugMode)) {
            throw new ScriptException("Sin fuentes reproducibles: " + (data.title || ""));
        }

        return new PlatformVideoDetails({
            id: detailsId(p),
            name: data.title || "Sin titulo",
            thumbnails: thumb(data.still || data.backdrop || data.poster),
            author: (p.kind === "tv")
                ? showAuthor(mkUrl(["show", p.id]), data.title, data.poster)
                : baseAuthor(),
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
        return !!(p && p.kind === "show");
    };

    source.getChannel = function (url) {
        var p = parseUrl(url);
        if (!p || p.kind !== "show") {
            throw new ScriptException("URL no valida");
        }
        var d = apiGet("/api/show/" + p.id);
        if (!d) {
            throw new ScriptException("No se pudo obtener la serie");
        }
        return new PlatformChannel({
            id: new PlatformID(PLATFORM, "show_" + p.id, PID),
            name: d.title || "Serie",
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
        var p = parseUrl(url);
        if (!p || p.kind !== "show") {
            return new VideoPager([], false, {});
        }
        var d = apiGet("/api/show/" + p.id);
        var vids = [];
        var au = showAuthor(url, d && d.title, d && d.poster);
        var seasons = (d && d.seasons) || [];
        var i, j, e;
        for (i = 0; i < seasons.length; i++) {
            var eps = seasons[i].episodes || [];
            for (j = 0; j < eps.length && vids.length < 600; j++) {
                e = eps[j];
                vids.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, "tv_" + p.id + "_" + seasons[i].season + "_" + e.episode, PID),
                    name: "S" + seasons[i].season + "E" + e.episode + " - " + (e.name || ""),
                    thumbnails: thumb(e.still || (d && d.poster)),
                    author: au,
                    uploadDate: unixOf(e.airDate),
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
