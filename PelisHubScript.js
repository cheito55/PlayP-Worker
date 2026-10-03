/*
 * PelisHub - GrayJay source (cliente del Worker https://pelishub.cheito55.workers.dev)
 *
 * Endpoints del worker usados:
 *   /api/home?page=N
 *   /api/search?q=texto
 *   /api/movie/:tmdbId
 *   /api/show/:tmdbId              (ficha + temporadas/episodios)
 *   /api/tv/:tmdbId/:season/:episode
 */

var API = "https://pelishub.cheito55.workers.dev";
var PLATFORM = "PelisHub";
var CONFIG = null;
var SETTINGS = {};

/* ---------------------------------------------------------------- utils */

function dbg(msg) {
    if (SETTINGS && (SETTINGS.debugMode === true || SETTINGS.debugMode === "true")) {
        try { log("[PelisHub] " + msg); } catch (e) {}
    }
}

function fail(msg) {
    if (typeof ScriptException !== "undefined") throw new ScriptException(msg);
    throw new Error(msg);
}

function enc(s) { return encodeURIComponent(String(s == null ? "" : s)); }

function str(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    try { return String(v); } catch (e) { return ""; }
}

function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : (d == null ? 0 : d);
}

function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

function first(obj, keys, fallback) {
    if (!obj || typeof obj !== "object") return fallback;
    for (var i = 0; i < keys.length; i++) {
        var v = obj[keys[i]];
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return fallback;
}

function getJson(path) {
    var url = path.indexOf("http") === 0 ? path : API + path;
    dbg("GET " + url);
    var r = http.GET(url, { "Accept": "application/json" }, false);
    if (!r || !r.isOk) fail("PelisHub: HTTP " + (r ? r.code : "sin respuesta") + " en " + url);
    if (!r.body) fail("PelisHub: respuesta vacia en " + url);
    var data;
    try { data = JSON.parse(r.body); }
    catch (e) { fail("PelisHub: la respuesta no es JSON (" + url + ")"); }
    if (isObj(data) && data.error && !data.results && !data.items) {
        fail("PelisHub: " + str(data.error));
    }
    return data;
}

function detailQuery() {
    var q = "?mode=" + ((SETTINGS && SETTINGS.mode) || "fast");
    var plusOff = SETTINGS && (SETTINGS.servidoresPlus === false || SETTINGS.servidoresPlus === "false");
    q += plusOff ? "&plus=0" : "&plus=1";
    if (SETTINGS && (SETTINGS.useProxy === true || SETTINGS.useProxy === "true")) q += "&proxy=1";
    if (SETTINGS && (SETTINGS.debugMode === true || SETTINGS.debugMode === "true")) q += "&debug=1";
    return q;
}

/* --------------------------------------------------- lectura de items */

// Lista de items (home / search). Solo claves "de lista", nunca "sources".
function listOf(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    var keys = ["results", "items", "data", "movies", "shows", "series", "contents", "entries"];
    for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (Array.isArray(v)) return v;
        if (isObj(v)) {
            var nested = listOf(v);
            if (nested.length) return nested;
        }
    }
    return [];
}

// Objeto principal de un detalle (movie / show / episodio).
function pickObj(data) {
    if (Array.isArray(data)) return data.length ? pickObj(data[0]) : {};
    if (!isObj(data)) return {};
    var keys = ["movie", "show", "episode", "item", "result", "data"];
    for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (isObj(v) && (titleOf(v) || idOf(v))) return v;
    }
    return data;
}

function titleOf(x) {
    if (!isObj(x)) return "";
    return str(first(x, ["title", "name", "original_title", "originalName", "original_name", "displayName", "label"], ""));
}

function idOf(x) {
    if (!isObj(x)) return "";
    var v = first(x, ["tmdbId", "tmdb_id", "id", "movieId", "showId", "videoId", "slug"], "");
    if (isObj(v)) v = first(v, ["id", "value", "tmdbId"], "");
    return str(v);
}

function typeOf(x) {
    var t = str(first(x, ["type", "mediaType", "media_type", "kind", "contentType"], "")).toLowerCase();
    if (t.indexOf("tv") >= 0 || t.indexOf("serie") >= 0 || t.indexOf("show") >= 0) return "tv";
    return "movie";
}

