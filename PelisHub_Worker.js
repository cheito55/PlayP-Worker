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

function applySettings(s) {
    _settings = s || {};
    var base = "";
    if (_settings.apiBase != null) base = String(_settings.apiBase);
    base = base.replace(/^\s+|\s+$/g, "").replace(/\/+$/, "");
    API_BASE = base;
    API_KEY = String(_settings.apiKey || "").replace(/^\s+|\s+$/g, "");
}

function needBase() {
    if (!API_BASE)
        throw new ScriptException("Configura la URL del Worker en ajustes (apiBase).\nEjemplo: https://pelishub.cheito55.workers.dev");
    if (API_BASE.indexOf("xxxxx") >= 0)
        throw new ScriptException("La URL sigue con xxxxx.\nPon: https://pelishub.cheito55.workers.dev");
}

function apiHeaders(json) {
    var h = { "User-Agent": "GrayJay-PelisHubWorker", "Accept": "application/json" };
    if (API_KEY) h["x-api-key"] = API_KEY;
    if (json) h["Content-Type"] = "application/json";
    return h;
}

function parseBody(r) {
    if (!r || !r.body) return null;
    try { return JSON.parse(r.body); } catch (e) { return null; }
}

function checkResp(r, what) {
    if (!r) throw new ScriptException("Sin respuesta del worker (" + what + ")");
    if (r.code === 401) throw new ScriptException("Worker: API key invalida (ajuste apiKey)");
    if (r.code >= 500 && !r.body) throw new ScriptException("Worker error " + r.code + " (" + what + ")");
}

function apiGet(path) {
    needBase();
    var r = http.GET(API_BASE + path, apiHeaders(false), false);
    checkResp(r, path);
    return parseBody(r);
}

function apiPost(path, obj) {
    needBase();
    var r = http.POST(API_BASE + path, JSON.stringify(obj), apiHeaders(true), false);
    checkResp(r, path);
    return parseBody(r);
}

function optQuery() {
    var q = [];
    if (truthy(_settings.servidoresPlus)) q.push("plus=1");
    var mi = parseInt(_settings.serverMode, 10);
    q.push("mode=" + MODES[(mi >= 0 && mi < 3) ? mi : 0]);
    if (truthy(_settings.extraSites)) q.push("extra=1");
    return q.join("&");
}

function thumb(u) {
    return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]);
}

function unixOf(d) {
    if (!d) return 0;
    var t = Date.parse(d);
    return isNaN(t) ? 0 : Math.floor(t / 1000);
}

function baseAuthor() {
    return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0);
}

function showAuthor(chanUrl, name, poster) {
    return new PlatformAuthorLink(PPID, name || "Serie", chanUrl, poster || "", 0);
}

function mkUrl(parts) { return SCHEME + parts.join("/"); }

function parseUrl(url) {
    var s = String(url || "");
    if (s.indexOf(SCHEME) !== 0) return null;
    var p = s.substring(SCHEME.length).split("/"), t = p[0];
    var n = function (x, d) { var v = parseInt(x, 10); return isNaN(v) ? d : v; };
    if (t === "movie" && /^\d+$/.test(p[1] || "")) return { kind: "movie", id: p[1] };
    if (t === "tv" && /^\d+$/.test(p[1] || "")) return { kind: "tv", id: p[1], season: n(p[2], 1), episode: n(p[3], 1) };
    if (t === "show" && /^\d+$/.test(p[1] || "")) return { kind: "show", id: p[1] };
    if (t === "jm" && p[1]) return { kind: "jm", id: p[1] };
    if (t === "jt" && p[1]) return { kind: "jt", id: p[1], season: n(p[2], 1), episode: n(p[3], 1) };
    if (t === "jshow" && p[1]) return { kind: "jshow", id: p[1] };
    if (t === "jk" && p[1]) return { kind: "jk", id: p[1], episode: n(p[2], 1) };
    if (t === "jkshow" && p[1]) return { kind: "jkshow", id: p[1] };
    return null;
}

