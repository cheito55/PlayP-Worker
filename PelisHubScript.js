/*
 * StreamflixHub v1.8.28 - OK.ru reconoce 'N ÑÐµÑ€Ð¸Ñ' (ej. Verano del 98 - 186 ÑÐµÑ€Ð¸Ñ); queries sin apÃ³strofe; sin YouTube.
 * (base) StreamflixHub v1.8.24 - Fix Servidores Plus: filtro de episodio (.ok) en Odysee/Dailymotion/Archive, Archive.org series por archivo/episodio, Dailymotion con filtro de duracion.
 * (base) StreamflixHub v1.8.23 - GrayJay source (ES5) - arquitectura + extractores Streamflix Reborn 1.7.231 + Servidores Plus
 * Catalogo: TMDB. Fuentes: PoseidonHD2, PelisJuanita, Cuevana3, OK.ru, Odysee, Dailymotion, Archive.org, LaCartoons, sitios WP.
 */

var PLATFORM = "StreamflixHub";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "streamflixhub://";

var TMDB_KEY = "26c168179ae6b5445f36aca260e00d48";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_IMG = "https://image.tmdb.org/t/p/w500";
var TMDB_STILL = "https://image.tmdb.org/t/p/w300";
var TMDB_BACK = "https://image.tmdb.org/t/p/w780";

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

var MAX_ITEMS = 40;
var MAX_HTML = 1200000;
var MAX_CAND = 6;
var SERVER_MODES = [{ want: 2, max: 4, extra: 2000 }, { want: 4, max: 6, extra: 5000 }, { want: 6, max: 8, extra: 12000 }];
function serverMode() {
    var v = _settings && _settings.serverMode, n = parseInt(v, 10), m;
    if (v != null && String(v).length > 2) { m = /(\d+)/.exec(String(v)); if (m) n = m[1] == "3" ? 0 : (m[1] == "8" ? 2 : 1); }
    if (isNaN(n) || n < 0 || n >= SERVER_MODES.length) n = 1;
    return SERVER_MODES[n];
}
function wantServers() { return serverMode().want; }
function maxResults() { return serverMode().max; }
var SRC_CACHE_MS = 20 * 60 * 1000;
var BUDGET_MS = 35000;
var CORE_SITE_IDS = { "pelisplus": 1, "cinecalidad": 1, "flixlatam": 1, "pelisflixhd": 1 };
var MAX_WP_PROVIDERS = 4;

var PLPRO_BASE = "https://plpro.org";
var PLPRO_USER = "p";
var PLPRO_PASS = "p";

var _settings = {};
var _debug = "";
var _fail = {};
var _okh = {};
var FAIL_EXPIRE_MS = 15000;
var _deadline = 0;
var _pre = {};
var _spCache = {};
var _tmdbCache = {};
var _srcCache = {};
var _juanitaSlugIndex = {};
var _lat = {};

function log(s) { _debug += String(s) + "\n"; }
function resetDebug() { _debug = ""; }
function budgetLeft() { return Date.now() < _deadline; }
function startBudget() { _deadline = Date.now() + BUDGET_MS + serverMode().extra; }
function extraSites() { var v = _settings && _settings.extraSites; return v === true || v === "true" || v === 1 || v === "1"; }
function servidoresPlus() {
    var v = _settings && _settings.servidoresPlus;
    return v === true || v === "true" || v === 1 || v === "1";
}
var ONLY_OKRU_DEFAULT = false;
function onlyOkru() {
    var v = _settings && _settings.soloOkru;
    if (v === undefined || v === null || v === "") return ONLY_OKRU_DEFAULT;
    return v === true || v === "true" || v === 1 || v === "1";
}
function debugMode() { var v = _settings && _settings.debugMode; return v === true || v === "true" || v === 1 || v === "1"; }