function imageOf(x) {
    if (!isObj(x)) return "";
    var v = first(x, ["poster", "posterUrl", "poster_url", "poster_path", "thumbnail", "thumbnailUrl",
        "image", "imageUrl", "cover", "still", "backdrop", "backdrop_path", "still_path"], "");
    if (isObj(v)) v = first(v, ["url", "src", "path"], "");
    v = str(v);
    if (v.indexOf("//") === 0) return "https:" + v;
    if (v.charAt(0) === "/") return "https://image.tmdb.org/t/p/w500" + v; // poster_path de TMDB
    return v;
}

function descriptionOf(x) {
    if (!isObj(x)) return "";
    return str(first(x, ["overview", "description", "synopsis", "plot", "summary"], ""));
}

function durationSec(x) {
    var d = num(first(x, ["duration", "durationSeconds"], -1), -1);
    if (d > 0) return Math.round(d); // el worker entrega segundos
    var r = num(first(x, ["runtime"], -1), -1);
    return r > 0 ? Math.round(r * 60) : -1; // runtime = minutos
}

function makeThumbs(url) {
    return new Thumbnails(url ? [new Thumbnail(url, 720)] : []);
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function showAuthor(id, name, img) {
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, "show:" + id, CONFIG.id),
        name || "Serie",
        API + "/api/show/" + enc(id),
        img || ""
    );
}

function genericAuthor(img) {
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, "pelishub", CONFIG.id),
        "PelisHub",
        API,
        img || ""
    );
}

function makeVideo(item) {
    var title = titleOf(item) || "PelisHub";
    var id = idOf(item);
    if (!id) return null;
    var kind = typeOf(item);
    var img = imageOf(item);

    // Solo se acepta una URL que apunte a nuestra propia API (las URLs de webs externas rompian isContentDetailsUrl).
    var url = str(first(item, ["url", "detailUrl"], ""));
    if (url.indexOf(API + "/api/") !== 0) url = "";
    if (!url) url = kind === "tv" ? API + "/api/tv/" + enc(id) + "/1/1" : API + "/api/movie/" + enc(id);

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, kind + ":" + id, CONFIG.id),
        name: title,
        thumbnails: makeThumbs(img),
        author: kind === "tv" ? showAuthor(id, title, img) : genericAuthor(img),
        uploadDate: 0,
        duration: durationSec(item),
        viewCount: num(first(item, ["viewCount", "views"], -1), -1),
        url: url,
        isLive: false
    });
}

// Un solo item por tipo+id (NO por titulo: "Pinocho" 1940/2019/2022 son distintos).
function toVideos(items) {
    var out = [], seen = {};
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!isObj(it)) continue;
        var key = typeOf(it) + ":" + idOf(it);
        if (seen[key]) continue;
        seen[key] = true;
        try {
            var v = makeVideo(it);
            if (v) out.push(v);
        } catch (e) { dbg("item descartado: " + e); }
    }
    return out;
}

/* ------------------------------------------------ fuentes reproducibles */