function mapItem(it) {
    var kind = it.kind, id = String(it.id), url, chan = "", vid = kind + "_" + id;
    if (kind === "movie") url = mkUrl(["movie", id]);
    else if (kind === "tv") { url = mkUrl(["tv", id, 1, 1]); chan = mkUrl(["show", id]); }
    else if (kind === "juanita_movie") { var sm = id.replace(/^juanita_m_/, ""); url = mkUrl(["jm", sm]); }
    else if (kind === "juanita_tv") { var st = id.replace(/^juanita_tv_/, ""); url = mkUrl(["jt", st, 1, 1]); chan = mkUrl(["jshow", st]); }
    else if (kind === "jk") { var sj = id.replace(/^jk_/, ""); url = mkUrl(["jk", sj, 1]); chan = mkUrl(["jkshow", sj]); }
    else return null;
    var title = it.title || "Sin titulo";
    if (it.year && kind === "movie") title += " (" + it.year + ")";
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
    var out = [], i, v;
    for (i = 0; i < (list || []).length; i++) { v = mapItem(list[i]); if (v) out.push(v); }
    return out;
}

function makePager(results, hasMore, loadNext) {
    var pager = new VideoPager(results || [], !!hasMore, {});
    var page = 1;
    pager.nextPage = function () {
        page++;
        var r = null;
        try { r = loadNext(page); } catch (e) { r = null; }
        r = r || { results: [], hasMore: false };
        this.results = r.results || [];
        this.hasMore = !!r.hasMore;
        return this;
    };
    return pager;
}

function pageOf(path, pg) {
    var d = apiGet(path + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + pg) || {};
    return { results: mapItems(d.results), hasMore: d.hasMore === true || (d.hasMore === undefined && pg < (d.totalPages || 1)) };
}

