/*
 * PelisHub Backend Client for GrayJay (Ultra-Lightweight Receiver)
 * Versión 14 - Arquitectura desacoplada.
 * Todo el trabajo de búsqueda, desempacado y resolución ocurre en:
 * https://pelishub-370759581235.us-east1.run.app
 */

var PLATFORM = "StreamflixHub";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e34";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "streamflixhub://";
var BACKEND_URL = "https://pelishub-370759581235.us-east1.run.app";

var _settings = {};

function enc(s) { return encodeURIComponent(String(s == null ? "" : s)); }

function httpGetJson(url) {
    try {
        var r = http.GET(url, {
            "User-Agent": "GrayJay/PelisHubReceiver",
            "Accept": "application/json"
        }, false);
        if (!r) return null;
        var body = r.body != null ? String(r.body) : (r.data != null ? String(r.data) : "");
        return body ? JSON.parse(body) : null;
    } catch (e) {
        return null;
    }
}

function parseInternal(url) {
    var s = String(url || "");
    var m = s.match(/^streamflixhub:\/\/movie\/(\d+)$/);
    if (m) return { kind: "movie", id: m[1] };
    m = s.match(/^streamflixhub:\/\/tv\/(\d+)\/(\d+)\/(\d+)$/);
    if (m) return { kind: "tv", id: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
    m = s.match(/^streamflixhub:\/\/show\/(\d+)$/);
    if (m) return { kind: "show", id: m[1] };
    return null;
}

function thumb(u) { return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]); }
function tmdbAuthor() { return new PlatformAuthorLink(PPID, "PelisHub Cloud", BACKEND_URL, "", 0); }
function showAuthor(id, name, poster) {
    return new PlatformAuthorLink(new PlatformID(PLATFORM, "show_" + id, PID), name || "Serie", SCHEME + "show/" + id, poster || "", 0);
}

function makeVideoItem(x) {
    var isTv = x.media_type === "tv";
    var yr = x.release_date ? String(x.release_date).slice(0, 4) : "";
    var name = (x.title || "Sin título") + (yr ? " (" + yr + ")" : "") + (isTv ? " · Serie" : "");
    var url = isTv ? (SCHEME + "tv/" + x.id + "/1/1") : (SCHEME + "movie/" + x.id);
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + x.id, PID),
        name: name,
        thumbnails: thumb(x.poster_path),
        author: isTv ? showAuthor(x.id, x.title, x.poster_path) : tmdbAuthor(),
        uploadDate: 0,
        viewCount: 0,
        duration: 0,
        isLive: false,
        url: url
    });
}