var MEDIA_RE = /\.(m3u8|mp4|m4v|webm|mov|mkv)(\?|#|$)/i;
var SKIP_KEYS = { debug: 1, trace: 1, log: 1, logs: 1, errors: 1, error: 1, timings: 1 };

function innerUrl(u) {
    if (u.indexOf("/proxy") >= 0) {
        var m = u.match(/[?&]u=([^&]+)/);
        if (m) { try { return decodeURIComponent(m[1]); } catch (e) {} }
    }
    return u;
}

function looksMedia(u) {
    var inner = innerUrl(u);
    return MEDIA_RE.test(inner) || inner.toLowerCase().indexOf(".m3u8") >= 0 || u.indexOf(API + "/proxy") === 0;
}

function hostOf(u) {
    var m = String(u).match(/^https?:\/\/([^\/?#]+)/i);
    return m ? m[1].replace(/^www\./, "") : "Servidor";
}

function walk(node, ctx, out, depth) {
    if (node == null || depth > 8) return;
    if (typeof node === "string") {
        if (/^https?:\/\//i.test(node) && looksMedia(node)) {
            out.push({ url: node, name: ctx.name, quality: ctx.quality, lang: ctx.lang, headers: ctx.headers });
        }
        return;
    }
    if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i], ctx, out, depth + 1);
        return;
    }
    if (typeof node !== "object") return;

    if (typeof node.url === "string" && /^https?:\/\//i.test(node.url) && typeof node.type === "string" && /^(hls|mp4|dash|webm|m3u8|mkv)$/i.test(node.type)) {
        var useP = SETTINGS && (SETTINGS.useProxy === true || SETTINGS.useProxy === "true") && typeof node.proxyUrl === "string" && node.proxyUrl;
        out.push({
            url: useP ? node.proxyUrl : node.url,
            name: str(first(node, ["name", "server", "label"], ctx.name)),
            quality: "",
            lang: "",
            type: node.type.toLowerCase(),
            container: str(node.container),
            headers: useP ? null : (isObj(node.headers) ? node.headers : ctx.headers)
        });
        return;
    }

    var c2 = {
        name: str(first(node, ["server", "serverName", "provider", "host", "label", "name"], ctx.name)),
        quality: str(first(node, ["quality", "resolution", "res"], ctx.quality)),
        lang: str(first(node, ["lang", "language", "idioma", "audio"], ctx.lang)),
        headers: isObj(node.headers) ? node.headers : (isObj(node.header) ? node.header : ctx.headers)
    };
    for (var k in node) {
        if (!node.hasOwnProperty(k) || SKIP_KEYS[k]) continue;
        walk(node[k], c2, out, depth + 1);
    }
}

function buildSource(s, duration) {
    var label = s.name || hostOf(innerUrl(s.url));
    if (s.quality) label += " " + s.quality;
    if (s.lang) label += " [" + s.lang + "]";

    var inner = innerUrl(s.url).toLowerCase();
    var isHls = s.type === "hls" || s.type === "m3u8" || inner.indexOf(".m3u8") >= 0;
    var mod = (s.headers && Object.keys(s.headers).length) ? { headers: s.headers } : null;

    if (isHls) {
        var h = { name: label, url: s.url, duration: duration > 0 ? duration : 0, priority: false };
        if (mod) h.requestModifier = mod;
        return new HLSSource(h);
    }

    var hm = String(s.quality).match(/(\d{3,4})p/);
    var d = {
        name: label,
        url: s.url,
        width: 0,
        height: hm ? Number(hm[1]) : 0,
        container: s.container || (inner.indexOf(".webm") >= 0 ? "video/webm" : "video/mp4"),
        codec: "",
        bitrate: 0,
        duration: duration > 0 ? duration : 0
    };
    if (mod) d.requestModifier = mod;
    return new VideoUrlSource(d);
}

function buildSources(data, duration) {
    var raw = [];
    walk(data, { name: "", quality: "", lang: "", headers: null }, raw, 0);

    var out = [], seen = {};
    for (var i = 0; i < raw.length; i++) {
        var key = innerUrl(raw[i].url);
        if (seen[key]) continue;
        seen[key] = true;
        try { out.push(buildSource(raw[i], duration)); } catch (e) { dbg("fuente descartada: " + e); }
    }
    dbg("fuentes reproducibles: " + out.length);
    return out;
}


/* ------------------------------------------- OK.ru con la sesion de GrayJay */
/* Flujo: GET /api/okru/plan -> buscar en ok.ru con useAuth (cookies de GrayJay) -> POST /hits ->
   bajar los embeds -> POST /sources (si devuelve "pending", se baja la metadata desde aqui, porque los links
   de OK.ru van atados a la IP que pidio la metadata) -> POST /sources otra vez. */

var OK_HEADERS = { "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8", "Referer": "https://ok.ru/" };

function okOn() {
    return !(SETTINGS && (SETTINGS.okruConLogin === false || SETTINGS.okruConLogin === "false"));
}

function postJson(path, obj) {
    var url = API + path;
    dbg("POST " + url);
    var r = http.POST(url, JSON.stringify(obj), { "Content-Type": "application/json", "Accept": "application/json" }, false);
    if (!r || !r.isOk) fail("PelisHub: HTTP " + (r ? r.code : "sin respuesta") + " en " + url);
    try { return JSON.parse(r.body); } catch (e) { fail("PelisHub: la respuesta no es JSON (" + url + ")"); }
}

// Descarga varias URLs de ok.ru con la sesion de GrayJay (en paralelo si http.batch existe).
function okGetMany(urls) {
    var out = [], i;
    try {
        var b = http.batch();
        for (i = 0; i < urls.length; i++) b.GET(urls[i], OK_HEADERS, true);
        var rs = b.execute();
        for (i = 0; i < urls.length; i++) out.push(rs[i] && rs[i].isOk ? str(rs[i].body) : "");
        return out;
    } catch (e) {
        dbg("batch no disponible, voy de a una: " + e);
    }
    out = [];
    for (i = 0; i < urls.length; i++) {
        try {
            var r = http.GET(urls[i], OK_HEADERS, true);
            out.push(r && r.isOk ? str(r.body) : "");
        } catch (e2) { out.push(""); }
    }
    return out;
}

function okMetaText(url) {
    try {
        var r = http.GET(url, OK_HEADERS, true);
        if (r && r.isOk && r.body && str(r.body).charAt(0) === "{") return str(r.body);
    } catch (e) {}
    try {
        var r2 = http.POST(url, "", OK_HEADERS, true);
        if (r2 && r2.isOk && r2.body) return str(r2.body);
    } catch (e2) {}
    return "";
}

// Solo lo util de la pagina de busqueda (los links /video/ID, la lista de videos y ids sueltos).
function okFragments(html) {
    html = str(html);
    var out = [], m, re;
    re = /<a\b[^>]*href\s*=\s*["'](?:https?:\/\/[^"']+)?\/(?:video|videoembed)\/\d+[^>]*>[\s\S]*?<\/a>/gi;
    while ((m = re.exec(html)) != null && out.length < 80) out.push(m[0].substring(0, 800));
    var vs = /<video-search-results[^>]*\svideos=(?:"[^"]+"|'[^']+')[^>]*>/i.exec(html);
    if (vs) out.push(vs[0]);
    re = /(?:data-movie-id|data-video-id|data-content-id|st\.mvId|movieId|videoId|video_id|movie_id)\s*["':=]+\s*["']?\d{6,}["']?/gi;
    while ((m = re.exec(html)) != null && out.length < 160) out.push(m[0]);
    re = /(?:https?:\/\/)?(?:www\.|m\.)?ok\.ru\/(?:video|videoembed)\/\d{6,}/gi;
    while ((m = re.exec(html)) != null && out.length < 220) out.push(m[0]);
    return out.join("\n");
}

// Del embed solo se manda el data-options (trae la metadata del reproductor) y el <title>.
function okEmbedFragment(html) {
    html = str(html);
    var m = /data-options=(?:"[^"]*"|'[^']*')/i.exec(html);
    var t = /<title[^>]*>[^<]*<\/title>/i.exec(html);
    return (m ? m[0] : html.substring(0, 300000)) + (t ? "\n" + t[0] : "");
}

function okruSources(kind, id, season, episode) {
    var qs = "?kind=" + kind + "&id=" + enc(id) + "&s=" + season + "&e=" + episode;
    var plan = getJson("/api/okru/plan" + qs);
    var queries = (plan && plan.queries ? plan.queries : []).slice(0, 6);
    if (!queries.length) return [];
    var searchTpl = str(plan.searchUrl) || "https://ok.ru/dk?st.cmd=searchResult&st.mode=Movie&st.grmode=Groups&st.query={q}";
    var embedTpl = str(plan.embedUrl) || "https://ok.ru/videoembed/{id}";

    var urls = [], i;
    for (i = 0; i < queries.length; i++) urls.push(searchTpl.replace("{q}", enc(queries[i])));
    var pages = okGetMany(urls).map(okFragments).filter(function (x) { return !!x; });
    dbg("OK.ru: " + pages.length + "/" + urls.length + " busquedas con resultados");
    if (!pages.length) return [];

    var hits = (postJson("/api/okru/hits" + qs, { pages: pages }).hits || []).slice(0, 6);
    dbg("OK.ru: " + hits.length + " candidatos");
    if (!hits.length) return [];

    var embUrls = [];
    for (i = 0; i < hits.length; i++) embUrls.push(embedTpl.replace("{id}", hits[i].id));
    var htmls = okGetMany(embUrls), pgs = [];
    for (i = 0; i < hits.length; i++) {
        if (htmls[i]) pgs.push({ id: hits[i].id, name: hits[i].name || "", html: okEmbedFragment(htmls[i]) });
    }
    if (!pgs.length) return [];

    var res = postJson("/api/okru/sources" + qs, { pages: pgs });
    if (res && res.pending && res.pending.length) {
        var byId = {};
        for (i = 0; i < res.pending.length; i++) {
            var txt = okMetaText(res.pending[i].url);
            if (txt) byId[res.pending[i].id] = txt;
        }
        for (i = 0; i < pgs.length; i++) if (byId[pgs[i].id]) pgs[i].meta = byId[pgs[i].id];
        res = postJson("/api/okru/sources" + qs, { pages: pgs });
    }
    dbg("OK.ru: " + ((res && res.sources) ? res.sources.length : 0) + " fuentes");
    return (res && res.sources) ? res.sources : [];
}

/* -------------------------------------------------------------- series */

function episodesOf(show) {
    var out = [];
    function add(s, e, obj) {
        out.push({ s: s, e: e, name: obj ? titleOf(obj) : "", img: obj ? imageOf(obj) : "" });
    }
    function fromSeason(sn, eps, count) {
        if (Array.isArray(eps)) {
            for (var j = 0; j < eps.length; j++) {
                var ep = eps[j];
                var en = isObj(ep) ? num(first(ep, ["episode_number", "episodeNumber", "episode", "number", "n"], j + 1), j + 1) : num(ep, j + 1);
                add(sn, en, isObj(ep) ? ep : null);
            }
        } else {
            for (var c = 1; c <= count; c++) add(sn, c, null);
        }
    }

    var seasons = first(show, ["seasons", "temporadas"], null);
    if (Array.isArray(seasons)) {
        for (var i = 0; i < seasons.length; i++) {
            var se = seasons[i];
            if (!isObj(se)) continue;
            var sn = num(first(se, ["season_number", "seasonNumber", "season", "number", "n"], i + 1), i + 1);
            fromSeason(sn, first(se, ["episodes", "episodios"], null), num(first(se, ["episode_count", "episodeCount", "count"], 0), 0));
        }
    } else if (isObj(seasons)) { // { "1": [ep, ep], "2": [...] }
        for (var key in seasons) {
            if (!seasons.hasOwnProperty(key)) continue;
            fromSeason(num(key, 1), seasons[key], num(seasons[key], 0));
        }
    }

    if (!out.length) { // lista plana de episodios con season/episode
        var flat = first(show, ["episodes", "episodios"], null);
        if (Array.isArray(flat)) {
            for (var f = 0; f < flat.length; f++) {
                var ef = flat[f];
                if (!isObj(ef)) continue;
                add(num(first(ef, ["season_number", "season", "temporada"], 1), 1),
                    num(first(ef, ["episode_number", "episode", "number", "n"], f + 1), f + 1), ef);
            }
        }
    }

    if (!out.length) add(1, 1, null); // sin datos: al menos S01E01

    // Temporada 0 (especiales) solo si no hay otra cosa
    var real = out.filter(function (x) { return x.s > 0; });
    if (real.length) out = real;
    out.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
    return out;
}

/* --------------------------------------------------------------- source */

source.enable = function (conf, settings, savedState) {
    CONFIG = conf;
    SETTINGS = settings || {};
};

source.getHome = function (continuationToken) {
    var page = continuationToken ? Number(continuationToken) : 1;
    if (!page || page < 1) page = 1;
    var items = listOf(getJson("/api/home?page=" + page));
    var videos = toVideos(items);
    return new PelisHubHomePager(videos, videos.length > 0 && page < 10, page + 1);
};

source.searchSuggestions = function (query) { return []; };

source.getSearchCapabilities = function () {
    return { types: [Type.Feed.Mixed], sorts: [], filters: [] };
};

source.search = function (query, type, order, filters, continuationToken) {
    query = str(query).trim();
    if (!query) return new PelisHubSearchPager([], false, {});
    // Sin filtrar por parecido de titulo: el worker ya busca en TMDB y el titulo puede venir en otro idioma.
    var items = listOf(getJson("/api/search?q=" + enc(query)));
    return new PelisHubSearchPager(toVideos(items), false, {});
};

source.isContentDetailsUrl = function (url) {
    return /^https:\/\/pelishub\.cheito55\.workers\.dev\/api\/(movie|show|tv)\//i.test(str(url));
};

source.getContentDetails = function (url) {
    var m = str(url).match(/\/api\/(movie|show|tv)\/([^\/?#]+)(?:\/(\d+)\/(\d+))?/i);
    if (!m) fail("PelisHub: URL de detalle no soportada");

    var endpoint = m[1].toLowerCase();
    var id = decodeURIComponent(m[2]);
    var season = m[3] ? Number(m[3]) : 1;
    var episode = m[4] ? Number(m[4]) : 1;

    var apiPath, kind, canonicalUrl;
    if (endpoint === "movie") {
        kind = "movie";
        apiPath = "/api/movie/" + enc(id);
        canonicalUrl = API + apiPath;
    } else { // "show" o "tv": una serie siempre se reproduce como episodio (por defecto S01E01)
        kind = "tv";
        apiPath = "/api/tv/" + enc(id) + "/" + season + "/" + episode;
        canonicalUrl = API + apiPath;
    }

    var data = getJson(apiPath + detailQuery());
    var obj = pickObj(data);
    var title = titleOf(obj) || id;
    var img = imageOf(obj);
    var duration = durationSec(obj);

    var sources = buildSources(data, duration);

    // OK.ru con la sesion de GrayJay (va primero). Si falla no rompe el resto.
    if (okOn()) {
        try {
            var okRaw = okruSources(kind, id, season, episode);
            if (okRaw.length) sources = buildSources(okRaw, duration).concat(sources);
        } catch (eOk) { dbg("OK.ru fallo: " + eOk); }
    }

    if (!sources.length) {
        var keys = isObj(data) ? Object.keys(data).join(",") : typeof data;
        var tail = "";
        if (isObj(data) && Array.isArray(data.debug)) tail = " | " + data.debug.slice(-6).join(" / ");
        fail("PelisHub: sin fuentes reproducibles para '" + title + "'" +
            (kind === "tv" ? " S" + pad2(season) + "E" + pad2(episode) : "") + tail);
    }

    var name = title, author;
    if (kind === "tv") {
        name = title; // ya viene como "Serie · S1E1 · episodio"
        author = showAuthor(id, title.split(" \u00b7 ")[0], str(first(obj, ["poster"], "")));
    } else {
        author = genericAuthor(img);
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, kind === "tv" ? "tv:" + id + ":" + season + ":" + episode : "movie:" + id, CONFIG.id),
        name: name,
        thumbnails: makeThumbs(img),
        author: author,
        uploadDate: 0,
        duration: duration,
        viewCount: -1,
        url: canonicalUrl,
        isLive: false,
        description: descriptionOf(obj),
        video: new VideoSourceDescriptor(sources),
        live: null,
        rating: null,
        subtitles: []
    });
};

/* ------------------------------------- canal = serie (lista de episodios) */

source.isChannelUrl = function (url) {
    return /^https:\/\/pelishub\.cheito55\.workers\.dev\/api\/show\//i.test(str(url));
};

function showIdFromUrl(url) {
    var m = str(url).match(/\/api\/show\/([^\/?#]+)/i);
    if (!m) fail("PelisHub: URL de serie no valida");
    return decodeURIComponent(m[1]);
}

source.getChannel = function (url) {
    var id = showIdFromUrl(url);
    var obj = pickObj(getJson("/api/show/" + enc(id)));
    var img = imageOf(obj);
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "show:" + id, CONFIG.id),
        name: titleOf(obj) || id,
        thumbnail: img,
        banner: null,
        subscribers: -1,
        description: descriptionOf(obj),
        url: API + "/api/show/" + enc(id),
        links: {}
    });
};

source.getChannelCapabilities = function () {
    return { types: [Type.Feed.Mixed], sorts: [], filters: [] };
};

source.getChannelContents = function (url, type, order, filters, continuationToken) {
    var id = showIdFromUrl(url);
    var obj = pickObj(getJson("/api/show/" + enc(id)));
    var showName = titleOf(obj) || id;
    var img = imageOf(obj);
    var eps = episodesOf(obj);
    var videos = [];

    for (var i = 0; i < eps.length; i++) {
        var ep = eps[i];
        var label = showName + " S" + pad2(ep.s) + "E" + pad2(ep.e) + (ep.name ? " - " + ep.name : "");
        videos.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, "tv:" + id + ":" + ep.s + ":" + ep.e, CONFIG.id),
            name: label,
            thumbnails: makeThumbs(ep.img || img),
            author: showAuthor(id, showName, img),
            uploadDate: 0,
            duration: -1,
            viewCount: -1,
            url: API + "/api/tv/" + enc(id) + "/" + ep.s + "/" + ep.e,
            isLive: false
        }));
    }
    return new PelisHubSearchPager(videos, false, {});
};

/* --------------------------------------------------------------- pagers */

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
        return new PelisHubSearchPager([], false, {});
    }
}