var OK_HEADERS = { "Referer": "https://ok.ru/", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" };

function trimOkSearch(html) {
    html = String(html || "");
    var out = [], m, re, seen = {}, total = 0;
    var add = function (s) { if (total > 400000) return; out.push(s); total += s.length; };
    m = /<video-search-results\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(html);
    if (m) add(m[0]);
    re = /<a\b[^>]*href\s*=\s*["'](?:https?:\/\/[^"']+)?\/(?:video|videoembed)\/(\d+)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
    while ((m = re.exec(html)) != null && out.length < 150) { seen[m[1]] = 1; add(m[0].substring(0, 1500)); }
    re = /(?:data-movie-id|data-video-id|data-content-id|st\.mvId|movieId|videoId|video_id|movie_id)\s*["':=]+\s*["']?(\d{6,})/gi;
    while ((m = re.exec(html)) != null && out.length < 220) if (!seen[m[1]]) { seen[m[1]] = 1; add('<a href="/video/' + m[1] + '"></a>'); }
    re = /ok\.ru\/(?:video|videoembed)\/(\d{6,})/gi;
    while ((m = re.exec(html)) != null && out.length < 260) if (!seen[m[1]]) { seen[m[1]] = 1; add('<a href="/video/' + m[1] + '"></a>'); }
    return out.join("\n");
}

function trimOkEmbed(html) {
    html = String(html || "");
    var out = "", t = /<title[^>]*>[^<]*<\/title>/i.exec(html), m = /data-options=(?:"[^"]*"|'[^']*')/i.exec(html);
    if (t) out += t[0];
    if (m) out += "<div " + m[0] + "></div>";
    else {
        var i = html.search(/"hlsManifestUrl"|"metadata"\s*:/);
        if (i >= 0) out += html.substring(Math.max(0, i - 200), i + 120000);
    }
    return out;
}

function okNoSession(html) {
    return /st\.cmd=anonym|anonymLogin|anonymMain|st\.email|field_email/i.test(html || "");
}

function okQs(p) {
    return "kind=" + (p.kind === "tv" ? "tv" : "movie") + "&id=" + p.id + (p.kind === "tv" ? "&s=" + p.season + "&e=" + p.episode : "");
}

function runBatch(reqs) {
    var b = http.batch(), i;
    for (i = 0; i < reqs.length; i++) b.GET(reqs[i].url, reqs[i].headers || {}, !!reqs[i].auth);
    return b.execute() || [];
}

function okruSources(p, plan, dbg) {
    var out = [];
    try {
        if (!plan || !plan.queries || !plan.queries.length) { dbg.push("OK.ru: sin plan"); return out; }
        var reqs = [], i, qs = plan.queries.slice(0, OK_QUERIES);
        for (i = 0; i < qs.length; i++)
            reqs.push({ url: plan.searchUrl.replace("{q}", encodeURIComponent(qs[i])), headers: OK_HEADERS, auth: true });
        var res = runBatch(reqs), pages = [], noSession = 0;
        for (i = 0; i < res.length; i++) {
            var body = res[i] && res[i].body ? res[i].body : "";
            if (!body) continue;
            var tr = trimOkSearch(body);
            if (!tr && okNoSession(body)) { noSession++; continue; }
            if (tr) pages.push(tr);
        }
        dbg.push("OK.ru busquedas=" + res.length + " paginas utiles=" + pages.length + (noSession ? " SIN SESION" : ""));
        if (!pages.length) {
            if (noSession) dbg.push("OK.ru: inicia sesion en el source para encontrar videos");
            return out;
        }
        var hr = apiPost("/api/okru/hits?" + okQs(p), { pages: pages });
        var hits = (hr && hr.hits) || [];
        dbg.push("OK.ru hits=" + hits.length);
        if (!hits.length) return out;
        hits = hits.slice(0, OK_EMBEDS);
        reqs = [];
        for (i = 0; i < hits.length; i++)
            reqs.push({ url: plan.embedUrl.replace("{id}", hits[i].id), headers: OK_HEADERS, auth: true });
        res = runBatch(reqs);
        var embeds = [];
        for (i = 0; i < hits.length; i++) {
            var eb = res[i] && res[i].body ? res[i].body : "";
            if (eb) embeds.push({ id: hits[i].id, name: hits[i].name || "", html: trimOkEmbed(eb) });
        }
        if (!embeds.length) return out;
        var sr = apiPost("/api/okru/sources?" + okQs(p), { pages: embeds });
        var srcs = (sr && sr.sources) || [];
        if (sr && sr.pending && sr.pending.length) {
            var pend = [], byId = {}, k;
            for (k = 0; k < embeds.length; k++) byId[embeds[k].id] = embeds[k];
            reqs = [];
            for (k = 0; k < sr.pending.length; k++) reqs.push({ url: sr.pending[k].url, headers: OK_HEADERS, auth: true });
            var mr = runBatch(reqs);
            for (k = 0; k < sr.pending.length; k++) {
                var pe = byId[sr.pending[k].id], mb = mr[k] && mr[k].body ? mr[k].body : "";
                if (pe && mb) pend.push({ id: pe.id, name: pe.name, html: pe.html, meta: mb });
            }
            if (pend.length) {
                var s2 = apiPost("/api/okru/sources?" + okQs(p), { pages: pend });
                var more = (s2 && s2.sources) || [], seenU = {};
                for (k = 0; k < srcs.length; k++) seenU[srcs[k].url] = 1;
                for (k = 0; k < more.length; k++) if (!seenU[more[k].url]) srcs.push(more[k]);
            }
        }
        dbg.push("OK.ru fuentes=" + srcs.length);
        for (i = 0; i < srcs.length; i++) out.push(srcs[i]);
    } catch (e) {
        dbg.push("OK.ru ERROR " + e);
    }
    return out;
}

function heightOf(name) {
    var m = /(\d{3,4})p/i.exec(name || "");
    if (m) return parseInt(m[1], 10);
    if (/4k|ultra/i.test(name || "")) return 2160;
    if (/full/i.test(name || "")) return 1080;
    if (/\bhd\b/i.test(name || "")) return 720;
    return 0;
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
            name: String(d.title || "Serie").replace(/^\[(?:Juanita|Anime)\]\s*/, ""),
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