function makePager(first, hasMore, loadNext) {
    var pager = new VideoPager(first, hasMore, {});
    var page = 1;
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

function mkRequestModifier(headers) {
    if (!headers) return null;
    return {
        headers: headers,
        modifyRequest: function(url, reqHeaders) {
            reqHeaders = reqHeaders || {};
            for (var k in headers) {
                if (headers.hasOwnProperty(k)) reqHeaders[k] = headers[k];
            }
            return { url: url, headers: reqHeaders };
        }
    };
}

if (typeof source !== "undefined") {
    source.enable = function (conf, settings) {
        _settings = settings || {};
    };
    source.setSettings = function (s) { _settings = s || {}; };

    source.getHome = function () {
        var load = function(page) {
            var data = httpGetJson(BACKEND_URL + "/api/tmdb/home?page=" + page);
            var results = [];
            if (data && data.results) {
                for (var i = 0; i < data.results.length; i++) {
                    results.push(makeVideoItem(data.results[i]));
                }
            }
            return {
                results: results,
                hasMore: data ? (page < data.total_pages) : false
            };
        };
        var first = load(1);
        return makePager(first.results, first.hasMore, load);
    };

    source.getSearchCapabilities = function () {
        return { types: ["MIXED"], sorts: [], filters: [] };
    };

    source.search = function (q) {
        var load = function(page) {
            var data = httpGetJson(BACKEND_URL + "/api/tmdb/search?q=" + enc(q) + "&page=" + page);
            var results = [];
            if (data && data.results) {
                for (var i = 0; i < data.results.length; i++) {
                    results.push(makeVideoItem(data.results[i]));
                }
            }
            return {
                results: results,
                hasMore: data ? (page < data.total_pages) : false
            };
        };
        var first = load(1);
        return makePager(first.results, first.hasMore, load);
    };

    source.isChannelUrl = function (u) {
        var p = parseInternal(u);
        return !!(p && p.kind === "show");
    };

    source.getChannel = function (u) {
        var p = parseInternal(u);
        if (!p) return null;
        var data = httpGetJson(BACKEND_URL + "/api/tmdb/show/" + p.id);
        if (!data) return null;
        return new PlatformChannel({
            id: new PlatformID(PLATFORM, "show_" + p.id, PID),
            name: data.title || "Serie",
            thumbnail: data.poster || "",
            banner: data.backdrop || "",
            subscribers: 0,
            description: (data.overview || "") + "\nTemporadas: " + (data.number_of_seasons || 1),
            url: u,
            urlAlternatives: [u],
            links: {}
        });
    };

    source.getChannelCapabilities = function () {
        return { types: ["MIXED"], sorts: ["CHRONOLOGICAL"], filters: [] };
    };

    source.getChannelContents = function (u) {
        var p = parseInternal(u);
        if (!p) return new VideoPager([], false, {});
        var data = httpGetJson(BACKEND_URL + "/api/tmdb/show/" + p.id);
        var eps = (data && data.season1Episodes) || [];
        var out = [];
        for (var i = 0; i < eps.length; i++) {
            var item = eps[i];
            out.push(new PlatformVideo({
                id: new PlatformID(PLATFORM, "tv_" + p.id + "_1_" + item.episode_number, PID),
                name: "S1E" + item.episode_number + " · " + (item.name || ("Episodio " + item.episode_number)),
                thumbnails: thumb(item.still || data.poster),
                author: showAuthor(p.id, data.title, data.poster),
                uploadDate: 0,
                duration: (item.runtime || 0) * 60,
                viewCount: 0,
                isLive: false,
                url: SCHEME + "tv/" + p.id + "/1/" + item.episode_number
            }));
        }
        return new VideoPager(out, false, {});
    };

    source.isContentDetailsUrl = function (u) {
        var p = parseInternal(u);
        return !!(p && (p.kind === "movie" || p.kind === "tv"));
    };

    source.getContentDetails = function (u) {
        var p = parseInternal(u);
        if (!p) throw new Error("URL no válida");

        var servidoresPlus = _settings.servidoresPlus !== false && _settings.servidoresPlus !== "false";
        var resolveUrl = BACKEND_URL + "/api/resolve?type=" + p.kind + "&id=" + p.id +
            (p.kind === "tv" ? ("&season=" + (p.season || 1) + "&episode=" + (p.episode || 1)) : "") +
            "&servidoresPlus=" + servidoresPlus;

        var json = httpGetJson(resolveUrl);
        if (!json || !json.sources || !json.sources.length) {
            var errMsg = (json && json.error) ? json.error : "El backend no pudo encontrar fuentes reproducibles.";
            throw new Error("Sin fuentes: " + errMsg);
        }

        var sources = [];
        for (var i = 0; i < json.sources.length; i++) {
            var raw = json.sources[i];
            var opts = {
                name: raw.name || "Video",
                url: raw.url,
                duration: 0
            };
            if (raw.headers) {
                opts.requestModifier = mkRequestModifier(raw.headers);
            }

            if (raw.type === "hls") {
                try { sources.push(new HLSSource(opts)); } catch (eHls) {}
            } else if (raw.type === "dash" && typeof DashSource === "function") {
                try { sources.push(new DashSource(opts)); } catch (eDash) {}
            } else {
                opts.container = "video/mp4";
                try { sources.push(new VideoUrlSource(opts)); } catch (eMp4) {}
            }
        }

        var title = json.title || "Video";
        if (p.kind === "tv") {
            title += " · S" + p.season + "E" + p.episode;
        } else if (json.year) {
            title += " (" + json.year + ")";
        }

        var description = "Resolución en la nube por PelisHub Backend.\nFuentes reproducibles: " + sources.length +
            "\nTiempo de respuesta: " + (json.timeMs || 0) + "ms";

        return new PlatformVideoDetails({
            id: new PlatformID(PLATFORM, (p.kind === "tv" ? ("tv_" + p.id + "_" + p.season + "_" + p.episode) : ("movie_" + p.id)), PID),
            name: title,
            thumbnails: new Thumbnails([]),
            author: tmdbAuthor(),
            uploadDate: 0,
            duration: 0,
            viewCount: 0,
            isLive: false,
            url: u,
            description: description,
            video: new VideoSourceDescriptor(sources)
        });
    };

    source.getContentRecommendations = function (u) {
        return new VideoPager([], false, {});
    };
}
