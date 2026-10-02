var PLATFORM = "PelisHubWorker";
var PID = (typeof config !== "undefined" && config && config.id) ? config.id : "b7a2e4c1-3d5f-4e8a-9c26-1f0d7a5b8e99";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var SCHEME = "pelishubworker://";

var _settings = {};
var API_BASE = "https://pelishub-api.xxxxx.workers.dev"; // se actualiza en enable

function log(s) { /* opcional */ }

function apiGet(path) {
  var url = API_BASE.replace(/\/+$/, "") + path;
  try {
    var r = http.GET(url, {
      "User-Agent": "GrayJay-PelisHubWorker",
      "Accept": "application/json"
    }, false);
    if (!r || !r.body) return null;
    return JSON.parse(r.body);
  } catch (e) {
    return null;
  }
}

function thumb(u) {
  return u ? new Thumbnails([new Thumbnail(u, 100)]) : new Thumbnails([]);
}

function author() {
  return new PlatformAuthorLink(PPID, "PelisHub", "https://www.themoviedb.org", "", 0);
}

function makeMovieUrl(id) { return SCHEME + "movie/" + id; }
function makeTvUrl(id, s, e) { return SCHEME + "tv/" + id + "/" + s + "/" + e; }
function makeShowUrl(id) { return SCHEME + "show/" + id; }

function parseUrl(url) {
  var s = String(url || "");
  var m = s.match(/^pelishubworker:\/\/movie\/(\d+)$/);
  if (m) return { kind: "movie", id: m[1] };
  m = s.match(/^pelishubworker:\/\/tv\/(\d+)\/(\d+)\/(\d+)$/);
  if (m) return { kind: "tv", id: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
  m = s.match(/^pelishubworker:\/\/show\/(\d+)$/);
  if (m) return { kind: "show", id: m[1] };
  return null;
}

function mapVideo(item) {
  var isTv = item.type === "tv";
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, (isTv ? "tv_" : "movie_") + item.id, PID),
    name: item.title,
    thumbnails: thumb(item.poster),
    author: author(),
    uploadDate: 0,
    viewCount: 0,
    duration: 0,
    isLive: false,
    url: isTv ? makeTvUrl(item.id, 1, 1) : makeMovieUrl(item.id)
  });
}

function makePager(results, hasMore, loadNext) {
  var pager = new VideoPager(results || [], !!hasMore, {});
  var page = 1;
  pager.nextPage = function () {
    page++;
    var r = loadNext(page) || { results: [], hasMore: false };
    this.results = r.results || [];
    this.hasMore = !!r.hasMore;
    return this;
  };
  return pager;
}

// ====================== GRAYJAY API ======================
if (typeof source !== "undefined") {
  source.enable = function (conf, settings) {
    _settings = settings || {};
    if (_settings.apiBase) API_BASE = String(_settings.apiBase).replace(/\/+$/, "");
  };

  source.setSettings = function (s) {
    _settings = s || {};
    if (_settings.apiBase) API_BASE = String(_settings.apiBase).replace(/\/+$/, "");
  };

  source.getHome = function () {
    try {
      var data = apiGet("/home?page=1") || { results: [], hasMore: false };
      var videos = (data.results || []).map(mapVideo);
      return makePager(videos, data.hasMore, function (pg) {
        var d = apiGet("/home?page=" + pg) || { results: [], hasMore: false };
        return { results: (d.results || []).map(mapVideo), hasMore: d.hasMore };
      });
    } catch (e) {
      return new VideoPager([], false, {});
    }
  };

  source.search = function (q) {
    try {
      q = q || "";
      var data = apiGet("/search?q=" + encodeURIComponent(q) + "&page=1") || { results: [], hasMore: false };
      var videos = (data.results || []).map(mapVideo);
      return makePager(videos, data.hasMore, function (pg) {
        var d = apiGet("/search?q=" + encodeURIComponent(q) + "&page=" + pg) || { results: [], hasMore: false };
        return { results: (d.results || []).map(mapVideo), hasMore: d.hasMore };
      });
    } catch (e) {
      return new VideoPager([], false, {});
    }
  };

  source.getSearchCapabilities = function () {
    return { types: ["MIXED"], sorts: [], filters: [] };
  };

  source.isContentDetailsUrl = function (url) {
    var p = parseUrl(url);
    return !!(p && (p.kind === "movie" || p.kind === "tv"));
  };

  source.getContentDetails = function (url) {
    try {
      var p = parseUrl(url);
      if (!p) throw new ScriptException("URL no válida");

      var path = p.kind === "movie"
        ? "/movie/" + p.id
        : "/tv/" + p.id + "/" + p.season + "/" + p.episode;

      if (_settings.debugMode === true || _settings.debugMode === "true") {
        path += (path.indexOf("?") >= 0 ? "&" : "?") + "debug=1";
      }

      var data = apiGet(path);
      if (!data || data.error) {
        throw new ScriptException(data && data.error ? data.error : "No se pudo obtener detalles");
      }

      var sources = [];
      (data.sources || []).forEach(function (s) {
        if (!s || !s.url) return;
        if (s.type === "hls") {
          try {
            sources.push(new HLSSource({
              name: s.name || "HLS",
              url: s.url,
              requestModifier: s.headers ? { headers: s.headers } : null
            }));
          } catch (e) {}
        } else {
          try {
            sources.push(new VideoUrlSource({
              name: s.name || "Video",
              url: s.url,
              width: 0,
              height: 0,
              container: "video/mp4",
              codec: "",
              bitrate: 0,
              requestModifier: s.headers ? { headers: s.headers } : null
            }));
          } catch (e) {}
        }
      });

      var desc = data.overview || "";
      if (data.debug) desc += "\n\n=== DEBUG ===\n" + data.debug;

      return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, (p.kind === "tv" ? "tv_" + p.id + "_" + p.season + "_" + p.episode : "movie_" + p.id), PID),
        name: data.title || "Sin título",
        thumbnails: thumb(data.still || data.poster),
        author: author(),
        uploadDate: 0,
        duration: data.runtime || 0,
        viewCount: 0,
        isLive: false,
        url: url,
        description: desc,
        video: new VideoSourceDescriptor(sources)
      });
    } catch (e) {
      throw e;
    }
  };

  source.isChannelUrl = function (url) {
    var p = parseUrl(url);
    return !!(p && p.kind === "show");
  };

  source.getChannel = function (url) {
    var p = parseUrl(url);
    if (!p || p.kind !== "show") return null;
    var data = apiGet("/show/" + p.id);
    if (!data) return null;
    return new PlatformChannel({
      id: new PlatformID(PLATFORM, "show_" + p.id, PID),
      name: data.title || "Serie",
      thumbnail: data.poster || "",
      banner: data.backdrop || "",
      subscribers: 0,
      description: data.overview || "",
      url: url,
      urlAlternatives: [url],
      links: {}
    });
  };

  source.getChannelContents = function (url) {
    // Por ahora vacío (se puede ampliar después)
    return new VideoPager([], false, {});
  };

  source.getContentRecommendations = function (url) {
    return new VideoPager([], false, {});
  };
}