function clean(s) {
    if (s == null) return "";
    return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&#038;/g, "&").replace(/&#8217;/g, "'").replace(/\\u0026/g, "&").replace(/\\\//g, "/")
        .replace(/\s+/g, " ").trim();
}
function enc(s) { return encodeURIComponent(String(s == null ? "" : s)); }
function dec(s) { try { return decodeURIComponent(String(s || "")); } catch (e) { return String(s || ""); } }
function readBody(r) {
    if (!r) return "";
    if (typeof r.bodyAsString === "function") return r.bodyAsString();
    if (typeof r == "string") return r;
    if (r.body != null) return String(r.body);
    if (r.data != null && typeof r.data == "string") return r.data;
    return "";
}
function hostOf(url) { var m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i); return m ? m[1].toLowerCase() : ""; }
function originOf(url) { var m = String(url || "").match(/^(https?:\/\/[^\/?#]+)/i); return m ? m[1] : ""; }
function absUrl(u, base) {
    u = clean(u);
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    var o = originOf(base) || String(base || "");
    if (u.charAt(0) === "/") return o + u;
    return o + "/" + u;
}
function cleanUrl(u) {
    u = String(u == null ? "" : u).replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
    return u.replace(/^[\s"']+/, "").replace(/[\s"'),;\\]+$/g, "");
}
function strip(s) {
    return clean(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}
function uniq(a) {
    var out = [], seen = {}, i;
    for (i = 0; i < a.length; i++) { var k = String(a[i]); if (a[i] && !seen[k]) { seen[k] = 1; out.push(a[i]); } }
    return out;
}
function stripAccents(s) {
    s = String(s == null ? "" : s);
    try { s = s.normalize("NFD"); } catch (e) {
        var from = "Ã¡Ã Ã¤Ã¢Ã£Ã©Ã¨Ã«ÃªÃ­Ã¬Ã¯Ã®Ã³Ã²Ã¶Ã´ÃµÃºÃ¹Ã¼Ã»Ã±Ã§ÃÃ€Ã„Ã‚ÃƒÃ‰ÃˆÃ‹ÃŠÃÃŒÃÃŽÃ“Ã’Ã–Ã”Ã•ÃšÃ™ÃœÃ›Ã‘Ã‡", to = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC", i, r = "";
        for (i = 0; i < s.length; i++) { var p = from.indexOf(s.charAt(i)); r += p >= 0 ? to.charAt(p) : s.charAt(i); }
        return r;
    }
    return s.replace(/[\u0300-\u036f]/g, "");
}
function normalizeTitle(s) {
    return stripAccents(clean(s)).toLowerCase().replace(/&[^;\s]+;/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
var TITLE_NOISE = { "1080p": 1, "720p": 1, "480p": 1, "2160p": 1, "4k": 1, "uhd": 1, "hd": 1, "hdtv": 1,
    "latino": 1, "latam": 1, "castellano": 1, "espanol": 1, "doblado": 1, "doblaje": 1, "subtitulado": 1,
    "sub": 1, "subs": 1, "vose": 1, "vos": 1, "dual": 1, "audio": 1, "webdl": 1, "webrip": 1, "bluray": 1, "brrip": 1,
    "online": 1, "gratis": 1, "completa": 1, "pelicula": 1, "peliculas": 1, "serie": 1, "series": 1, "capitulo": 1, "temporada": 1,
    "m1080p": 1, "m720p": 1, "dl": 1, "dlatino": 1, "lat": 1, "esp": 1, "spa": 1, "spanish": 1, "english": 1,
    "ver": 1, "watch": 1, "movie": 1, "film": 1, "full": 1, "microhd": 1 };
function titleTokens(s) {
    var n = normalizeTitle(s), parts = n ? n.split(" ") : [], out = [], i;
    for (i = 0; i < parts.length; i++) if (parts[i].length > 1 && !TITLE_NOISE[parts[i]]) out.push(parts[i]);
    return out;
}
function tokenSimilarity(a, b) {
    var ta = titleTokens(a), tb = titleTokens(b), i, hit = 0, used = {};
    if (!ta.length || !tb.length) return 0;
    for (i = 0; i < ta.length; i++) { if (!used[ta[i]] && tb.indexOf(ta[i]) >= 0) { hit++; used[ta[i]] = 1; } }
    return Math.round((hit / Math.max(ta.length, tb.length)) * 100);
}
function titleCoverage(pageTitle, want) {
    var pt = titleTokens(pageTitle), wt = titleTokens(want), i, hit = 0;
    if (!wt.length) return 0;
    for (i = 0; i < wt.length; i++) if (pt.indexOf(wt[i]) >= 0) hit++;
    return Math.round((hit / wt.length) * 100);
}
function verifyPageTitle(html, ctx) {
    if (!html) return { ok: null, pageTitle: "" };
    var tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html) || /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = tm ? clean(strip(tm[1])) : "";
    if (!pageTitle) return { ok: null, pageTitle: "" };

    var cov = Math.max(titleCoverage(pageTitle, ctx.titleEs || ""), titleCoverage(pageTitle, ctx.titleEn || ""), titleCoverage(pageTitle, ctx.titleOrig || ""));
    var yr = (/\b((?:19|20)\d{2})\b/.exec(pageTitle) || [])[1] || "";

    if (!yr) {
        var metaYear = (/<meta[^>]+(?:name|property)=["'][^"']*(?:description|date|year)["'][^>]+content=["'][^"']*\b((?:19|20)\d{2})\b/i.exec(html) || [])[1] || "";
        if (metaYear) yr = metaYear;
    }

    var yearOk = !yr || !ctx.year || Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) <= 1;
    return { ok: cov >= 70 && yearOk, pageTitle: pageTitle, cov: cov, year: yr };
}
function slugJuanita(t) {
    return stripAccents(t).trim().replace(/[^a-zA-Z0-9]/g, " ").replace(/\s+/g, "-").replace(/-+/g, "-").toLowerCase();
}
function trimDash(s) { return String(s || "").replace(/^-+/, "").replace(/-+$/, ""); }
function slugCuevana(t) {
    return stripAccents(String(t || "").toLowerCase()).replace(/[\[\]^\/,'*:.!><~@#$%+=?|"\\()\u00bf\u00a1]+/g, "").trim().replace(/ +/g, "-").replace(/-+/g, "-");
}
function slugWords(u) {
    var p = String(u || "").split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() || "";
    return p.replace(/[-_]+/g, " ").replace(/\.html?$/i, "").replace(/\s+\d{4}$/, "");
}

function b64decode(s) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", out = "", i = 0, c1, c2, c3, c4, n;
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+\/=]/g, "");
    while (i < s.length) {
        c1 = chars.indexOf(s.charAt(i++)); c2 = chars.indexOf(s.charAt(i++)); c3 = chars.indexOf(s.charAt(i++)); c4 = chars.indexOf(s.charAt(i++));
        if (c1 < 0 || c2 < 0) break;
        n = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4);
        out += String.fromCharCode((n >> 16) & 255);
        if (c3 >= 0 && s.charAt(i - 2) != "=") out += String.fromCharCode((n >> 8) & 255);
        if (c4 >= 0 && s.charAt(i - 1) != "=") out += String.fromCharCode(n & 255);
    }
    return out;
}

function attrsOf(tag) {
    var out = {}, re = /([a-zA-Z0-9_:\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, m;
    while ((m = re.exec(String(tag || ""))) != null) out[m[1].toLowerCase()] = clean(m[2] != null ? m[2] : m[3]);
    return out;
}
function attr(tag, name) { return attrsOf(tag)[String(name).toLowerCase()] || ""; }
function findTags(html, test) {
    var out = [], re = /<[a-zA-Z][^>]*>/g, m, t;
    while ((m = re.exec(html || "")) != null) {
        t = m[0];
        if (test.test(t)) { out.push({ tag: t, index: m.index, end: re.lastIndex }); if (out.length >= 300) break; }
    }
    return out;
}
function hdr(referer, extra) {
    var h = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" }, k;
    if (referer) h["Referer"] = referer;
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
}
function markFail(h) {
    var e = _fail[h];
    if (!e || Date.now() - e.at > FAIL_EXPIRE_MS) e = { count: 0, at: 0 };
    e.count++; e.at = Date.now();
    _fail[h] = e;
}
function clearFail(h) {
    if (h) { delete _fail[h]; delete _okh[h]; }
}
function clearOkruFails() {
    var keys = ["ok.ru", "www.ok.ru", "m.ok.ru", "odnoklassniki.ru"], i;
    for (i = 0; i < keys.length; i++) clearFail(keys[i]);
}
function hostDead(h) {
    var e = _fail[h];
    if (!e || Date.now() - e.at > FAIL_EXPIRE_MS) return false;
    return e.count >= 2 && !_okh[h];
}

function prefetchUrls(urls, referer) {
    urls = uniq(urls || []);
    if (!urls.length || !budgetLeft()) return;
    var todo = [], i;
    for (i = 0; i < urls.length; i++) { var u = urls[i]; if (u && !_pre.hasOwnProperty(u) && !hostDead(hostOf(u))) todo.push(u); }
    if (!todo.length) return;
    try {
        if (typeof http.batch == "function") {
            var b = http.batch(), j;
            for (j = 0; j < todo.length; j++) b = b.GET(todo[j], hdr(referer || (originOf(todo[j]) + "/")), false);
            var res = b.execute();
            for (j = 0; j < todo.length; j++) {
                var body = readBody(res[j]);
                if (body) { _okh[hostOf(todo[j])] = 1; _pre[todo[j]] = body.length > MAX_HTML ? body.substring(0, MAX_HTML) : body; }
                else { _pre[todo[j]] = ""; markFail(hostOf(todo[j])); }
            }
            return;
        }
    } catch (e) { log("prefetch -> " + e); }
}

function httpGet(url, referer, extra) {
    var h = hostOf(url), r, b;
    if (!h) return "";
    if (_pre.hasOwnProperty(url)) { b = _pre[url]; delete _pre[url]; if (b) return b; }
    if (hostDead(h)) { log("SKIP host caido " + h); return ""; }
    if (!budgetLeft()) { log("SIN TIEMPO " + url.substring(0, 80)); return ""; }
    try {
        r = http.GET(url, hdr(referer || (originOf(url) + "/"), extra), false);
        b = readBody(r);
        if (r && r.code >= 500) { log("HTTP " + r.code + " " + url.substring(0, 90)); markFail(h); return ""; }
        if (r && (r.code == 403 || r.code == 429) && !b) { log("HTTP " + r.code + " " + url.substring(0, 90)); markFail(h); return ""; }
        if (r && r.code == 404) { log("404 " + url.substring(0, 90)); return ""; }
        if (b) { _okh[h] = 1; if (b.length > MAX_HTML) b = b.substring(0, MAX_HTML); return b; }
        markFail(h);
        return "";
    } catch (e) {
        log("GET " + url.substring(0, 90) + " -> " + e);
        markFail(h);
        return "";
    }
}
function httpGetAuth(url, referer) {
    if (!budgetLeft()) return "";
    try {
        var hh = hdr(referer || "https://ok.ru/", null);
        var r = http.GET(url, hh, true);
        var b = readBody(r);
        if (b) {
            if (b.length > MAX_HTML) b = b.substring(0, MAX_HTML);
            return b;
        }
    } catch (e) { log("GET-auth " + String(url).substring(0, 60) + " -> " + e); }
    return "";
}
function httpPost(url, body, referer, extra) {
    var h = hostOf(url), r, b;
    if (hostDead(h) || !budgetLeft()) return "";
    try {
        var hd = hdr(referer || (originOf(url) + "/"), extra);
        hd["Content-Type"] = (extra && extra["Content-Type"]) || "application/x-www-form-urlencoded; charset=UTF-8";
        r = http.POST(url, body, hd, false);
        b = readBody(r);
        if (b) _okh[h] = 1;
        return b || "";
    } catch (e) {
        log("POST " + url.substring(0, 90) + " -> " + e);
        return "";
    }
}
function batchGet(urls, referer) {
    var out = [], need = [], idx = [], i, k;
    for (i = 0; i < urls.length; i++) {
        if (_pre.hasOwnProperty(urls[i]) && _pre[urls[i]]) { out[i] = _pre[urls[i]]; delete _pre[urls[i]]; }
        else { out[i] = ""; need.push(urls[i]); idx.push(i); }
    }
    if (!need.length) return out;
    try {
        if (typeof http.batch == "function" && need.length > 1 && budgetLeft()) {
            var b = http.batch();
            for (k = 0; k < need.length; k++) b = b.GET(need[k], hdr(referer || (originOf(need[k]) + "/")), false);
            var res = b.execute();
            for (k = 0; k < need.length; k++) {
                var body = readBody(res[k]);
                if (body) _okh[hostOf(need[k])] = 1;
                out[idx[k]] = body && body.length > MAX_HTML ? body.substring(0, MAX_HTML) : body;
            }
            return out;
        }
    } catch (e) { log("batch -> " + e); }
    for (k = 0; k < need.length; k++) out[idx[k]] = httpGet(need[k], referer);
    return out;
}
function parseJson(t) { try { return JSON.parse(t); } catch (e) { return null; } }

function tmdbUrl(path, lang) {
    return TMDB_API + path + (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + enc(TMDB_KEY) + "&language=" + (lang || "es-AR");
}
function tmdbGet(path, lang) {
    var key = path + "|" + (lang || "es-AR");
    if (_tmdbCache.hasOwnProperty(key)) return _tmdbCache[key];
    try {
        var r = http.GET(tmdbUrl(path, lang), { "User-Agent": UA, "Accept": "application/json" }, false), b = readBody(r);
        var j = b ? JSON.parse(b) : null;
        if (j) _tmdbCache[key] = j;
        return j;
    } catch (e) { log("TMDB " + path + " -> " + e); return null; }
}
function tmdbGetBatch(reqs) {
    var i, k, out = [], need = [], idx = [], key;
    for (i = 0; i < reqs.length; i++) {
        key = reqs[i].path + "|" + (reqs[i].lang || "es-AR");
        if (_tmdbCache.hasOwnProperty(key)) out[i] = _tmdbCache[key];
        else { out[i] = null; need.push(reqs[i]); idx.push(i); }
    }
    if (!need.length) return out;
    try {
        if (typeof http.batch == "function" && need.length > 1) {
            var b = http.batch();
            for (k = 0; k < need.length; k++) b = b.GET(tmdbUrl(need[k].path, need[k].lang), { "User-Agent": UA, "Accept": "application/json" }, false);
            var res = b.execute();
            for (k = 0; k < need.length; k++) {
                var body = readBody(res[k]), d = body ? parseJson(body) : null;
                out[idx[k]] = d;
                if (d) _tmdbCache[need[k].path + "|" + (need[k].lang || "es-AR")] = d;
            }
            return out;
        }
    } catch (e) { log("TMDB batch -> " + e); }
    for (k = 0; k < need.length; k++) out[idx[k]] = tmdbGet(need[k].path, need[k].lang);
    return out;
}
function img(p, base) { return p ? (base || TMDB_IMG) + p : ""; }
function yearOf(s) { var m = /^(\d{4})/.exec(String(s || "")); return m ? m[1] : ""; }
function unixOf(s) { if (!s) return 0; var t = new Date(String(s)).getTime(); return isNaN(t) ? 0 : Math.floor(t / 1000); }

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
function parseAny(url) {
    var p = parseInternal(url);
    if (p) return { origin: "tmdb", p: p };
    if (typeof juanitaParseInternal == "function") {
        p = juanitaParseInternal(url);
        if (p) return { origin: "juanita", p: p };
    }
    if (typeof jkParseInternal == "function") {
        p = jkParseInternal(url);
        if (p) return { origin: "jk", p: p };
    }
    return null;
}

function reqMod(ref) {
    if (!ref) return null;
    var h = { "User-Agent": UA, "Referer": ref }, o = originOf(ref);
    if (o) h["Origin"] = o;
    return {
        headers: h,
        modifyRequest: function (url, headers) {
            headers = headers || {};
            var k;
            for (k in h) if (h.hasOwnProperty(k)) headers[k] = h[k];
            return { url: url, headers: headers };
        }
    };
}
function inferMediaType(u) {
    u = String(u || "");
    if (/\.mpd(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=(?:dash|mpd)/i.test(u) || /\/dash\//i.test(u)) return "dash";
    if (/\.m3u8(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=m3u8/i.test(u) || /\/hls\//i.test(u) || /playlist\.m3u8/i.test(u)) return "hls";
    if (/\.mp4(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=mp4/i.test(u)) return "mp4";
    return "";
}
function mkSrc(u, label, ref, force) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var type = force || inferMediaType(u);
    var o = { name: label || "Video", url: u, duration: 0 };
    var rm = reqMod(ref);
    if (rm) o.requestModifier = rm;
    if (type == "hls") {
        try { return new HLSSource(o); } catch (e) { log("mkSrc hls -> " + e); return null; }
    }
    if (type == "dash" && typeof DashSource == "function") {
        try { return new DashSource(o); } catch (e) { log("mkSrc dash -> " + e); return null; }
    }
    if (type == "mp4") {
        o.width = 0; o.height = 0; o.container = "video/mp4"; o.codec = ""; o.bitrate = 0;
        try { return new VideoUrlSource(o); } catch (e) { log("mkSrc mp4 -> " + e); return null; }
    }
    return null;
}
function okRequestModifier() {
    var h = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    };
    return {
        headers: h,
        modifyRequest: function (url, headers) {
            var newHeaders = {};
            for (var k in h) newHeaders[k] = h[k];
            return { url: url, headers: newHeaders };
        }
    };
}
function mkSrcBare(u, label, force) {
    u = cleanUrl(u);
    if (!/^https?:\/\//i.test(u)) return null;
    var type = force || inferMediaType(u);
    var opts = { name: label || "HLS", url: u, duration: 0 };
    opts.requestModifier = okRequestModifier();
    if (type == "hls") {
        try { return new HLSSource(opts); } catch (e) { log("mkSrcBare hls -> " + e); return null; }
    }
    if (type == "dash" && typeof DashSource == "function") {
        opts.name = label || "DASH";
        try { return new DashSource(opts); } catch (e) { log("mkSrcBare dash -> " + e); return null; }
    }
    if (type == "mp4" || !type) {
        opts.name = label || "MP4";
        opts.width = 0; opts.height = 0; opts.container = "video/mp4"; opts.codec = ""; opts.bitrate = 0;
        try { return new VideoUrlSource(opts); } catch (e) { log("mkSrcBare mp4 -> " + e); return null; }
    }
    return null;
}
function addSrc(arr, s) {
    if (!s || !s.url) return;
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i].url == s.url) return;
    arr.push(s);
}
function unpackOne(p, a, c, k) {
    function e(n) {
        return (n < a ? "" : e(parseInt(n / a, 10))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
    }
    var d = {}, i;
    for (i = 0; i < c; i++) d[e(i)] = (k[i] && k[i].length) ? k[i] : e(i);
    var keys = [], ki;
    for (ki in d) if (d.hasOwnProperty(ki)) keys.push(ki);
    keys.sort(function (x, y) { return y.length - x.length; });
    for (i = 0; i < keys.length; i++) {
        if (!keys[i]) continue;
        p = p.replace(new RegExp("\\b" + keys[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), d[keys[i]]);
    }
    return p;
}
function unpackAll(text) {
    var out = [], re = /eval\(function\(p,a,c,k,e,(?:d|r)\)[\s\S]*?\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g, m;
    while ((m = re.exec(String(text || ""))) != null) {
        try { out.push(unpackOne(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4].split("|"))); } catch (e) { log("unpack " + e); }
        if (out.length >= 6) break;
    }
    return out;
}
function normalizeMediaText(t) {
    return String(t || "")
        .replace(/\\u0026/gi, "&").replace(/\\u002F/gi, "/")
        .replace(/\\u003A/gi, ":").replace(/\\u003F/gi, "?")
        .replace(/\\u003D/gi, "=").replace(/\\u0023/gi, "#")
        .replace(/\\\//g, "/").replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}
function addMediaCandidate(out, u, label, ref, base) {
    u = cleanUrl(normalizeMediaText(u));
    if (!u) return;
    if (u.indexOf("//") === 0) u = "https:" + u;
    else if (u.charAt(0) == "/" && u.charAt(1) != "/" && base) u = base + u;
    if (!/^https?:\/\//i.test(u)) return;
    if (!/\.(?:m3u8|mp4|mpd)(?:[?#]|$)/i.test(u) && !/\b(?:m3u8|mp4|mpd)\b/i.test(u)) return;
    var s = mkSrc(u, label, ref);
    if (!s) {
        if (/\.m3u8(?:[?#]|$)/i.test(u) || /\bm3u8\b/i.test(u)) s = mkSrc(u, label || "HLS", ref, "hls");
        else if (/\.mp4(?:[?#]|$)/i.test(u)) s = mkSrc(u, label || "MP4", ref, "mp4");
    }
    if (s) addSrc(out, s);
}
function isDirectMediaUrl(u) {
    u = normalizeMediaText(cleanUrl(u));
    return /^https?:\/\//i.test(u) && !!inferMediaType(u);
}
function scanMedia(text, label, ref, pageUrl) {
    var out = [], texts = [normalizeMediaText(text)], i, m, re, base = originOf(pageUrl);
    var un = unpackAll(text);
    for (i = 0; i < un.length; i++) texts.push(normalizeMediaText(un[i]));
    for (i = 0; i < texts.length; i++) {
        var t = texts[i];
        re = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[0], label, ref, base);
        re = /(?:^|["'\s=(])((?:\/\/)[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?)/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        re = /["']?(?:file|src|source|hls\d*|url|link|stream|playlist|dash|hlsManifestUrl|hlsMasterPlaylistUrl)["']?\s*[:=]\s*["']([^"']+)["']/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        re = /(?:file|src|source|url|link|stream|playlist|hlsManifestUrl|hlsMasterPlaylistUrl)\s*[:=]\s*\\?["'](https?:[^\\"']+)/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
        re = /\{[^{}]{0,500}?(?:file|src|source|url|hls)\s*[:=]\s*["'](https?:[^"']+)["']/gi;
        while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
    }
    return out;
}
function extractPackedSources(html, pageUrl, label) {
    var out = [], base = originOf(pageUrl) + "/", texts, i, t, m, re, u;
    if (!html) return out;
    texts = [String(html)].concat(unpackAll(html));
    for (i = 0; i < texts.length; i++) {
        t = normalizeMediaText(texts[i]);
        var pats = [
            /(?:["']?hls\d*["']?|["']?file["']?)\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.m3u8[^"']*)["']/gi,
            /(?:url\s*:\s*|loadSource\(\s*)['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/gi,
            /(?:file|src)\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi,
            /["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi,
            /sources?\s*[:=]\s*\[\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi,
            /["']file["']\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            /["']hls\d*["']\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.m3u8[^"']*)["']/gi,
            /["']src["']\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            /file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
            /source\s*=\s*["']((?:https?:\/\/|\/)[^"']+\.m3u8[^"']*)["']/gi,
            /player\.src\(\s*["']([^"']+)["']/gi,
            /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi,
            /https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/gi
        ];
        var pi;
        for (pi = 0; pi < pats.length; pi++) {
            re = pats[pi];
            re.lastIndex = 0;
            while ((m = re.exec(t)) != null) {
                u = m[1] || m[0];
                if (!u || u.length < 8) continue;
                addMediaCandidate(out, absUrl(u, base), label, pageUrl, base);
                if (out.length >= 10) return out;
            }
        }
    }
    return out;
}
var SERVER_HOSTS = ["streamsb.net", "streamsss.net", "ssbstream.net", "watchsb.com", "sbanh.com", "sbfast.com", "sbfast.live", "sbplay.one", "sbplay.org", "sbplay1.com", "sbplay2.com", "sbplay2.xyz", "sbplay3.com", "sbfull.com", "sbbrisk.com", "sblongvu.com", "sbembed.com", "sbembed1.com", "playersb.com", "embedsb.com", "viewsb.com", "lvturbo.com",
    "dood.", "doodstream.", "dooood.", "dood.cx", "dood.la", "dood.pm", "dood.sh", "dood.so", "dood.to", "dood.watch", "dood.wf", "dood.ws", "dood.yt", "dood.li",
    "uqload.", "uqload.com", "uqload.co", "uqload.cx", "voe.sx", "streamtape.", "upstream.to", "streamlare.", "streamhub.to", "streamsss.net", "plusvip.net", "sololatino.net", "zplayer.live", "v2.zplayer.live", "fastream.to", "vidcloud9.org", "doc.vidcloud9.org", "cloudemb.com", "embedsito.net",
    "okru.link", "ok.ru", "moonplayer.", "moonplayer.lat", "playhide.online", "esplay.", "mycdn.moe", "acek-cdn.com", "dramiyos-cdn.com", "solo-latino.com", "owodeuwu.xyz", "suzihaza.com",
    "streamwish", "hlswish", "wishembed", "awish", "vidhide", "filelions", "filemoon", "mixdrop", "mxdrop", "supervideo", "xupalace", "nuuuppp", "playhubconnect", "saidochesto",
    "vimeos", "callistanise", "hgcloud.", "vimeo.com", "vk.com", "vkvideo.ru", "odnoklassniki", "streamhub", "embedwish", "dhcplay", "minochinos", "lulustream", "luluvdo", "vtube", "vidguard", "bigwarp", "player.cuevana3", "vimeus.", "goodstream.",
    "fortamomar.workers.dev", "seriesplayer.", "onfilom.com", "playspelis.com", "afterdark.best", "chillx.top", "closeload.top", "dokicloud.one", "dropload.io", "frembed.casa", "fsvid.lol", "gupload.xyz", "gxplayer.xyz", "hxfile.co", "lamovie.link", "loadx.ws", "magasavor.net", "maxstream.video", "moviesapi.club", "oneupload.net", "primesrc.me", "rabbitstream.net", "ridoo.net", "rpmvid.com", "savefiles.com", "sharecloudy.com", "streamix.so", "streamruby.com", "upzur.com", "upzone.to", "veev.to", "vidguard.to", "vidlink.pro", "vidara.to", "videasy.net", "vidflix.club", "vidnest.io", "vidora.stream", "vidplay.online", "vidrock.net", "vidsonic.net", "vidsrc.to", "vidxgo.co", "vidzee.wtf", "vidzy.org", "vixsrc.to", "vixcloud.co", "zilla-networks.com", "bigwarp.io", "goodstream.one", "vidoza.net", "vidmoly.to", "vidmoly.me", "swdyu.com", "strwish.com", "playerwish.com", "luluvdo.com", "supervideo.cc", "nupload.me", "closeload.com", "mixdrop.ag", "filemoon.sx", "filemoon.site", "321moviesfree.com", "flixlat.com",
    "hglink.to", "morencius.com", "futuretravelroute.space"];
var UNSUPPORTED = ["waaw.", "netu.", "hqq.", "younetu.", "hqtv.", "biribup.", "cuevana3.download", "1fichier."];

var DOMAINS = {
    poseidon: ["https://www.poseidonhd2.co", "https://poseidonhd2.co"],
    juanita: ["https://pelisjuanita.com"],
    pelisflix1: ["https://pelisflix1.tv", "https://pelisflix1.de", "https://pelisflix1.link", "https://pelisflix1.at", "https://pelisflix1.surf"],
    pelisflixhd: ["https://pelisflixhd.win"],
    cuevana_main: ["https://www.cuevana3.eu", "https://cuevana3.is", "https://cuevana3.cc", "https://cuevana19.com", "https://es.cuevana4br.com", "https://cuevana3.ai", "https://cuevana3.me", "https://cuevana3.so", "https://cuevana2.biz"],
    cuevana_alt: ["https://cuevana3e.pro"],
    pelisplusto: ["https://pelisplus.to", "https://www.pelisplus.to"],
    pelisplushd: ["https://pelisplushd.bz", "https://pelisplushd.nu", "https://pelisplus2.ai"],
    sololatino: ["https://sololatino.net"],
    cinecalidad: ["https://www.cinecalidad.ec", "https://cinecalidad.onl"],
    flixlatam: ["https://flixlatam.com"],
    esplay: ["https://api.esplay.one", "https://pelisplus.esplay.one", "https://static.esplay.one", "https://pelisplus.esplay.io", "https://pelisplus2.ai"],
    plpro: ["https://plpro.org"],
    gnula: ["https://gnula.uno"],
    lacartoons: ["https://www.lacartoons.com"],
    mirrors: ["https://playspelis.com", "https://peliculaplay.com", "https://solo-latino.com", "https://flixlat.com", "https://onfilom.com",
        "https://akm-cdn-play-web.onfilom.com", "https://r-limit.flixlat.com", "https://vod-limit-02.playspelis.com",
        "https://seriesplayer.fortamomar.workers.dev", "https://api.mycdn.moe", "https://acek-cdn.com"]
};
var WISH_HOSTS = [
    "streamwish.to", "streamwish.com", "streamwish.biz", "streamwish.cc", "streamwish.club", "streamwish.fun",
    "streamwish.info", "streamwish.live", "streamwish.me", "streamwish.net", "streamwish.org", "streamwish.site",
    "strwish.com", "strmwis.xyz", "swdyu.com", "swhoi.com", "swish.site", "swishsrv.com", "hlswish.com",
    "playerwish.com", "embedwish.com", "awish.pro", "awish.top", "dwish.pro", "dwish.top", "mwish.pro", "mwish.top",
    "flaswish.com", "sfastwish.com", "cdnwish.com", "jodwish.com", "obeywish.com", "wishembed.pro", "wishfast.top",
    "wishon.site", "wishonly.site", "vidwish.live", "vidwish.site", "asnwish.com", "juliewomanwish.com"
];
var VOE_HOSTS = [
    "charlestoughrace.com", "christopheruntilpoint.com", "crystaltreatmenteast.com", "dianaavoidthey.com",
    "jefferycontrolmodel.com", "jessicayeahcatch.com", "jilliandescribecompany.com", "johnbeyondnation.com",
    "juliewomanwish.com", "lancewhosedifficult.com", "lauradaydo.com", "mikaylaarealike.com",
    "rebeccapracticeloss.com", "richardquestionbuilding.com", "voe.sx", "walterprettytheir.com"
];
var MOON_HOSTS = [
    "bf0skv.org", "bysebuho.com", "bysejikuar.com", "bysekoze.com", "bysesayeveum.com", "bysezoxexe.com",
    "filemoon.site", "filemoon.sx", "moflix-stream.link"
];
var DOOD_HOSTS = [
    "d000d.com", "do7go.com", "dood.la", "dood.li", "doods.to", "dooood.com", "dsvplay.com", "myvidplay.com",
    "playmogo.com", "poophq.com"
];
var MIX_HOSTS = [
    "m1xdrop.net", "miiixdrop.net", "miixdrop.net", "mixdrop.ag", "mixdrop.bz", "mixdrop.ch", "mixdrop.club",
    "mixdrop.co", "mixdrop.cv", "mixdrop.to", "mxdrop.to"
];
var VIDHIDE_HOSTS = [
    "callistanise.com", "dhcplay.com", "dhtpre.com", "dingtezuni.com", "dintezuvio.com", "filelions.to",
    "minochinos.com", "moflix-stream.click", "morencius.com", "peytonepre.com", "vidhidefast.com", "vidhideplus.com",
    "vidhidepro.com"
];
var TAPE_HOSTS = [
    "streamta.site", "streamtape.com", "streamtape.net", "streamtape.to"
];
var UQLOAD_HOSTS = [
    "uqload.com", "uqload.cx", "uqload.is"
];
var FILE_HOSTS = [
    "bigwarp.cc", "bigwarp.io", "bigwarp.pro", "goodstream.one", "lamovie.link", "luluvdo.com", "luluvdoo.com",
    "luluvid.com", "moflix-stream.fans", "mp4upload.com", "rubystm.com", "rubyvid.com", "stmruby.com",
    "streamhub.to", "streamruby.com", "supervideo.cc", "upzone.cc", "upzone.link", "upzone.net", "upzone.to",
    "videzz.net", "vidmoly.me", "vidmoly.net", "vidmoly.org", "vidmoly.to", "vidoza.net", "vimeos.net", "vtbe.to",
    "vtube.to", "www.mp4upload.com", "www.yourupload.com", "www.yucache.net"
];

function hostIn(h, list) {
    var i, a;
    h = String(h || "").toLowerCase().replace(/^www\./, "");
    for (i = 0; i < list.length; i++) {
        a = list[i];
        if (h == a) return true;
        if (h.length > a.length && h.substring(h.length - a.length - 1) == "." + a) return true;
    }
    return false;
}
SERVER_HOSTS = SERVER_HOSTS.concat(WISH_HOSTS, VOE_HOSTS, MOON_HOSTS, DOOD_HOSTS, MIX_HOSTS, VIDHIDE_HOSTS, TAPE_HOSTS, UQLOAD_HOSTS, FILE_HOSTS);

function hostMatches(h, list) {
    var i;
    for (i = 0; i < list.length; i++) if (h.indexOf(list[i]) >= 0) return true;
    return false;
}
function isServerUrl(u) { return hostMatches(hostOf(u), SERVER_HOSTS); }
function isPackerFamily(h) {
    h = String(h || "");
    return hostIn(h, WISH_HOSTS) || hostIn(h, VIDHIDE_HOSTS) || hostIn(h, MOON_HOSTS) || h.indexOf("morencius") >= 0 || h.indexOf("hglink") >= 0 || h.indexOf("hgcloud") >= 0 ||
        h.indexOf("vidhide") >= 0 || h.indexOf("callistanise") >= 0 ||
        h.indexOf("filelions") >= 0 || h.indexOf("lulustream") >= 0 || h.indexOf("luluvdo") >= 0 ||
        h.indexOf("streamwish") >= 0 || h.indexOf("hlswish") >= 0 || h.indexOf("wishembed") >= 0 ||
        h.indexOf("awish") >= 0 || h.indexOf("embedwish") >= 0 || h.indexOf("filemoon") >= 0;
}
function unwrapEmbedUrl(url) {
    var u = cleanUrl(url), m, real;
    m = /[?&]v=([^&]+)/.exec(u);
    if (m) {
        real = cleanUrl(b64decode(dec(m[1])));
        if (/^https?:\/\//i.test(real) && real != u) return real;
    }
    return u;
}
function htmlUnescape(s) {
    return String(s || "").replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, function (c) { var b = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
}
function reverseStr(s) { return String(s).split("").reverse().join(""); }
function jsonAfter(text, marker) {
    var i = String(text || "").indexOf(marker), j, depth = 0, inStr = false, q = "", esc = false, start = -1, ch;
    if (i < 0) return null;
    for (j = i + marker.length; j < text.length && j < i + 400000; j++) {
        ch = text.charAt(j);
        if (start < 0) { if (ch == "{") { start = j; depth = 1; } continue; }
        if (inStr) { if (esc) esc = false; else if (ch == "\\") esc = true; else if (ch == q) inStr = false; continue; }
        if (ch == '"' || ch == "'") { inStr = true; q = ch; continue; }
        if (ch == "{") depth++;
        else if (ch == "}") { depth--; if (depth === 0) return parseJson(text.substring(start, j + 1)); }
    }
    return null;
}

var VOE_LUT = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
function voeDecodeWith(enc, lut) {
    var t = rot13(enc), i;
    for (i = 0; i < lut.length; i++) t = t.split(lut[i]).join("");
    var s = b64decode(t), u = "";
    for (i = 0; i < s.length; i++) u += String.fromCharCode(s.charCodeAt(i) - 3);
    return parseJson(b64decode(reverseStr(u)));
}
function srcsFromVoeJson(o, label, ref) {
    var out = [], k, v;
    if (!o) return out;
    for (k in o) {
        if (!o.hasOwnProperty(k)) continue;
        v = o[k];
        if (typeof v != "string" || !/^https?:\/\//i.test(v)) continue;
        if (/direct_access|mp4/i.test(k) || /\.mp4(?:[?#]|$)/i.test(v)) addSrc(out, mkSrc(v, label + " MP4", ref, "mp4"));
        else if (/^(?:source|hls|file|url|src)$/i.test(k)) addSrc(out, mkSrc(v, label, ref, "hls"));
    }
    return out;
}
function voeFromHtml(h, pageUrl, label) {
    var out = [], m = /json">\s*\[\s*"([^"]+)"\s*\]\s*<\/script>\s*(?:<script[^>]+src="([^"]+)")?/i.exec(h || ""), ref = originOf(pageUrl) + "/", luts = [], i;
    if (!m) {
        var re = /['"](hls|mp4)['"]\s*:\s*['"]([^'"]+)['"]/gi, mm;
        while ((mm = re.exec(h || "")) != null) {
            var v = mm[2];
            if (!/^https?:/i.test(v)) { var d = b64decode(v); if (/^https?:/i.test(d)) v = d; }
            addSrc(out, mkSrc(v, label, ref, mm[1].toLowerCase() == "mp4" ? "mp4" : "hls"));
        }
        if (!out.length) {
            out = scanMedia(h, label, ref, pageUrl);
        }
        return out;
    }
    if (m[2]) {
        var js = httpGet(absUrl(m[2], pageUrl), pageUrl), lm = /(\[(?:'\W{2}'[,\]]){1,9})/.exec(js || "");
        if (lm) { var arr = lm[1].slice(2, -2).split("','"); if (arr.length) luts.push(arr); }
    }
    luts.push(VOE_LUT);
    for (i = 0; i < luts.length; i++) {
        var o = null;
        try { o = voeDecodeWith(m[1], luts[i]); } catch (e) {}
        if (o) {
            out = srcsFromVoeJson(o, label, ref);
            if (out.length) return out;
        }
    }
    return out;
}
function exVidhide(url, label, ref) {
    var hosts = [], h0 = hostOf(url), path, i, u, html, out = [], base;
    path = String(url || "").replace(/^https?:\/\/[^\/]+/i, "");
    if (/\/v\//i.test(path) && !/\/e\//i.test(path)) path = path.replace(/\/v\//i, "/e/");
    hosts.push(h0);
    if (/vidhide|callistanise|filelions|morencius|hglink|dintez|dingte|peytone|moflix-stream/i.test(h0)) {
        var mirrors = ["callistanise.com", "filelions.to", "vidhideplus.com", "vidhidefast.com", "morencius.com", "hglink.to"];
        for (i = 0; i < mirrors.length; i++) if (mirrors[i] != h0) hosts.push(mirrors[i]);
    }
    for (i = 0; i < hosts.length && !out.length && budgetLeft(); i++) {
        u = "https://" + hosts[i] + path;
        base = "https://" + hosts[i] + "/";
        html = httpGet(u, ref || base);
        if (!html || html.length < 300) continue;
        out = extractPackedSources(html, u, label || "VidHide");
        if (!out.length) out = scanMedia(html, label || "VidHide", u, u);
        if (out.length) return out;
    }
    return out;
}
function exVoe(url, label, ref) {
    var h = httpGet(url, ref), tries = 0, m, cur = url;
    while (h && tries < 3) {
        var out = voeFromHtml(h, cur, label);
        if (out.length) return out;
        m = /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i.exec(h);
        if (!m || /^(?:#|javascript)/i.test(m[1])) break;
        cur = absUrl(m[1], cur);
        h = httpGet(cur, url);
        tries++;
    }
    return [];
}
function exUqload(url, label) {
    var u = String(url || ""); if (u.indexOf(".html") < 0) u += ".html";
    var h = httpGet(u, url), m = /sources\s*:\s*\[([^\]]+)\]/i.exec(h || ""), out = [], parts, i;
    if (!m) return out;
    parts = m[1].replace(/\\"/g, "").replace(/"/g, "").split(",");
    for (i = 0; i < parts.length; i++) addSrc(out, mkSrc(clean(parts[i]), label, "https://uqload.com/"));
    return out;
}
function exStreamTape(url, label) {
    var h = httpGet(url, url), m = /robotlink'\)\.innerHTML\s*=\s*'(.+?)'\s*\+\s*\('(.+?)'\)/i.exec(h || "");
    if (!m) return [];
    var s = mkSrc("https:" + m[1] + m[2].substring(3), label, "https://streamtape.com/");
    return s ? [s] : [];
}
function exDood(url, label) {
    var host = hostOf(url) || "dood.wf", id = (String(url).split("/e/")[1] || String(url).split("/d/")[1] || "").split(/[?#]/)[0];
    if (!id) return [];
    var base = "https://" + host, h = httpGet(base + "/e/" + id, base + "/"), m = /\/pass_md5\/[^'"]*/.exec(h || "");
    if (!m) return [];
    var body = httpGet(base + m[0], base + "/e/" + id);
    if (!body || body.length > 1000) return [];
    var tok = m[0].split("/").pop() || "", rnd = "", i, chs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (i = 0; i < 10; i++) rnd += chs.charAt(Math.floor(Math.random() * chs.length));
    var s = mkSrc(body + rnd + "?token=" + tok + "&expiry=" + Date.now() + "#.mp4", label, base + "/");
    if (!s) { s = mkSrc(body + rnd + "?token=" + tok + "&expiry=" + Date.now() + ".mp4", label, base + "/"); }
    return s ? [s] : [];
}
function exEsplay(url, label) {
    var id = String(url).split("#")[1] || (String(url).match(/[?&](?:id|v)=([A-Za-z0-9_-]+)/) || [])[1] || "";
    if (!id) { var pm = String(url).match(/\/(?:video|player)\/([A-Za-z0-9_-]+)/i); if (pm) id = pm[1]; }
    if (!id) return [];
    var bases = [
        "https://api.mycdn.moe/video/",
        "https://api.mycdn.moe/player/?id=",
        "https://pelisplus.esplay.one/video/",
        "https://pelisplus.esplay.io/video/"
    ], ref = "https://pelisplus.esplay.io/", i, b, d, s, media;
    for (i = 0; i < bases.length; i++) {
        if (!budgetLeft()) break;
        b = httpGet(bases[i] + id, ref);
        if (!b) continue;
        d = parseJson(b);
        if (d) {
            s = mkSrc(d.file || d.url || d.source || (d.data && (d.data.file || d.data.url)) || "", label, ref);
            if (s) return [s];
        }
        media = scanMedia(b, label, ref, ref);
        if (media.length) return media;
    }
    return [];
}
var OK_RANK = { "ultra": 7, "quad": 6, "full": 5, "hd": 4, "sd": 3, "low": 2, "lowest": 1, "mobile": 0 };
var OK_LABEL = { "ultra": "2160p", "quad": "1440p", "full": "1080p", "hd": "720p", "sd": "480p", "low": "360p", "lowest": "240p", "mobile": "144p" };
function okParseMeta(h) {
    if (!h) return null;
    var m = /data-options=(?:"([^"]*)"|'([^']*)')/i.exec(h), meta = null, o, fv;
    if (m) {
        o = parseJson(htmlUnescape(m[1] != null ? m[1] : m[2]));
        fv = o && o.flashvars;
        if (fv) {
            meta = fv.metadata;
            if (typeof meta == "string") meta = parseJson(htmlUnescape(meta));
            if (!meta && fv.metadataUrl) {
                var mu = String(fv.metadataUrl).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
                if (mu.indexOf("//") === 0) mu = "https:" + mu;
                meta = parseJson(httpGet(mu, "https://ok.ru/")) || parseJson(httpPost(mu, "", "https://ok.ru/"));
            }
        }
    }
    if (!meta) {
        var t = htmlUnescape(h)
            .replace(/\\u0026/gi, "&").replace(/\\u002F/gi, "/").replace(/\\u003A/gi, ":")
            .replace(/\\\//g, "/").replace(/\\"/g, '"');
        var mm = /"metadata"\s*:\s*"(\{[\s\S]*?\})"/.exec(t);
        if (mm) {
            try { meta = parseJson(mm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")); } catch (e1) { meta = null; }
        }
        if (!meta) {
            var hls = /"hlsManifestUrl"\s*:\s*"([^"]+)"/i.exec(t);
            var vids = [];
            var vr = /"name"\s*:\s*"(mobile|lowest|low|sd|hd|full|quad|ultra)"\s*,\s*"url"\s*:\s*"([^"]+)"/gi, vm;
            while ((vm = vr.exec(t)) != null) vids.push({ name: vm[1], url: vm[2].replace(/\\u0026/gi, "&").replace(/\\\//g, "/") });
            if (hls || vids.length) meta = { hlsManifestUrl: hls ? hls[1].replace(/\\u0026/gi, "&").replace(/\\\//g, "/") : "", videos: vids };
        }
    }
    return meta;
}
function exOkRu(url, label, ref) {
    var id = (String(url).match(/(?:videoembed|video|live)\/(\d+)/) || String(url).match(/[?&](?:id|mid)=(\d+)/) || [])[1];
    if (!id) return [];
    var R = "https://ok.ru/", out = [], h, meta;
    h = httpGet("https://ok.ru/videoembed/" + id, R);
    if (!h) h = httpGet("https://ok.ru/video/" + id, R);
    if (!h) return out;
    meta = okParseMeta(h);
    if (!meta) return out;
    out = okruSourcesFromMeta(meta, label || "OK.ru");
    return out;
}
function exVk(url, label, ref) {
    var u = cleanUrl(url), m = /video(-?\d+)_(\d+)/.exec(u);
    if (u.indexOf("video_ext.php") < 0 && m) u = "https://vk.com/video_ext.php?oid=" + m[1] + "&id=" + m[2] + ((/[?&]hash=([0-9a-f]+)/i.exec(u) || [])[0] || "").replace(/^\?/, "&");
    var R = hostOf(u).indexOf("vkvideo") >= 0 ? "https://vkvideo.ru/" : "https://vk.com/", h = httpGet(u, ref || R), out = [], list = [], re, k;
    if (!h) return out;
    re = /"url(\d{3,4})"\s*:\s*"([^"]+)"/g;
    while ((k = re.exec(h)) != null) list.push({ q: parseInt(k[1], 10), u: k[2] });
    list.sort(function (a, b) { return b.q - a.q; });
    var hl = /"(?:hls|hls_ondemand)"\s*:\s*"([^"]+)"/i.exec(h);
    if (hl) addSrc(out, mkSrc(hl[1], label + " HLS", R, "hls"));
    var i;
    for (i = 0; i < list.length; i++) addSrc(out, mkSrc(list[i].u, label + " " + list[i].q + "p", R, "mp4"));
    return out;
}
function vimeoSources(cfg, label) {
    var out = [], R = "https://player.vimeo.com/", files = cfg && cfg.request && cfg.request.files, i, k;
    if (!files) return out;
    if (files.hls) {
        var cdns = files.hls.cdns || {}, def = files.hls.default_cdn, c = cdns[def] || null;
        if (!c) for (k in cdns) if (cdns.hasOwnProperty(k)) { c = cdns[k]; break; }
        var hu = (c && (c.url || c.avc_url)) || files.hls.url || "";
        if (hu) addSrc(out, mkSrc(hu, label + " HLS", R, "hls"));
    }
    var pr = (files.progressive || []).slice(0);
    pr.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
    for (i = 0; i < pr.length; i++) if (pr[i].url) addSrc(out, mkSrc(pr[i].url, label + " " + (pr[i].quality || pr[i].height || "MP4"), R, "mp4"));
    return out;
}
function exVimeo(url, label, ref) {
    var id = (/(?:player\.vimeo\.com\/video|vimeo\.com)\/(?:video\/)?(\d+)/.exec(url) || [])[1];
    if (!id) return [];
    var hash = (/[?&]h=([0-9a-f]+)/i.exec(url) || /vimeo\.com\/\d+\/([0-9a-f]{8,})/i.exec(url) || [])[1] || "";
    var refs = uniq([ref || "", ref ? originOf(ref) + "/" : "", "https://player.vimeo.com/"]), i, out = [], q = hash ? "?h=" + hash : "";
    for (i = 0; i < refs.length && !out.length && budgetLeft(); i++) {
        var cfg = parseJson(httpGet("https://player.vimeo.com/video/" + id + "/config" + q, refs[i] || "https://player.vimeo.com/"));
        if (!cfg) {
            var page = httpGet("https://player.vimeo.com/video/" + id + q, refs[i] || "https://player.vimeo.com/");
            cfg = jsonAfter(page, "playerConfig = ") || jsonAfter(page, "playerConfig=") || jsonAfter(page, "var config = ");
        }
        out = vimeoSources(cfg, label);
    }
    return out;
}
function discoverLinks(html, pageUrl) {
    var out = [], m, re, u, base = originOf(pageUrl), i, tags;
    function add(x) {
        x = cleanUrl(x);
        if (!x) return;
        x = absUrl(x, pageUrl);
        if (!/^https?:\/\//i.test(x) || x == pageUrl) return;
        if (out.indexOf(x) < 0 && out.length < 12) out.push(x);
    }
    tags = findTags(html, /^<iframe\b/i);
    for (i = 0; i < tags.length; i++) { var a = attrsOf(tags[i].tag); add(a["data-src"] || a["src"] || ""); }
    re = /(?:location(?:\.href)?|window\.location(?:\.href)?)\s*=\s*["']([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /location\.replace\(\s*["']([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) add(m[1]);
    re = /data-(?:video|link|url|tr|server|embed-url)=["']([^"']+)["']/gi;
    while ((m = re.exec(html)) != null) {
        u = m[1];
        if (!/^https?:|^\//.test(u)) { var d = b64decode(u.split("?v=")[1] || u); if (/^https?:\/\//i.test(d)) u = d; }
        add(u);
    }
    re = /go_to_player\(['"]([^'"]+)/gi;
    while ((m = re.exec(html)) != null) add(m[1].indexOf("http") == 0 ? m[1] : "https://api.mycdn.moe/player/?id=" + m[1]);
    re = /https?:\/\/[^\s"'<>\\]+/gi;
    while ((m = re.exec(html)) != null) { if (isServerUrl(m[0]) && !/\.(?:js|css|png|jpe?g|gif|svg|ico|woff2?)(?:[?#]|$)/i.test(m[0])) add(m[0]); }
    return out;
}
function exGeneric(url, label, ref, depth) {
    var h = httpGet(url, ref || (originOf(url) + "/")), out, i, links;
    if (!h) return [];
    out = scanMedia(h, label, url, url);
    if (out.length) return out;
    out = voeFromHtml(h, url, label);
    if (out.length || depth >= 3) return out;
    links = discoverLinks(h, url);
    for (i = 0; i < links.length && budgetLeft() && out.length < 6; i++) {
        var more = resolveEmbed(links[i], label, url, depth + 1), j;
        for (j = 0; j < more.length; j++) addSrc(out, more[j]);
    }
    return out;
}
function encodePlayerUrl(url) {
    url = String(url || "").replace(/&amp;/g, "&");
    var m = /^(https?:\/\/[^?]+\?id=)(.+)$/i.exec(url);
    if (!m) return url;
    try {
        var id = decodeURIComponent(m[2]);
        return m[1] + encodeURIComponent(id).replace(/%2F/gi, "/").replace(/%20/g, "+");
    } catch (e) {
        return m[1] + encodeURIComponent(m[2]).replace(/%2F/gi, "/");
    }
}
function extractJuanitaDynamicHls(text, label, ref) {
    var out = [], t = normalizeMediaText(String(text || "")), variants = [t], i, m, u, re;
    variants.push(t.replace(/\\\//g, "/").replace(/\\u002F/gi, "/").replace(/\\u003A/gi, ":").replace(/\\u003F/gi, "?").replace(/\\u003D/gi, "="));
    for (i = 0; i < variants.length; i++) {
        t = variants[i];
        re = /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
        while ((m = re.exec(t)) != null) {
            u = cleanUrl(normalizeMediaText(m[0]));
            if (/^https?:\/\//i.test(u)) addMediaCandidate(out, u, label || "Juanita HLS", ref, originOf(ref));
        }
        if (out.length >= 8) break;
    }
    return out;
}
function exSeriesPlayer(url, label, ref) {
    var raw = String(url || "").replace(/&amp;/g, "&"), key = raw, out = [], tries = [], i, fetchUrl, html, n;
    if (!raw) return out;
    if (_spCache[key] && _spCache[key].length) {
        for (i = 0; i < _spCache[key].length; i++) addSrc(out, _spCache[key][i]);
        return out;
    }
    fetchUrl = encodePlayerUrl(raw);
    tries.push(fetchUrl);
    if (tries.indexOf(raw) < 0) tries.push(raw);
    var mfull = /^(https?:\/\/[^?]+\?id=)(.+)$/i.exec(raw);
    if (mfull) {
        try { var full = mfull[1] + encodeURIComponent(decodeURIComponent(mfull[2])); if (tries.indexOf(full) < 0) tries.push(full); } catch (e) {}
    }
    for (i = 0; i < tries.length && budgetLeft() && !out.length; i++) {
        fetchUrl = tries[i];
        html = httpGet(fetchUrl, ref || "https://pelisjuanita.com/");
        if (!html || /ID no v[\u00e1a]lido/i.test(html)) continue;
        out = extractJuanitaDynamicHls(html, (label || "Juanita") + " HLS", fetchUrl);
        if (!out.length) out = scanMedia(html, label || "Juanita", fetchUrl, fetchUrl);
    }
    if (out.length) {
        _spCache[key] = [];
        for (n = 0; n < out.length && n < 8; n++) _spCache[key].push(out[n]);
    }
    return out;
}
function extractProxyPlayerUrl(html) {
    var m, u, re, out = [], seen = {};
    if (!html) return out;
    re = /var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
    while ((m = re.exec(html)) != null) {
        u = cleanUrl(m[1]);
        if (u && !seen[u]) { seen[u] = 1; out.push(u); }
    }
    re = /https?:\/\/[a-z0-9._-]+\/(?:e|v|embed|d|f)\/[a-zA-Z0-9_-]+/gi;
    while ((m = re.exec(html)) != null) {
        u = cleanUrl(m[0]);
        if (u && !seen[u]) { seen[u] = 1; out.push(u); }
    }
    return out;
}
function isProxyPlayerHost(h) {
    h = String(h || "");
    return /player\.cuevana3/i.test(h) || /player\.poseidonhd2/i.test(h);
}
function exPoseidonPlayer(url, label, ref) {
    var html = httpGet(url, ref || (originOf(url) + "/")), out = [], links, i, j, more;
    if (!html) return out;
    links = extractProxyPlayerUrl(html);
    if (!links.length) links = discoverLinks(html, url);
    for (i = 0; i < links.length && budgetLeft() && out.length < 3; i++) {
        if (isProxyPlayerHost(hostOf(links[i]))) continue;
        more = resolveEmbed(links[i], label, url, 1);
        for (j = 0; j < more.length; j++) addSrc(out, more[j]);
        if (out.length) break;
    }
    if (!out.length) out = scanMedia(html, label, url, url);
    return out;
}
function exMixdrop(url, label, ref) {
    var u = String(url || "").replace(/\/f\//, "/e/").replace(/^(https?:\/\/[^\/]+\/e\/[^\/?#]+).*$/, "$1"), base = "https://" + hostOf(u) + "/", html, un, i, m = null, out = [], v;
    html = httpGet(u, ref || base);
    if (!html) return out;
    un = [html].concat(unpackAll(html));
    for (i = 0; i < un.length && !m; i++) m = /wurl\s*=\s*["']([^"']+)["']/.exec(un[i]);
    if (!m) return scanMedia(html, label, base, u);
    v = cleanUrl(m[1]);
    if (v.indexOf("//") == 0) v = "https:" + v;
    addSrc(out, mkSrc(v, label || "MixDrop", base, "mp4"));
    return out;
}
function exStreamWish(url, label, ref) {
    var id = "", m, hosts, i, u, html, out = [], path;
    m = /\/(?:e|v)\/([a-zA-Z0-9]+)/i.exec(url || "");
    if (m) id = m[1];
    if (!id) {
        html = httpGet(url, ref || originOf(url) + "/");
        return extractPackedSources(html, url, label || "StreamWish").concat(scanMedia(html || "", label || "StreamWish", url, url));
    }
    path = "/e/" + id;
    hosts = [
        "swdyu.com", hostOf(url), "streamwish.to", "strwish.com", "flaswish.com",
        "sfastwish.com", "mwhubseeker.com", "hlswish.com", "playerwish.com"
    ];
    var seen = {}, list = [];
    for (i = 0; i < hosts.length; i++) {
        if (!hosts[i] || seen[hosts[i]]) continue;
        seen[hosts[i]] = 1; list.push(hosts[i]);
    }
    for (i = 0; i < list.length && !out.length && budgetLeft(); i++) {
        u = "https://" + list[i] + path;
        html = httpGet(u, ref || "https://player.cuevana3.eu/");
        if (!html || html.length < 400) continue;
        out = extractPackedSources(html, u, label || "StreamWish");
        if (!out.length) out = scanMedia(html, label || "StreamWish", u, u);
        if (out.length) return out;
    }
    return out;
}
var SF_ALL_HOSTS = {
    wish: ["streamwish.to","streamwish.com","streamwish.biz","streamwish.cc","streamwish.club","streamwish.fun","streamwish.info","streamwish.live","streamwish.me","streamwish.net","streamwish.org","streamwish.site","strwish.com","strmwis.xyz","swdyu.com","swhoi.com","swish.site","swishsrv.com","hlswish.com","playerwish.com","embedwish.com","awish.pro","awish.top","dwish.pro","dwish.top","mwish.pro","mwish.top","flaswish.com","sfastwish.com","cdnwish.com","jodwish.com","obeywish.com","wishembed.pro","wishfast.top","wishon.site","wishonly.site","vidwish.live","vidwish.site","asnwish.com"],
    vidhide: ["callistanise.com","vidhideplus.com","vidhidefast.com","vidhidepre.com","filelions.to","filelions.com","morencius.com","hglink.to","hgcloud.net","dintezuvio.com","dingtezuni.com","peytonepre.com","moflix-stream.click","moflix-stream.xyz","moflix-stream.fans","moflix-stream.link","moflix.rpmplay.xyz","moflix.upns.xyz"],
    filemoon: ["filemoon.sx","filemoon.to","filemoon.online","filemoon.site","filemoon.in","filemoon.nl","moonmov.pro","bysejikuar.com","kerapoxy.cc"],
    voe: ["voe.sx","voe-unblock.com","voeun-block.net","voeunblock.com","voeunbl.com","un-block-voe.net","v-o-e-unblock.com"],
    dood: ["dood.la","dood.li","doods.to","doodstream.com","doodporn.xyz","ds2play.com","ds2video.com","dooood.com"],
    mixdrop: ["mixdrop.co","mixdrop.to","mixdrop.ch","mixdrop.ag","mixdrop.bz","mixdrop.club","mixdrop.cv","mdy48tn97.com","mdbekjwqa.pw"],
    streamtape: ["streamtape.com","streamtape.to","streamtape.net","streamta.pe","strtape.tech","strcloud.link"],
    uqload: ["uqload.com","uqload.co","uqload.io","uqload.to","uqload.cx","uqload.is","uqloads.xyz"],
    okru: ["ok.ru","www.ok.ru","odnoklassniki.ru","okru.link"],
    lulu: ["luluvdo.com","luluvdoo.com","luluvid.com","lulustream.com"],
    supervideo: ["supervideo.cc","supervideo.tv"],
    goodstream: ["goodstream.one","goodstream.se","goodstream.uno"],
    vidoza: ["vidoza.net","vidoza.org","vidoza.co"],
    mp4upload: ["mp4upload.com","mp4upload.org"],
    yourupload: ["yourupload.com","yucache.net"],
    vidmoly: ["vidmoly.to","vidmoly.me","vidmoly.net","vidmoly.org"],
    streamhub: ["streamhub.to","streamhub.gg","streamhub.ink"],
    vtube: ["vtube.to","vtube.network","vtbe.net","vtbe.to"],
    bigwarp: ["bigwarp.io","bigwarp.art","bigwarp.cc","bigwarp.pro","bgwp.cc"],
    nupload: ["nupload.me","nupload.top","nupupload.top","nuuuppp.com","ap.nupload.me"],
    streamsb: ["streamsb.net","streamsss.net","sbplay2.com","sbfull.com","lvturbo.com","sbchill.com"],
    dropload: ["dropload.io","dropload.tv","dropload.pro"],
    closeload: ["closeload.com","closeload.top","ridorapid.closeload.top"],
    gxplayer: ["gxplayer.com","watch.gxplayer.xyz","play.gxplayer.com"],
    vimeus: ["vimeus.com","vimeus.net","vimeus.to"],
    afterdark: ["afterdark.best","proxy.afterdark.baby"],
    chillx: ["chillx.top"],
    dailymotion: ["dailymotion.com","geo.dailymotion.com"],
    dokicloud: ["dokicloud.one"],
    frembed: ["frembed.casa"],
    fsvid: ["fsvid.lol"],
    gupload: ["gupload.xyz"],
    hxfile: ["hxfile.co"],
    lamovie: ["lamovie.link"],
    loadx: ["loadx.ws"],
    mstreamday: ["rpmstream.live"],
    magasavor: ["magasavor.net"],
    mailru: ["my.mail.ru","mail.ru"],
    maxstream: ["maxstream.video"],
    moviesapi: ["moviesapi.club"],
    myfilestorage: ["myfilestorage.xyz"],
    nekostream: ["nekostream"],
    oneupload: ["oneupload.net"],
    pdrain: ["pdrain"],
    pcloud: ["pcloud.link","pcloud.com"],
    pluspomla: ["pluspomla"],
    primesrc: ["primesrc.me"],
    rabbitstream: ["rabbitstream.net"],
    ridoo: ["ridoo.net"],
    rpmvid: ["rpmvid.com","cubeembed.rpmvid.com"],
    savefiles: ["savefiles.com"],
    sharecloudy: ["sharecloudy.com"],
    streamup: ["streamup"],
    streamix: ["streamix.so"],
    streamruby: ["streamruby.com"],
    twoembed: ["2embed","twoembed"],
    ustr: ["ustr"],
    upzur: ["upzur.com"],
    upzone: ["upzone.cc","upzone.link","upzone.net","upzone.to"],
    veev: ["veev.to"],
    vidguard: ["vidguard.to"],
    vidlink: ["vidlink.pro"],
    vidply: ["vidply.com"],
    vidara: ["vidara.so","vidara.to"],
    videasy: ["videasy.net","player.videasy.net"],
    vidflix: ["vidflix.club"],
    vidnest: ["vidnest.io"],
    vidora: ["vidora.stream"],
    vidplay: ["vidplay.online","vidplay.site","myvidplay.com"],
    vidrock: ["vidrock.net"],
    vidsonic: ["vidsonic.net"],
    vidsrc: ["vidsrc.to","vidsrc.ru","vidsrc-embed.ru","vidsrc.net"],
    vidxgo: ["vidxgo.co"],
    vidzee: ["vidzee.wtf","player.vidzee.wtf","core.vidzee.wtf"],
    vidzy: ["vidzy.org"],
    vixsrc: ["vixsrc.to"],
    vixcloud: ["vixcloud.co"],
    zilla: ["zilla-networks.com","player.zilla-networks.com"],
    jkplayer: ["jkdesu","jkanime"],
    amazon: ["drive.google.com","google.com/file"],
    googledrive: ["drive.google.com"]
};
function sfMatchFamily(h) {
    h = String(h || "").toLowerCase();
    var fam, i, list;
    for (fam in SF_ALL_HOSTS) {
        if (!SF_ALL_HOSTS.hasOwnProperty(fam)) continue;
        list = SF_ALL_HOSTS[fam];
        for (i = 0; i < list.length; i++) {
            if (h.indexOf(list[i].replace(/^www\./, "")) >= 0) return fam;
        }
    }
    return "";
}
function sfHostIn(h, list) {
    h = String(h || "").toLowerCase();
    var i;
    for (i = 0; i < list.length; i++) if (h.indexOf(String(list[i]).replace(/^www\./, "")) >= 0) return true;
    return false;
}
function resolveStreamflixExtractor(url, label, ref, depth) {
    var h = hostOf(url), fam = sfMatchFamily(h), lab = label || fam || h;
    if (!h) return null;
    if (fam == "wish" || /streamwish|swdyu|strwish|hlswish|playerwish|embedwish|awish|dwish|mwish|flaswish|sfastwish|wishembed|wishfast|vidwish/i.test(h))
        return typeof exStreamWish == "function" ? exStreamWish(url, lab || "StreamWish", ref) : null;
    if (fam == "vidhide" || /vidhide|callistanise|filelions|morencius|hglink|hgcloud|dintez|dingte|peytone|moflix-stream/i.test(h))
        return typeof exVidhide == "function" ? exVidhide(url, lab || "VidHide", ref) : null;
    if (fam == "mixdrop") return typeof exMixdrop == "function" ? exMixdrop(url, lab || "MixDrop", ref) : [];
    if (fam == "streamtape") return typeof exStreamTape == "function" ? exStreamTape(url, lab || "Streamtape") : [];
    if (fam == "uqload") return typeof exUqload == "function" ? exUqload(url, lab || "Uqload") : [];
    if (fam == "okru") return typeof exOkRu == "function" ? exOkRu(url, lab || "OK.ru", ref) : [];
    if (fam == "voe") return typeof exVoe == "function" ? exVoe(url, lab || "VOE", ref) : [];
    if (fam == "dood") return typeof exDood == "function" ? exDood(url, lab || "Dood") : [];
    return null;
}
function resolveEmbed(url, label, ref, depth) {
    depth = depth || 0;
    try {
        url = cleanUrl(url);
        if (!/^https?:\/\//i.test(url) || depth > 3 || !budgetLeft()) return [];
        var unwrapped = unwrapEmbedUrl(url);
        if (unwrapped != url) {
            return resolveEmbed(unwrapped, label, ref, depth + 1);
        }
        var h = hostOf(url), d;
        if (isDirectMediaUrl(url)) {
            var directType = inferMediaType(url);
            var direct = mkSrc(url, label || (directType == "hls" ? "HLS" : "Video"), ref, directType);
            if (direct) return [direct];
        }
        if (hostMatches(h, UNSUPPORTED)) return [];
        if (/fortamomar\.workers\.dev$/i.test(h) || /seriesplayer\./i.test(h) ||
            /onfilom\.com$/i.test(h) || /playspelis\.com$/i.test(h) || /321moviesfree\.com$/i.test(h) ||
            /flixlat\.com$/i.test(h)) {
            return exSeriesPlayer(url, label, ref);
        }
        if (isProxyPlayerHost(h) || /\/player\.php\?/i.test(url) || /player\.poseidonhd2\.co$/i.test(h) || /player\.cuevana3/i.test(h)) {
            return exPoseidonPlayer(url, label, ref);
        }
        d = mkSrc(url, label, ref);
        if (d) return [d];
        var sf = resolveStreamflixExtractor(url, label, ref, depth);
        if (sf && sf.length) return sf;
        if (h.indexOf("voe.") >= 0 || h.indexOf("voe.sx") >= 0 || hostIn(h, VOE_HOSTS)) return exVoe(url, label, ref);
        if (/(?:^|\.)(?:vk\.com|vkvideo\.ru|vk\.ru)$/.test(h)) return exVk(url, label, ref);
        if (h.indexOf("vimeo.com") >= 0) return exVimeo(url, label, ref);
        if (h.indexOf("uqload.") >= 0 || hostIn(h, UQLOAD_HOSTS)) return exUqload(url, label);
        if (h.indexOf("streamtape.") >= 0 || /(?:^|\.)tape\./.test(h) || hostIn(h, TAPE_HOSTS)) return exStreamTape(url, label);
        if (h.indexOf("dood") >= 0 || /d[o]{3,}d/.test(h) || hostIn(h, DOOD_HOSTS)) return exDood(url, label);
        if (h.indexOf("esplay.") >= 0) return exEsplay(url, label);
        if (h == "ok.ru" || h.indexOf(".ok.ru") >= 0 || h.indexOf("odnoklassniki") >= 0) return exOkRu(url, label, ref);
        return exGeneric(url, label, ref, depth);
    } catch (e) {
        return [];
    }
}
function langOf(t) {
    t = normalizeTitle(t);
    if (/\bsub|subtitul|vose|vos\b/.test(t)) return "Subtitulado";
    if (/castell|espana|\besp\b|\bcast\b/.test(t)) return "Castellano";
    if (/latin|\blat\b|\bmx\b|mexic|argent/.test(t)) return "Latino";
    if (/ingles|english|\ben\b|\beng\b/.test(t)) return "Ingles";
    return "";
}
function langRank(l) { return l == "Latino" ? 0 : (l == "Subtitulado" ? 1 : (l == "Castellano" ? 2 : 3)); }
function prettyHost(u) {
    var h = hostOf(u).replace(/^www\./, "").split(".");
    return h.length > 1 ? h[h.length - 2] : (h[0] || "server");
}
var BAD_PATH = /\/(?:genero|genre|generos|category|categoria|categorias|tag|tags|page|pagina|wp-|author|search|buscar|year|release|network|cast|director|actor|estrenos|top|login|register|contacto|dmca|feed|xfsearch|country|pais|idioma|lang)(?:\/|$)/i;
var RE_TV = /\/(?:serie|series|tv|tvshows?|ver-serie|show|shows|anime|animes)\//i;
var RE_MOVIE = /\/(?:pelicula|peliculas|movie|movies|ver-pelicula|film|films|pelis|ver)\//i;
function findLinks(html, base, kind) {
    var out = [], byUrl = {}, re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi, m, host = hostOf(base);
    while ((m = re.exec(html || "")) != null) {
        var a = attrsOf(m[0].substring(0, m[0].indexOf(">") + 1)), href = a["href"];
        if (!href || href.charAt(0) == "#" || /^(?:javascript|mailto):/i.test(href)) continue;
        var u = absUrl(href.split("#")[0], base);
        if (hostOf(u) != host && hostOf(u).replace(/^www\./, "") != host.replace(/^www\./, "")) continue;
        var path = u.replace(/^https?:\/\/[^\/]+/, "");
        if (path.length < 3 || BAD_PATH.test(path)) continue;
        var type = RE_TV.test(path) ? "tv" : (RE_MOVIE.test(path) ? "movie" : "unknown");
        var inner = m[1], alt = (/<img\b[^>]*\balt=["']([^"']+)/i.exec(inner) || [])[1] || "";
        if (type == "unknown" && !alt && !a["title"] && inner.indexOf("<img") < 0) continue;
        var title = a["title"] || alt || strip(inner);
        if (title.length > 140) title = "";
        var tail = html.substring(m.index + m[0].length, m.index + m[0].length + 500);
        var yr = (/>\s*((?:19|20)\d\d)\s*</.exec(tail) || /\b((?:19|20)\d\d)\b/.exec(strip(inner)) || [])[1] || "";
        var c = byUrl[u];
        if (!c) { c = { url: u, titles: [], type: type, year: yr }; byUrl[u] = c; out.push(c); }
        if (title) c.titles.push(clean(title));
        if (yr && !c.year) c.year = yr;
        if (out.length >= 80) break;
    }
    for (var i = 0; i < out.length; i++) out[i].titles.push(slugWords(out[i].url));
    return out;
}
function scoreLink(c, ctx) {
    var want = ctx.titles, best = 0, i, j;
    for (i = 0; i < c.titles.length; i++) {
        var t = normalizeTitle(c.titles[i]);
        if (!t) continue;
        for (j = 0; j < want.length; j++) {
            var w = want[j], s = 0;
            if (t == w) s = 100;
            else if (t.indexOf(w) >= 0 || w.indexOf(t) >= 0) {
                var r = Math.min(t.length, w.length) / Math.max(t.length, w.length);
                s = r >= 0.85 ? 60 + r * 30 : 0;
            }
            if (!s) {
                var ts = tokenSimilarity(c.titles[i], want[j]);
                if (ts >= 80) s = 55 + (ts - 80);
            }
            if (s > best) best = s;
        }
    }
    if (!best) return 0;
    if (c.type != "unknown" && c.type != ctx.kind) best -= 40;
    if (c.year && ctx.year) {
        var d = Math.abs(parseInt(c.year, 10) - parseInt(ctx.year, 10));
        if (d === 0) best += 12;
        else if (d === 1) best += 4;
        else return 0;
    } else if (ctx.year && c.url.indexOf(ctx.year) >= 0) best += 8;
    return best;
}
function pickBest(links, ctx) {
    var best = null, sc = 0, i;
    for (i = 0; i < links.length; i++) { var s = scoreLink(links[i], ctx); if (s > sc) { sc = s; best = links[i]; } }
    if (best && sc >= 75) return best;
    return null;
}
function mkCand(url, lang, ref, prov) { return { url: url, lang: lang || "", ref: ref || "", prov: prov || "" }; }
function resolveCands(cands, out, prov, need) {
    var seen = {}, list = [], i, c;
    for (i = 0; i < cands.length; i++) {
        c = cands[i];
        var k = c.srcs ? "srcs" + i : c.url;
        if (!k || seen[k]) continue;
        seen[k] = 1; list.push(c);
    }
    var n = 0, good = 0;
    for (i = 0; i < list.length && n < MAX_CAND && budgetLeft() && (!need || good < need); i++) {
        c = list[i];
        var label = (c.lang ? c.lang + " Â· " : "") + prov + " Â· " + (c.url ? prettyHost(c.url) : "directo"), got = [], j;
        if (c.srcs) {
            for (j = 0; j < c.srcs.length; j++) got.push(c.srcs[j]);
        } else {
            got = resolveEmbed(c.url, label, c.ref || (originOf(c.url) + "/"), 0);
        }
        n++;
        var before = out.length;
        for (j = 0; j < got.length; j++) { addSrc(out, got[j]); }
        if (out.length > before) good++;
    }
    return good;
}
var _poseidonBuildId = "";
var _poseidonBuildAt = 0;
var POSEIDON_BASE = "https://www.poseidonhd2.co";
var POSEIDON_BUILD_TTL = 6 * 60 * 60 * 1000;
function poseidonBuildId() {
    if (_poseidonBuildId && (Date.now() - _poseidonBuildAt) < POSEIDON_BUILD_TTL) return _poseidonBuildId;
    var html = httpGet(POSEIDON_BASE + "/", POSEIDON_BASE + "/");
    var m = /"buildId"\s*:\s*"([^"]+)"/.exec(html || "");
    if (m && m[1]) {
        _poseidonBuildId = m[1];
        _poseidonBuildAt = Date.now();
    }
    return _poseidonBuildId || "Q-i_R7Z4xGx1ZLVEa6Zzs";
}
function poseidonLangLabel(key) {
    key = String(key || "").toLowerCase();
    if (key === "latino") return "Latino";
    if (key === "spanish" || key === "castellano") return "Castellano";
    if (key === "english" || key === "ingles") return "Ingles";
    return key ? (key.charAt(0).toUpperCase() + key.slice(1)) : "";
}
function cyberlockerRank(n) {
    n = String(n || "").toLowerCase();
    if (/vimeus|goodstream/.test(n)) return 0;
    if (/voe|vimeos/.test(n)) return 1;
    if (/streamtape|uqload/.test(n)) return 2;
    if (/filemoon|moon|bysejikuar/.test(n)) return 3;
    if (/streamwish|wishembed|hlswish|swdyu/.test(n)) return 4;
    if (/vidhide|callistanise|filelions|morencius|hglink/.test(n)) return 6;
    return 5;
}
function poseidonExtractVideos(block, ref) {
    var out = [], langs = ["latino", "spanish", "english"], i, j, list, v, lang, tmp = [];
    if (!block) return out;
    var videos = block.videos || {};
    for (i = 0; i < langs.length; i++) {
        list = videos[langs[i]] || [];
        lang = poseidonLangLabel(langs[i]);
        for (j = 0; j < list.length; j++) {
            v = list[j];
            if (!v || !v.result) continue;
            tmp.push({ cand: mkCand(v.result, lang, ref, "PoseidonHD"), rank: cyberlockerRank(v.cyberlocker || v.result) });
        }
    }
    tmp.sort(function (a, b) { return a.rank - b.rank; });
    for (i = 0; i < tmp.length; i++) out.push(tmp[i].cand);
    return out;
}
function poseidonUrl(ctx, bid) {
    var slug = "x", s = ctx.season || 1, e = ctx.episode || 1;
    if (ctx.kind == "movie") {
        return POSEIDON_BASE + "/_next/data/" + bid + "/es/pelicula/" + ctx.id + "/" + slug +
            ".json?tmdb=" + enc(ctx.id) + "&movie=" + slug;
    }
    return POSEIDON_BASE + "/_next/data/" + bid + "/es/serie/" + ctx.id + "/" + slug +
        "/temporada/" + s + "/episodio/" + e +
        ".json?tmdb=" + enc(ctx.id) + "&serie=" + slug + "&season=" + s + "&episode=" + e;
}
function poseidonByTmdb(ctx) {
    if (!ctx || !ctx.id) return [];
    var bid = poseidonBuildId();
    if (!bid) return [];
    var body = httpGet(poseidonUrl(ctx, bid), POSEIDON_BASE + "/"), data = parseJson(body), block, out = [];
    if (!data || !data.pageProps) return [];
    if (ctx.kind == "movie") {
        block = data.pageProps.thisMovie || null;
        if (!block) return [];
        return poseidonExtractVideos(block, POSEIDON_BASE + "/");
    }
    block = data.pageProps.episode || null;
    if (!block) return [];
    return poseidonExtractVideos(block, POSEIDON_BASE + "/");
}
function provPoseidon(ctx) { return poseidonByTmdb(ctx); }
function poseidonPrefetchUrls(ctx) { return [poseidonUrl(ctx, poseidonBuildId())]; }

function parseJuanita(html, base) {
    var out = [], tags = findTags(html, /row-download/i), i, m, re, seen = {};
    function addU(u, lang) {
        u = cleanUrl(absUrl(u, base));
        if (!u || !/^https?:\/\//i.test(u) || seen[u]) return;
        seen[u] = 1;
        out.push(mkCand(u, lang || "", base + "/", "Juanita"));
    }
    for (i = 0; i < tags.length; i++) {
        var a = attrsOf(tags[i].tag);
        var tipo = (a["data-tipo"] || "").toLowerCase();
        if (tipo == "torrent" || tipo == "magnet") continue;
        var u = a["data-url"];
        if (!u) continue;
        if (!/^https?:|^\/\//i.test(u)) { var d = b64decode(u); if (/^https?:\/\//i.test(d)) u = d; }
        var lang = langOf(a["data-idioma"] || "");
        addU(u, lang);
    }
    re = /https?:\/\/(?:seriesplayer\.)?fortamomar\.workers\.dev\/\?id=[^\s"'<>]*/gi;
    while ((m = re.exec(html || "")) != null) addU(m[0].replace(/&amp;/g, "&"), "Latino");
    return out;
}
function juanitaSlugCandidates(ctx) {
    var raw = uniq([ctx.titleEn, ctx.titleEs, ctx.titleOrig].concat(ctx.altTitles || [])), out = [], i, s;
    for (i = 0; i < raw.length; i++) {
        s = trimDash(slugJuanita(raw[i]));
        if (!s) continue;
        if (ctx.year) out.push(s + "-" + ctx.year);
        out.push(s);
    }
    return uniq(out).slice(0, 4);
}
function provJuanita(ctx) {
    var base = "https://pelisjuanita.com", slugs = juanitaSlugCandidates(ctx), urls = [], i;
    for (i = 0; i < slugs.length; i++) {
        urls.push(ctx.kind == "movie" ? base + "/movies/movieInfo.php?title=" + slugs[i]
            : base + "/series/serieInfo.php?nombreSerie=" + slugs[i] + "&nroTemporada=" + ctx.season + "&nroEpisodio=" + ctx.episode);
    }
    var bodies = batchGet(urls, base + "/");
    for (i = 0; i < slugs.length; i++) {
        var items = parseJuanita(bodies[i], base);
        if (items.length) return items;
    }
    return [];
}
function juanitaPrefetchUrls(ctx) {
    var s = juanitaSlugCandidates(ctx)[0];
    return s ? ["https://pelisjuanita.com/movies/movieInfo.php?title=" + enc(s)] : [];
}

function parseCuevana(html, base) {
    var out = [], tags = findTags(html, /data-tr=|data-link=|data-server=/i), i;
    var pbase = base.indexOf("cuevana3.eu") >= 0 ? "https://player.cuevana3.eu" : base;
    for (i = 0; i < tags.length; i++) {
        var a = attrsOf(tags[i].tag), v = a["data-tr"] || a["data-link"] || a["data-server"] || "";
        if (!v) continue;
        if (!/^https?:|^\/|^player\.php/i.test(v)) { var d = b64decode(v.split("?v=")[1] || v); if (/^https?:\/\//i.test(d)) v = d; else continue; }
        out.push(mkCand(absUrl(v, pbase), "Latino", base + "/", "Cuevana3"));
    }
    return out;
}
var CUEVANA_FAMILIES = [
    {
        bases: DOMAINS.cuevana_main,
        movie: function (base, slug) { return base + "/ver-pelicula/" + slug; },
        episode: function (base, slug, s, e) { return base + "/episodio/" + slug + "-temporada-" + s + "-episodio-" + e; }
    }
];
function provCuevana(ctx) {
    var fam = CUEVANA_FAMILIES[0], bi, base, slugs = uniq([slugCuevana(ctx.titleEs), slugCuevana(ctx.titleEn)]), i;
    for (bi = 0; bi < fam.bases.length && budgetLeft(); bi++) {
        base = fam.bases[bi];
        for (i = 0; i < slugs.length; i++) {
            var u = ctx.kind == "movie" ? fam.movie(base, slugs[i]) : fam.episode(base, slugs[i], ctx.season, ctx.episode);
            var h = httpGet(u, base + "/");
            if (h) {
                var it = parseCuevana(h, base);
                if (it.length) return it;
            }
        }
    }
    return [];
}
function cuevanaPrefetchUrls(ctx) { return []; }
var PROVIDERS = [
    { id: "poseidon", name: "PoseidonHD", fast: 1, early: 1, cap: 12000, prefetch: poseidonPrefetchUrls, candidates: provPoseidon },
    { id: "juanita", name: "PelisJuanita", fast: 1, early: 1, cap: 12000, prefetch: juanitaPrefetchUrls, candidates: provJuanita },
    { id: "cuevana", name: "Cuevana3", fast: 1, early: 1, cap: 12000, prefetch: cuevanaPrefetchUrls, candidates: provCuevana },
    { id: "okrudirect", name: "OK.ru", fast: 1, early: 1, plus: 1, cap: 18000, prefetch: function () { return []; }, candidates: function() { return []; } }
];

function sortSourcesByLang(out) {
    var idx = [], j, sorted = [];
    for (j = 0; j < out.length; j++) {
        idx.push({ s: out[j], i: j, r: langRank(String(out[j].name || "").split(" Â· ")[0]) });
    }
    idx.sort(function (a, b) {
        if (a.r != b.r) return a.r - b.r;
        return a.i - b.i;
    });
    for (j = 0; j < idx.length; j++) sorted.push(idx[j].s);
    return sorted;
}

function capResults(out, n) {
    var res = [], seen = {}, i, k;
    for (i = 0; i < out.length && res.length < n; i++) {
        k = String(out[i].name || "");
        if (!seen[k]) { seen[k] = 1; res.push(out[i]); }
    }
    return res;
}

function collectSources(ctx) {
    var out = [], i, servers = 0, want = wantServers(), maxRes = maxResults();
    for (i = 0; i < PROVIDERS.length && budgetLeft(); i++) {
        var p = PROVIDERS[i];
        if (servers >= want) break;
        try {
            var cands = p.candidates(ctx) || [];
            servers += resolveCands(cands, out, p.name, want - servers);
        } catch (e) {}
    }
    return capResults(sortSourcesByLang(out), maxRes);
}

function thumb(u) { return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]); }
function tmdbAuthor() { return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0); }
function showAuthor(id, name, poster) {
    return new PlatformAuthorLink(new PlatformID(PLATFORM, "show_" + id, PID), name || "Serie", makeShowUrl(id), poster || "", 0);
}
function catalogVideo(x) {
    var isTv = x.kind == "tv", yr = yearOf(x.date);
    var name = (x.title || "Sin tÃ­tulo") + (yr ? " (" + yr + ")" : "") + (isTv ? " Â· Serie" : "");
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
function episodeVideo(showId, showName, poster, s, e) {
    var sn = s, num = e.episode_number;
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, "tv_" + showId + "_" + sn + "_" + num, PID),
        name: "S" + sn + "E" + num + " Â· " + (e.name || ("Episodio " + num)),
        thumbnails: thumb(e.still_path ? img(e.still_path, TMDB_STILL) : poster),
        author: showAuthor(showId, showName, poster),
        uploadDate: unixOf(e.air_date),
        viewCount: 0,
        duration: (e.runtime || 0) * 60,
        isLive: false,
        url: makeTvUrl(showId, sn, num)
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

function homePage(page) {
    var d = tmdbGet("/trending/all/week?page=" + page);
    var res = d && d.results ? d.results : [];
    return {
        results: res.map(function(x) {
            return catalogVideo({ id: x.id, kind: x.media_type == "tv" ? "tv" : "movie", title: x.title || x.name, poster: img(x.poster_path), date: x.release_date || x.first_air_date });
        }),
        hasMore: !!(d && d.total_pages && page < Math.min(d.total_pages, 10))
    };
}
function searchPage(q, page) {
    var d = tmdbGet("/search/multi?query=" + enc(q) + "&page=" + page + "&include_adult=false");
    var raw = d && d.results ? d.results : [];
    return {
        results: raw.filter(function(x) { return x.media_type == "movie" || x.media_type == "tv"; }).map(function(x) {
            return catalogVideo({ id: x.id, kind: x.media_type, title: x.title || x.name, poster: img(x.poster_path), date: x.release_date || x.first_air_date });
        }),
        hasMore: !!(d && d.total_pages && page < Math.min(d.total_pages, 10))
    };
}

function details(url) {
    var p = parseInternal(url);
    if (!p) return null;
    startBudget();
    var isTv = p.kind == "tv", path = (isTv ? "/tv/" : "/movie/") + p.id;
    var base = tmdbGet(path, "es-MX") || tmdbGet(path, "es-AR") || tmdbGet(path, "en-US");
    if (!base) return null;

    var ctx = {
        kind: p.kind,
        id: p.id,
        season: p.season || 1,
        episode: p.episode || 1,
        titleEs: base.title || base.name || "",
        titleEn: base.original_title || base.original_name || "",
        year: yearOf(base.release_date || base.first_air_date)
    };

    var sources = collectSources(ctx);
    var title = ctx.titleEs || ctx.titleEn || "Video";
    var name = isTv ? (title + " Â· S" + ctx.season + "E" + ctx.episode) : (title + (ctx.year ? " (" + ctx.year + ")" : ""));

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, isTv ? ("tv_" + p.id + "_" + ctx.season + "_" + ctx.episode) : ("movie_" + p.id), PID),
        name: name,
        thumbnails: thumb(img(base.poster_path)),
        author: isTv ? showAuthor(p.id, title, img(base.poster_path)) : tmdbAuthor(),
        uploadDate: 0,
        duration: (base.runtime || 0) * 60,
        viewCount: 0,
        isLive: false,
        url: url,
        description: (base.overview || "") + "\n\nFuentes encontradas: " + sources.length,
        video: new VideoSourceDescriptor(sources)
    });
}

function channelOf(url) {
    var p = parseInternal(url);
    if (!p || p.kind != "show") return null;
    var d = tmdbGet("/tv/" + p.id, "es-AR");
    if (!d) return null;
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "show_" + p.id, PID),
        name: d.name || "Serie",
        thumbnail: img(d.poster_path),
        banner: img(d.backdrop_path, TMDB_BACK),
        subscribers: 0,
        description: (d.overview || "") + "\nTemporadas: " + (d.number_of_seasons || 1),
        url: url,
        urlAlternatives: [url],
        links: {}
    });
}
function channelContents(url) {
    var p = parseInternal(url);
    if (!p || p.kind != "show") return new VideoPager([], false, {});
    var d = tmdbGet("/tv/" + p.id + "/season/1", "es-AR");
    var eps = (d && d.episodes) || [];
    var out = eps.map(function(e) {
        return episodeVideo(p.id, "Serie", "", 1, e);
    });
    return makePager(out, false, function() { return { results: [], hasMore: false }; });
}

var FEED_MIXED = "MIXED";
var ORDER_CHRONO = "CHRONOLOGICAL";

if (typeof source != "undefined") {
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
    source.isChannelUrl = function (u) { var p = parseInternal(u); return !!(p && p.kind == "show"); };
    source.getChannel = function (u) { return channelOf(u); };
    source.getChannelCapabilities = function () { return { types: [FEED_MIXED], sorts: [ORDER_CHRONO], filters: [] }; };
    source.getChannelContents = function (u) { return channelContents(u); };
    source.isContentDetailsUrl = function (u) { var p = parseInternal(u); return !!(p && (p.kind == "movie" || p.kind == "tv")); };
    source.getContentDetails = function (u) { return details(u); };
    source.getContentRecommendations = function (u) { return new VideoPager([], false, {}); };
}
