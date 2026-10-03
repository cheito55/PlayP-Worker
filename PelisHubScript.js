/*
 * StreamflixHub Worker API  (port del plugin GrayJay StreamflixHub v1.8.28)
 * Cloudflare Workers - ES module - async/await (fetch)
 *
 * Endpoints (todos devuelven JSON, con CORS):
 *   GET /                              -> ayuda
 *   GET /api/home?page=1               -> trending TMDB
 *   GET /api/search?q=texto&page=1     -> busqueda TMDB (multi)
 *   GET /api/movie/:tmdbId             -> detalles + fuentes
 *   GET /api/tv/:tmdbId/:season/:ep    -> detalles + fuentes del episodio
 *   GET /api/show/:tmdbId              -> temporadas y episodios
 *   GET /proxy?u=<url>&h=<base64 json headers>   -> proxy (agrega Referer/headers, reescribe m3u8)
 *
 * Query opcionales en /api/movie y /api/tv:
 *   mode=fast|normal|full   (default fast)  -> cuantos servidores buscar/mostrar
 *   plus=1                  -> Servidores Plus (OK.ru + Odysee + Dailymotion + Archive.org) primero
 *   debug=1                 -> incluye el log de diagnostico
 *   proxy=1                 -> las URLs de las fuentes salen envueltas en /proxy (para reproducir en navegador)
 *
 * Tambien: /api/juanita/*, /api/jk/*, /api/okru/{plan,hits,sources}  (ver GET /)
 *   OK.ru con la sesion de GrayJay: el cliente pide /plan, baja las paginas de ok.ru con SU sesion,
 *   y manda solo los fragmentos utiles: POST /hits {pages:[html]} y POST /sources {pages:[{id,name,html,meta?}]}
 *   (query kind=movie|tv&id=<tmdb>&s=&e=). /sources devuelve "pending" si falta bajar una metadataUrl desde el cliente.
 *   extra=1  -> incluye sitios WP extra (Gnula) y catalogo JKAnime/Juanita en la busqueda
 *
 * Variables / secretos (wrangler):
 *   TMDB_KEY      (opcional, si no se usa la del script original)
 *   OKRU_COOKIE   (opcional, NO necesaria si usas el cliente GrayJay: la sesion de ok.ru la guarda la app)
 *   API_TOKEN     (opcional) si se define, exige header "x-api-key: <token>" o ?key=<token>
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const DEF_TMDB_KEY = "26c168179ae6b5445f36aca260e00d48";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_STILL = "https://image.tmdb.org/t/p/w300";
const TMDB_BACK = "https://image.tmdb.org/t/p/w780";

const POSEIDON = "https://www.poseidonhd2.co";
const JUANITA = "https://pelisjuanita.com";
const LACARTOONS = "https://www.lacartoons.com";
/* ---- DOMINIOS (exactos del script original) ---- */
const DOMAINS = {
  poseidon: ["https://www.poseidonhd2.co", "https://poseidonhd2.co"],
  juanita: ["https://pelisjuanita.com"],
  pelisflix1: ["https://pelisflix1.tv", "https://pelisflix1.de", "https://pelisflix1.link", "https://pelisflix1.at", "https://pelisflix1.surf"],
  pelisflixhd: ["https://pelisflixhd.win"],
  cuevana_main: ["https://www.cuevana3.eu", "https://cuevana3.cc", "https://cuevana19.com", "https://es.cuevana4br.com", "https://cuevana3.ai", "https://cuevana3.me", "https://cuevana3.so", "https://cuevana2.biz"],
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
const CUEVANA_BASES = DOMAINS.cuevana_main;
const JK = "https://jkanime.net";
const PLPRO_BASE = "https://plpro.org";
const PLPRO_USER = "p";
const PLPRO_PASS = "p";

const WISH_HOSTS = [
  "streamwish.to", "streamwish.com", "streamwish.biz", "streamwish.cc", "streamwish.club", "streamwish.fun",
  "streamwish.info", "streamwish.live", "streamwish.me", "streamwish.net", "streamwish.org", "streamwish.site",
  "strwish.com", "strmwis.xyz", "swdyu.com", "swhoi.com", "swish.site", "swishsrv.com", "hlswish.com",
  "playerwish.com", "embedwish.com", "awish.pro", "awish.top", "dwish.pro", "dwish.top", "mwish.pro", "mwish.top",
  "flaswish.com", "sfastwish.com", "cdnwish.com", "jodwish.com", "obeywish.com", "wishembed.pro", "wishfast.top",
  "wishon.site", "wishonly.site", "vidwish.live", "vidwish.site", "asnwish.com", "juliewomanwish.com"
];
const VOE_HOSTS = [
  "charlestoughrace.com", "christopheruntilpoint.com", "crystaltreatmenteast.com", "dianaavoidthey.com",
  "jefferycontrolmodel.com", "jessicayeahcatch.com", "jilliandescribecompany.com", "johnbeyondnation.com",
  "juliewomanwish.com", "lancewhosedifficult.com", "lauradaydo.com", "mikaylaarealike.com",
  "rebeccapracticeloss.com", "richardquestionbuilding.com", "voe.sx", "walterprettytheir.com"
];
const MOON_HOSTS = ["bf0skv.org", "bysebuho.com", "bysejikuar.com", "bysekoze.com", "bysesayeveum.com", "bysezoxexe.com", "filemoon.site", "filemoon.sx", "moflix-stream.link"];
const DOOD_HOSTS = ["d000d.com", "do7go.com", "dood.la", "dood.li", "doods.to", "dooood.com", "dsvplay.com", "myvidplay.com", "playmogo.com", "poophq.com"];
const MIX_HOSTS = ["m1xdrop.net", "miiixdrop.net", "miixdrop.net", "mixdrop.ag", "mixdrop.bz", "mixdrop.ch", "mixdrop.club", "mixdrop.co", "mixdrop.cv", "mixdrop.to", "mxdrop.to"];
const VIDHIDE_HOSTS = [
  "callistanise.com", "dhcplay.com", "dhtpre.com", "dingtezuni.com", "dintezuvio.com", "filelions.to",
  "minochinos.com", "moflix-stream.click", "morencius.com", "peytonepre.com", "vidhidefast.com", "vidhideplus.com", "vidhidepro.com"
];
const TAPE_HOSTS = ["streamta.site", "streamtape.com", "streamtape.net", "streamtape.to"];
const UQLOAD_HOSTS = ["uqload.com", "uqload.cx", "uqload.is"];
const FILE_HOSTS = [
  "bigwarp.cc", "bigwarp.io", "bigwarp.pro", "goodstream.one", "lamovie.link", "luluvdo.com", "luluvdoo.com",
  "luluvid.com", "moflix-stream.fans", "mp4upload.com", "rubystm.com", "rubyvid.com", "stmruby.com",
  "streamhub.to", "streamruby.com", "supervideo.cc", "upzone.cc", "upzone.link", "upzone.net", "upzone.to",
  "videzz.net", "vidmoly.me", "vidmoly.net", "vidmoly.org", "vidmoly.to", "vidoza.net", "vimeos.net", "vtbe.to",
  "vtube.to", "www.mp4upload.com", "www.yourupload.com", "www.yucache.net"
];
let SERVER_HOSTS = ["streamsb.net", "streamsss.net", "ssbstream.net", "watchsb.com", "sbanh.com", "sbfast.com", "sbfast.live", "sbplay.one", "sbplay.org", "sbplay1.com", "sbplay2.com", "sbplay2.xyz", "sbplay3.com", "sbfull.com", "sbbrisk.com", "sblongvu.com", "sbembed.com", "sbembed1.com", "playersb.com", "embedsb.com", "viewsb.com", "lvturbo.com",
  "dood.", "doodstream.", "dooood.", "dood.cx", "dood.la", "dood.pm", "dood.sh", "dood.so", "dood.to", "dood.watch", "dood.wf", "dood.ws", "dood.yt", "dood.li",
  "uqload.", "uqload.com", "uqload.co", "uqload.cx", "voe.sx", "streamtape.", "upstream.to", "streamlare.", "streamhub.to", "streamsss.net", "plusvip.net", "sololatino.net", "zplayer.live", "v2.zplayer.live", "fastream.to", "vidcloud9.org", "doc.vidcloud9.org", "cloudemb.com", "embedsito.net",
  "okru.link", "ok.ru", "moonplayer.", "moonplayer.lat", "playhide.online", "esplay.", "mycdn.moe", "acek-cdn.com", "dramiyos-cdn.com", "solo-latino.com", "owodeuwu.xyz", "suzihaza.com",
  "streamwish", "hlswish", "wishembed", "awish", "vidhide", "filelions", "filemoon", "mixdrop", "mxdrop", "supervideo", "xupalace", "nuuuppp", "playhubconnect", "saidochesto",
  "vimeos", "callistanise", "hgcloud.", "vimeo.com", "vk.com", "vkvideo.ru", "odnoklassniki", "streamhub", "embedwish", "dhcplay", "minochinos", "lulustream", "luluvdo", "vtube", "vidguard", "bigwarp", "player.cuevana3", "vimeus.", "goodstream.",
  "fortamomar.workers.dev", "seriesplayer.", "onfilom.com", "playspelis.com", "afterdark.best", "chillx.top", "closeload.top", "dokicloud.one", "dropload.io", "frembed.casa", "fsvid.lol", "gupload.xyz", "gxplayer.xyz", "hxfile.co", "lamovie.link", "loadx.ws", "magasavor.net", "maxstream.video", "moviesapi.club", "oneupload.net", "primesrc.me", "rabbitstream.net", "ridoo.net", "rpmvid.com", "savefiles.com", "sharecloudy.com", "streamix.so", "streamruby.com", "upzur.com", "upzone.to", "veev.to", "vidguard.to", "vidlink.pro", "vidara.to", "videasy.net", "vidflix.club", "vidnest.io", "vidora.stream", "vidplay.online", "vidrock.net", "vidsonic.net", "vidsrc.to", "vidxgo.co", "vidzee.wtf", "vidzy.org", "vixsrc.to", "vixcloud.co", "zilla-networks.com", "bigwarp.io", "goodstream.one", "vidoza.net", "vidmoly.to", "vidmoly.me", "swdyu.com", "strwish.com", "playerwish.com", "luluvdo.com", "supervideo.cc", "nupload.me", "closeload.com", "mixdrop.ag", "filemoon.sx", "filemoon.site", "321moviesfree.com", "flixlat.com",
  "hglink.to", "morencius.com", "futuretravelroute.space"];

const SF_ALL_HOSTS = {
  wish: ["streamwish.to", "streamwish.com", "streamwish.biz", "streamwish.cc", "streamwish.club", "streamwish.fun", "streamwish.info", "streamwish.live", "streamwish.me", "streamwish.net", "streamwish.org", "streamwish.site", "strwish.com", "strmwis.xyz", "swdyu.com", "swhoi.com", "swish.site", "swishsrv.com", "hlswish.com", "playerwish.com", "embedwish.com", "awish.pro", "awish.top", "dwish.pro", "dwish.top", "mwish.pro", "mwish.top", "flaswish.com", "sfastwish.com", "cdnwish.com", "jodwish.com", "obeywish.com", "wishembed.pro", "wishfast.top", "wishon.site", "wishonly.site", "vidwish.live", "vidwish.site", "asnwish.com"],
  vidhide: ["callistanise.com", "vidhideplus.com", "vidhidefast.com", "vidhidepre.com", "filelions.to", "filelions.com", "morencius.com", "hglink.to", "hgcloud.net", "dintezuvio.com", "dingtezuni.com", "peytonepre.com", "moflix-stream.click", "moflix-stream.xyz", "moflix-stream.fans", "moflix-stream.link", "moflix.rpmplay.xyz", "moflix.upns.xyz"],
  filemoon: ["filemoon.sx", "filemoon.to", "filemoon.online", "filemoon.site", "filemoon.in", "filemoon.nl", "moonmov.pro", "bysejikuar.com", "kerapoxy.cc"],
  voe: ["voe.sx", "voe-unblock.com", "voeun-block.net", "voeunblock.com", "voeunbl.com", "un-block-voe.net", "v-o-e-unblock.com"],
  dood: ["dood.la", "dood.li", "doods.to", "doodstream.com", "doodporn.xyz", "ds2play.com", "ds2video.com", "dooood.com"],
  mixdrop: ["mixdrop.co", "mixdrop.to", "mixdrop.ch", "mixdrop.ag", "mixdrop.bz", "mixdrop.club", "mixdrop.cv", "mdy48tn97.com", "mdbekjwqa.pw"],
  streamtape: ["streamtape.com", "streamtape.to", "streamtape.net", "streamta.pe", "strtape.tech", "strcloud.link"],
  uqload: ["uqload.com", "uqload.co", "uqload.io", "uqload.to", "uqload.cx", "uqload.is", "uqloads.xyz"],
  okru: ["ok.ru", "www.ok.ru", "odnoklassniki.ru", "okru.link"],
  lulu: ["luluvdo.com", "luluvdoo.com", "luluvid.com", "lulustream.com"],
  supervideo: ["supervideo.cc", "supervideo.tv"],
  goodstream: ["goodstream.one", "goodstream.se", "goodstream.uno"],
  vidoza: ["vidoza.net", "vidoza.org", "vidoza.co"],
  mp4upload: ["mp4upload.com", "mp4upload.org"],
  yourupload: ["yourupload.com", "yucache.net"],
  vidmoly: ["vidmoly.to", "vidmoly.me", "vidmoly.net", "vidmoly.org"],
  streamhub: ["streamhub.to", "streamhub.gg", "streamhub.ink"],
  vtube: ["vtube.to", "vtube.network", "vtbe.net", "vtbe.to"],
  bigwarp: ["bigwarp.io", "bigwarp.art", "bigwarp.cc", "bigwarp.pro", "bgwp.cc"],
  nupload: ["nupload.me", "nupload.top", "nupupload.top", "nuuuppp.com", "ap.nupload.me"],
  streamsb: ["streamsb.net", "streamsss.net", "sbplay2.com", "sbfull.com", "lvturbo.com", "sbchill.com"],
  dropload: ["dropload.io", "dropload.tv", "dropload.pro"],
  closeload: ["closeload.com", "closeload.top", "ridorapid.closeload.top"],
  gxplayer: ["gxplayer.com", "watch.gxplayer.xyz", "play.gxplayer.com"],
  vimeus: ["vimeus.com", "vimeus.net", "vimeus.to"],
  afterdark: ["afterdark.best", "proxy.afterdark.baby"],
  chillx: ["chillx.top"],
  dailymotion: ["dailymotion.com", "geo.dailymotion.com"],
  dokicloud: ["dokicloud.one"],
  frembed: ["frembed.casa"],
  fsvid: ["fsvid.lol"],
  gupload: ["gupload.xyz"],
  hxfile: ["hxfile.co"],
  lamovie: ["lamovie.link"],
  loadx: ["loadx.ws"],
  mstreamday: ["rpmstream.live"],
  magasavor: ["magasavor.net"],
  mailru: ["my.mail.ru", "mail.ru"],
  maxstream: ["maxstream.video"],
  moviesapi: ["moviesapi.club"],
  myfilestorage: ["myfilestorage.xyz"],
  nekostream: ["nekostream"],
  oneupload: ["oneupload.net"],
  pdrain: ["pdrain"],
  pcloud: ["pcloud.link", "pcloud.com"],
  pluspomla: ["pluspomla"],
  primesrc: ["primesrc.me"],
  rabbitstream: ["rabbitstream.net"],
  ridoo: ["ridoo.net"],
  rpmvid: ["rpmvid.com", "cubeembed.rpmvid.com"],
  savefiles: ["savefiles.com"],
  sharecloudy: ["sharecloudy.com"],
  streamup: ["streamup"],
  streamix: ["streamix.so"],
  streamruby: ["streamruby.com"],
  twoembed: ["2embed", "twoembed"],
  ustr: ["ustr"],
  upzur: ["upzur.com"],
  upzone: ["upzone.cc", "upzone.link", "upzone.net", "upzone.to"],
  veev: ["veev.to"],
  vidguard: ["vidguard.to"],
  vidlink: ["vidlink.pro"],
  vidply: ["vidply.com"],
  vidara: ["vidara.so", "vidara.to"],
  videasy: ["videasy.net", "player.videasy.net"],
  vidflix: ["vidflix.club"],
  vidnest: ["vidnest.io"],
  vidora: ["vidora.stream"],
  vidplay: ["vidplay.online", "vidplay.site", "myvidplay.com"],
  vidrock: ["vidrock.net"],
  vidsonic: ["vidsonic.net"],
  vidsrc: ["vidsrc.to", "vidsrc.ru", "vidsrc-embed.ru", "vidsrc.net"],
  vidxgo: ["vidxgo.co"],
  vidzee: ["vidzee.wtf", "player.vidzee.wtf", "core.vidzee.wtf"],
  vidzy: ["vidzy.org"],
  vixsrc: ["vixsrc.to"],
  vixcloud: ["vixcloud.co"],
  zilla: ["zilla-networks.com", "player.zilla-networks.com"],
  jkplayer: ["jkdesu", "jkanime"],
  amazon: ["drive.google.com", "google.com/file"],
  googledrive: ["drive.google.com"]
};
SERVER_HOSTS = SERVER_HOSTS.concat(WISH_HOSTS, VOE_HOSTS, MOON_HOSTS, DOOD_HOSTS, MIX_HOSTS, VIDHIDE_HOSTS, TAPE_HOSTS, UQLOAD_HOSTS, FILE_HOSTS);

function hostIn(h, list) {
  h = String(h || "").toLowerCase().replace(/^www\./, "");
  for (const a of list) {
    if (h === a) return true;
    if (h.length > a.length && h.substring(h.length - a.length - 1) === "." + a) return true;
  }
  return false;
}
const hostMatches = (h, list) => list.some((x) => h.indexOf(x) >= 0);
const isServerUrl = (u) => hostMatches(hostOf(u), SERVER_HOSTS);
function isPackerFamily(h) {
  h = String(h || "");
  return hostIn(h, WISH_HOSTS) || hostIn(h, VIDHIDE_HOSTS) || hostIn(h, MOON_HOSTS) || /morencius|hglink|hgcloud|vidhide|callistanise|filelions|lulustream|luluvdo|streamwish|hlswish|wishembed|awish|embedwish|filemoon/.test(h);
}
function sfMatchFamily(h) {
  h = String(h || "").toLowerCase();
  for (const fam in SF_ALL_HOSTS) {
    for (const x of SF_ALL_HOSTS[fam]) if (h.indexOf(x.replace(/^www\./, "")) >= 0) return fam;
  }
  return "";
}
const sfHostIn = (h, list) => list.some((x) => String(h || "").toLowerCase().indexOf(String(x).replace(/^www\./, "")) >= 0);

const ODYSEE_API = "https://api.na-backend.odysee.com/api/v1/proxy";

const MODES = {
  fast: { want: 3, max: 4, budget: 20000 },
  normal: { want: 4, max: 6, budget: 28000 },
  full: { want: 6, max: 8, budget: 40000 }
};
const MAX_CAND = 8;
const MAX_HTML = 1200000;

const UNSUPPORTED = ["waaw.", "netu.", "hqq.", "younetu.", "hqtv.", "biribup.", "cuevana3.download", "1fichier."];
const OK_RANK = { ultra: 7, quad: 6, full: 5, hd: 4, sd: 3, low: 2, lowest: 1, mobile: 0 };
const OK_LABEL = { ultra: "2160p", quad: "1440p", full: "1080p", hd: "720p", sd: "480p", low: "360p", lowest: "240p", mobile: "144p" };

const TITLE_NOISE = new Set(["1080p", "720p", "480p", "2160p", "4k", "uhd", "hd", "hdtv", "latino", "latam", "castellano", "espanol", "doblado", "doblaje", "subtitulado", "sub", "subs", "vose", "vos", "dual", "audio", "webdl", "webrip", "bluray", "brrip", "online", "gratis", "completa", "pelicula", "peliculas", "serie", "series", "capitulo", "temporada", "m1080p", "m720p", "dl", "dlatino", "lat", "esp", "spa", "spanish", "english", "ver", "watch", "movie", "film", "full", "microhd"]);

/* ================================================================== */
/* utilidades de texto                                                 */
/* ================================================================== */

function clean(s) {
  if (s == null) return "";
  return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&#038;/g, "&").replace(/&#8217;/g, "'").replace(/\\u0026/g, "&").replace(/\\\//g, "/")
    .replace(/\s+/g, " ").trim();
}
const enc = (s) => encodeURIComponent(String(s == null ? "" : s));
const dec = (s) => { try { return decodeURIComponent(String(s || "")); } catch (e) { return String(s || ""); } };
const hostOf = (u) => { const m = String(u || "").match(/^https?:\/\/([^\/?#]+)/i); return m ? m[1].toLowerCase() : ""; };
const originOf = (u) => { const m = String(u || "").match(/^(https?:\/\/[^\/?#]+)/i); return m ? m[1] : ""; };
function absUrl(u, base) {
  u = clean(u);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  const o = originOf(base) || String(base || "");
  return u.charAt(0) === "/" ? o + u : o + "/" + u;
}
function cleanUrl(u) {
  u = String(u == null ? "" : u).replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  return u.replace(/^[\s"']+/, "").replace(/[\s"'),;\\]+$/g, "");
}
function strip(s) {
  return clean(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}
const uniq = (a) => { const seen = new Set(), out = []; for (const x of a) { if (x && !seen.has(String(x))) { seen.add(String(x)); out.push(x); } } return out; };
function stripAccents(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function normalizeTitle(s) {
  return stripAccents(clean(s)).toLowerCase().replace(/&[^;\s]+;/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function titleTokens(s) {
  const n = normalizeTitle(s);
  return (n ? n.split(" ") : []).filter((p) => p.length > 1 && !TITLE_NOISE.has(p));
}
function tokenSimilarity(a, b) {
  const ta = titleTokens(a), tb = titleTokens(b), used = {};
  let hit = 0;
  if (!ta.length || !tb.length) return 0;
  for (const t of ta) if (!used[t] && tb.indexOf(t) >= 0) { hit++; used[t] = 1; }
  return Math.round((hit / Math.max(ta.length, tb.length)) * 100);
}
function titleCoverage(pageTitle, want) {
  const pt = titleTokens(pageTitle), wt = titleTokens(want);
  if (!wt.length) return 0;
  let hit = 0;
  for (const t of wt) if (pt.indexOf(t) >= 0) hit++;
  return Math.round((hit / wt.length) * 100);
}
function verifyPageTitle(html, ctx) {
  if (!html) return { ok: null, pageTitle: "" };
  const tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html) || /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const pageTitle = tm ? clean(strip(tm[1])) : "";
  if (!pageTitle) return { ok: null, pageTitle: "" };
  const cov = Math.max(titleCoverage(pageTitle, ctx.titleEs), titleCoverage(pageTitle, ctx.titleEn), titleCoverage(pageTitle, ctx.titleOrig));
  const yr = (/\b((?:19|20)\d{2})\b/.exec(pageTitle) || [])[1] || "";
  const yearOk = !yr || !ctx.year || Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) <= 1;
  return { ok: cov >= 70 && yearOk, pageTitle };
}
const slugJuanita = (t) => stripAccents(t).trim().replace(/[^a-zA-Z0-9]/g, " ").replace(/\s+/g, "-").replace(/-+/g, "-").toLowerCase();
const trimDash = (s) => String(s || "").replace(/^-+/, "").replace(/-+$/, "");
const slugCuevana = (t) => stripAccents(String(t || "").toLowerCase()).replace(/[\[\]^\/,'*:.!><~@#$%+=?|"\\()\u00bf\u00a1]+/g, "").trim().replace(/ +/g, "-").replace(/-+/g, "-");

function b64decode(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+\/=]/g, "");
  while (s.length % 4) s += "=";
  try { return atob(s); } catch (e) { return ""; }
}
function attrsOf(tag) {
  const out = {}, re = /([a-zA-Z0-9_:\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(String(tag || ""))) != null) out[m[1].toLowerCase()] = clean(m[2] != null ? m[2] : m[3]);
  return out;
}
function findTags(html, test) {
  const out = [], re = /<[a-zA-Z][^>]*>/g;
  let m;
  while ((m = re.exec(html || "")) != null) {
    if (test.test(m[0])) { out.push({ tag: m[0], index: m.index, end: re.lastIndex }); if (out.length >= 300) break; }
  }
  return out;
}
function parseJson(t) { try { return JSON.parse(t); } catch (e) { return null; } }
function htmlUnescape(s) {
  return String(s || "").replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const rot13 = (s) => String(s).replace(/[a-zA-Z]/g, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
const yearOf = (s) => { const m = /^(\d{4})/.exec(String(s || "")); return m ? m[1] : ""; };
const slugToTitle = (s) => String(s || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(p, ms, fallback) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}

/* ================================================================== */
/* contexto de request + HTTP                                          */
/* ================================================================== */

function makeR(env, url) {
  const q = url.searchParams;
  const mode = MODES[q.get("mode")] || MODES.fast;
  return {
    env,
    mode,
    plus: q.get("plus") === "1" || q.get("plus") === "true",
    debug: q.get("debug") === "1" || q.get("debug") === "true",
    proxy: q.get("proxy") === "1" || q.get("proxy") === "true",
    extra: q.get("extra") === "1" || q.get("extra") === "true",
    deadline: Date.now() + mode.budget,
    logs: [],
    tmdbKey: env.TMDB_KEY || DEF_TMDB_KEY,
    tmdbCache: new Map(),
    base: url.origin
  };
}
const log = (R, s) => { R.logs.push(String(s)); };
const budgetLeft = (R) => Date.now() < R.deadline;

function hdr(referer, extra) {
  const h = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" };
  if (referer) h["Referer"] = referer;
  if (extra) Object.assign(h, extra);
  return h;
}
async function doFetch(R, url, init, timeout) {
  if (!budgetLeft(R)) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout || 8000);
  try {
    return await fetch(url, Object.assign({ signal: ac.signal, redirect: "follow" }, init));
  } catch (e) {
    log(R, "fetch " + String(url).substring(0, 80) + " -> " + e);
    return null;
  } finally { clearTimeout(t); }
}
async function httpGet(R, url, referer, extra, timeout) {
  if (!hostOf(url)) return "";
  const r = await doFetch(R, url, { headers: hdr(referer || originOf(url) + "/", extra) }, timeout);
  if (!r) return "";
  if (r.status >= 500 || r.status === 404) { log(R, "HTTP " + r.status + " " + String(url).substring(0, 90)); return ""; }
  let b = "";
  try { b = await r.text(); } catch (e) { return ""; }
  if (r.status >= 400 && !b) return "";
  return b.length > MAX_HTML ? b.substring(0, MAX_HTML) : b;
}
async function httpPost(R, url, body, referer, extra, timeout) {
  const h = hdr(referer || originOf(url) + "/", extra);
  h["Content-Type"] = (extra && extra["Content-Type"]) || "application/x-www-form-urlencoded; charset=UTF-8";
  const r = await doFetch(R, url, { method: "POST", headers: h, body }, timeout);
  if (!r) return "";
  try { return await r.text(); } catch (e) { return ""; }
}
async function batchGet(R, urls, referer) {
  return Promise.all(urls.map((u) => httpGet(R, u, referer)));
}

/* ================================================================== */
/* fuentes (mkSrc)                                                     */
/* ================================================================== */

function inferMediaType(u) {
  u = String(u || "");
  if (/\.mpd(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=(?:dash|mpd)/i.test(u) || /\/dash\//i.test(u)) return "dash";
  if (/\.m3u8(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=m3u8/i.test(u) || /\/hls\//i.test(u)) return "hls";
  if (/\.mp4(?:[?#]|$)/i.test(u) || /[?&](?:format|type)=mp4/i.test(u)) return "mp4";
  return "";
}
function mkSrc(u, label, ref, force) {
  u = cleanUrl(u);
  if (!/^https?:\/\//i.test(u)) return null;
  const type = force || inferMediaType(u);
  if (!type) return null;
  const o = { name: label || "Video", url: u, type, headers: {} };
  if (ref) { o.headers["Referer"] = ref; const og = originOf(ref); if (og) o.headers["Origin"] = og; o.headers["User-Agent"] = UA; }
  return o;
}
/* Sin Referer/Origin (OK.ru / okcdn / odysee / archive): solo User-Agent */
function mkSrcBare(u, label, force) {
  u = cleanUrl(u);
  if (!/^https?:\/\//i.test(u)) return null;
  const type = force || inferMediaType(u) || "mp4";
  return { name: label || "Video", url: u, type, headers: { "User-Agent": UA }, bare: true };
}
function addSrc(arr, s) {
  if (!s || !s.url) return;
  for (const x of arr) if (x.url === s.url) return;
  arr.push(s);
}

/* ---- p.a.c.k.e.r ---- */
function unpackOne(p, a, c, k) {
  const e = (n) => (n < a ? "" : e(parseInt(n / a, 10))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  const d = {};
  for (let i = 0; i < c; i++) d[e(i)] = k[i] && k[i].length ? k[i] : e(i);
  const keys = Object.keys(d).sort((x, y) => y.length - x.length);
  for (const key of keys) {
    if (!key) continue;
    p = p.replace(new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), d[key]);
  }
  return p;
}
function unpackAll(text) {
  const out = [], re = /eval\(function\(p,a,c,k,e,(?:d|r)\)[\s\S]*?\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g;
  let m;
  while ((m = re.exec(String(text || ""))) != null) {
    try { out.push(unpackOne(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4].split("|"))); } catch (e) { /* ignore */ }
    if (out.length >= 6) break;
  }
  return out;
}
function normalizeMediaText(t) {
  return String(t || "").replace(/\\u0026/gi, "&").replace(/\\u002F/gi, "/").replace(/\\u003A/gi, ":").replace(/\\u003F/gi, "?")
    .replace(/\\u003D/gi, "=").replace(/\\u0023/gi, "#").replace(/\\\//g, "/").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}
function addMediaCandidate(out, u, label, ref, base) {
  u = cleanUrl(normalizeMediaText(u));
  if (!u) return;
  if (u.indexOf("//") === 0) u = "https:" + u;
  else if (u.charAt(0) === "/" && u.charAt(1) !== "/" && base) u = base + u;
  if (!/^https?:\/\//i.test(u)) return;
  if (!/\.(?:m3u8|mp4|mpd)(?:[?#]|$)/i.test(u) && !/\b(?:m3u8|mp4|mpd)\b/i.test(u)) return;
  let s = mkSrc(u, label, ref);
  if (!s) {
    if (/\bm3u8\b/i.test(u)) s = mkSrc(u, label || "HLS", ref, "hls");
    else if (/\.mp4(?:[?#]|$)/i.test(u)) s = mkSrc(u, label || "MP4", ref, "mp4");
  }
  if (s) addSrc(out, s);
}
function isDirectMediaUrl(u) {
  u = normalizeMediaText(cleanUrl(u));
  return /^https?:\/\//i.test(u) && !!inferMediaType(u);
}
function scanMedia(text, label, ref, pageUrl) {
  const out = [], base = originOf(pageUrl);
  const texts = [normalizeMediaText(text)].concat(unpackAll(text).map(normalizeMediaText));
  for (const t of texts) {
    let m, re = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?/gi;
    while ((m = re.exec(t)) != null) addMediaCandidate(out, m[0], label, ref, base);
    re = /(?:^|["'\s=(])((?:\/\/)[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?)/gi;
    while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
    re = /["']?(?:file|src|source|hls\d*|url|link|stream|playlist|dash|hlsManifestUrl|hlsMasterPlaylistUrl)["']?\s*[:=]\s*["']([^"']+)["']/gi;
    while ((m = re.exec(t)) != null) addMediaCandidate(out, m[1], label, ref, base);
  }
  return out;
}
function extractPackedSources(html, pageUrl, label) {
  const out = [], base = originOf(pageUrl) + "/";
  if (!html) return out;
  const texts = [String(html)].concat(unpackAll(html));
  for (const raw of texts) {
    const t = normalizeMediaText(raw);
    const pats = [
      /(?:["']?hls\d*["']?|["']?file["']?)\s*[:=]\s*["']((?:https?:\/\/|\/)[^"']+\.m3u8[^"']*)["']/gi,
      /(?:file|src)\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi,
      /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
      /player\.src\(\s*["']([^"']+)["']/gi,
      /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi,
      /https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/gi
    ];
    for (const re of pats) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t)) != null) {
        const u = m[1] || m[0];
        if (!u || u.length < 8) continue;
        addMediaCandidate(out, absUrl(u, base), label, pageUrl, base);
        if (out.length >= 10) return out;
      }
    }
    if (out.length) return out;
  }
  return out;
}

function unwrapEmbedUrl(url) {
  const u = cleanUrl(url), m = /[?&]v=([^&]+)/.exec(u);
  if (m) {
    const real = cleanUrl(b64decode(dec(m[1])));
    if (/^https?:\/\//i.test(real) && real !== u) return real;
  }
  return u;
}

/* ================================================================== */
/* extractores                                                         */
/* ================================================================== */

const VOE_LUT = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
function voeDecodeWith(e, lut) {
  let t = rot13(e);
  for (const l of lut) t = t.split(l).join("");
  const s = b64decode(t);
  let u = "";
  for (let i = 0; i < s.length; i++) u += String.fromCharCode(s.charCodeAt(i) - 3);
  return parseJson(b64decode(u.split("").reverse().join("")));
}
async function voeFromHtml(R, h, pageUrl, label) {
  const ref = originOf(pageUrl) + "/";
  let out = [];
  const m = /json">\s*\[\s*"([^"]+)"\s*\]\s*<\/script>\s*(?:<script[^>]+src="([^"]+)")?/i.exec(h || "");
  if (!m) {
    const re = /['"](hls|mp4)['"]\s*:\s*['"]([^'"]+)['"]/gi;
    let mm;
    while ((mm = re.exec(h || "")) != null) {
      let v = mm[2];
      if (!/^https?:/i.test(v)) { const d = b64decode(v); if (/^https?:/i.test(d)) v = d; }
      addSrc(out, mkSrc(v, label, ref, mm[1].toLowerCase() === "mp4" ? "mp4" : "hls"));
    }
    if (!out.length) out = scanMedia(h, label, ref, pageUrl);
    return out;
  }
  const luts = [];
  if (m[2]) {
    const js = await httpGet(R, absUrl(m[2], pageUrl), pageUrl);
    const lm = /(\[(?:'\W{2}'[,\]]){1,9})/.exec(js || "");
    if (lm) { const arr = lm[1].slice(2, -2).split("','"); if (arr.length) luts.push(arr); }
  }
  luts.push(VOE_LUT);
  for (const lut of luts) {
    let o = null;
    try { o = voeDecodeWith(m[1], lut); } catch (e) { /* ignore */ }
    if (o) {
      for (const k in o) {
        const v = o[k];
        if (typeof v !== "string" || !/^https?:\/\//i.test(v)) continue;
        if (/direct_access|mp4/i.test(k) || /\.mp4(?:[?#]|$)/i.test(v)) addSrc(out, mkSrc(v, label + " MP4", ref, "mp4"));
        else if (/^(?:source|hls|file|url|src)$/i.test(k)) addSrc(out, mkSrc(v, label, ref, "hls"));
      }
      if (out.length) return out;
    }
  }
  return out;
}
async function exVoe(R, url, label, ref) {
  let h = await httpGet(R, url, ref), cur = url;
  for (let tries = 0; h && tries < 3; tries++) {
    const out = await voeFromHtml(R, h, cur, label);
    if (out.length) return out;
    const m = /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i.exec(h);
    if (!m || /^(?:#|javascript)/i.test(m[1])) break;
    const prev = cur;
    cur = absUrl(m[1], cur);
    h = await httpGet(R, cur, prev);
  }
  return [];
}
async function exPackerFamily(R, url, label, ref, mirrors) {
  const path = String(url || "").replace(/^https?:\/\/[^\/]+/i, "").replace(/\/v\//i, "/e/");
  const hosts = uniq([hostOf(url)].concat(mirrors || []));
  for (const h of hosts) {
    if (!budgetLeft(R)) break;
    const u = "https://" + h + path;
    const html = await httpGet(R, u, ref || "https://" + h + "/");
    if (!html || html.length < 300) continue;
    let out = extractPackedSources(html, u, label);
    if (!out.length) out = scanMedia(html, label, u, u);
    if (out.length) return out;
  }
  return [];
}
const WISH_MIRRORS = ["swdyu.com", "streamwish.to", "strwish.com", "flaswish.com", "sfastwish.com", "hlswish.com", "playerwish.com"];
const VIDHIDE_MIRRORS = ["callistanise.com", "filelions.to", "vidhideplus.com", "vidhidefast.com", "morencius.com", "hglink.to"];
const MOON_MIRRORS = ["filemoon.sx", "filemoon.to", "filemoon.site", "bysejikuar.com"];
async function exMixdrop(R, url, label, ref) {
  const u = String(url || "").replace(/\/f\//, "/e/").replace(/^(https?:\/\/[^\/]+\/e\/[^\/?#]+).*$/, "$1");
  const base = "https://" + hostOf(u) + "/";
  const html = await httpGet(R, u, ref || base);
  if (!html) return [];
  let m = null;
  for (const t of [html].concat(unpackAll(html))) { m = /wurl\s*=\s*["']([^"']+)["']/.exec(t); if (m) break; }
  if (!m) return scanMedia(html, label, base, u);
  let v = cleanUrl(m[1]);
  if (v.indexOf("//") === 0) v = "https:" + v;
  const s = mkSrc(v, label || "MixDrop", base, "mp4");
  return s ? [s] : [];
}
async function exStreamTape(R, url, label) {
  const h = await httpGet(R, url, url);
  let m = /robotlink'\)\.innerHTML\s*=\s*'(.+?)'\s*\+\s*\('(.+?)'\)/i.exec(h || "");
  if (m) { const s = mkSrc("https:" + m[1] + m[2].substring(3), label, "https://streamtape.com/", "mp4"); return s ? [s] : []; }
  m = /get_video\?id=[^"'\s]+/.exec(h || "");
  if (m) { const s = mkSrc("https://" + hostOf(url) + "/" + m[0].replace(/amp;/g, ""), label, originOf(url) + "/", "mp4"); return s ? [s] : []; }
  return [];
}
async function exUqload(R, url, label) {
  let u = String(url || "");
  if (u.indexOf(".html") < 0) u += ".html";
  const h = await httpGet(R, u, url), m = /sources\s*:\s*\[([^\]]+)\]/i.exec(h || "");
  const out = [];
  if (!m) return out;
  for (const p of m[1].replace(/\\"/g, "").replace(/"/g, "").split(",")) addSrc(out, mkSrc(clean(p), label, "https://uqload.com/", "mp4"));
  return out;
}
async function exDood(R, url, label) {
  const host = hostOf(url) || "dood.wf";
  const id = (String(url).split("/e/")[1] || String(url).split("/d/")[1] || "").split(/[?#]/)[0];
  if (!id) return [];
  const base = "https://" + host;
  const h = await httpGet(R, base + "/e/" + id, base + "/"), m = /\/pass_md5\/[^'"]*/.exec(h || "");
  if (!m) return extractPackedSources(h || "", url, label);
  const body = await httpGet(R, base + m[0], base + "/e/" + id);
  if (!body || body.length > 1000) return [];
  const tok = m[0].split("/").pop() || "", chs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let rnd = "";
  for (let i = 0; i < 10; i++) rnd += chs.charAt(Math.floor(Math.random() * chs.length));
  const s = mkSrc(body + rnd + "?token=" + tok + "&expiry=" + Date.now(), label, base + "/", "mp4");
  return s ? [s] : [];
}

/* ---- OK.ru ---- */
function okParseMetaSync(h) {
  if (!h) return null;
  const m = /data-options=(?:"([^"]*)"|'([^']*)')/i.exec(h);
  let meta = null;
  if (m) {
    const o = parseJson(htmlUnescape(m[1] != null ? m[1] : m[2]));
    const fv = o && o.flashvars;
    if (fv) {
      meta = fv.metadata;
      if (typeof meta === "string") meta = parseJson(htmlUnescape(meta));
      if (!meta && fv.metadataUrl) meta = { _metadataUrl: String(fv.metadataUrl).replace(/\\u0026/g, "&").replace(/\\\//g, "/") };
    }
  }
  if (!meta) {
    const t = htmlUnescape(h).replace(/\\u0026/gi, "&").replace(/\\u002F/gi, "/").replace(/\\u003A/gi, ":").replace(/\\\//g, "/").replace(/\\"/g, '"');
    const mm = /"metadata"\s*:\s*"(\{[\s\S]*?\})"/.exec(t);
    if (mm) meta = parseJson(mm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    if (!meta) {
      const hls = /"hlsManifestUrl"\s*:\s*"([^"]+)"/i.exec(t), vids = [];
      const vr = /"name"\s*:\s*"(mobile|lowest|low|sd|hd|full|quad|ultra)"\s*,\s*"url"\s*:\s*"([^"]+)"/gi;
      let vm;
      while ((vm = vr.exec(t)) != null) vids.push({ name: vm[1], url: vm[2].replace(/\\u0026/gi, "&").replace(/\\\//g, "/") });
      if (hls || vids.length) meta = { hlsManifestUrl: hls ? hls[1].replace(/\\u0026/gi, "&").replace(/\\\//g, "/") : "", videos: vids };
    }
  }
  return meta;
}
async function okParseMeta(R, h) {
  let meta = okParseMetaSync(h);
  if (meta && meta._metadataUrl) {
    let mu = meta._metadataUrl;
    if (mu.indexOf("//") === 0) mu = "https:" + mu;
    meta = parseJson(await httpGet(R, mu, "https://ok.ru/")) || parseJson(await httpPost(R, mu, "", "https://ok.ru/"));
  }
  return meta;
}
function okruQualityRank(name) {
  const s = String(name || "").toLowerCase();
  if (/2160p|4k|ultra/.test(s)) return 100;
  if (/1440p|quad/.test(s)) return 90;
  if (/1080p|full.?hd|full/.test(s)) return 80;
  if (/720p|\bhd\b/.test(s)) return 60;
  if (/480p|sd/.test(s)) return 40;
  if (/360p|low/.test(s)) return 25;
  if (/240p/.test(s)) return 15;
  if (/144p|mobile|lowest/.test(s)) return 5;
  if (/\bhls\b/.test(s)) return 70;
  return 30;
}
const okruSort = (srcs) => srcs.sort((a, b) => okruQualityRank(b.name) - okruQualityRank(a.name));
function okruSourcesFromMeta(meta, label) {
  const srcs = [];
  if (!meta) return srcs;
  const lab = label || "OK.ru", vids = (meta.videos || []).slice(0);
  vids.sort((a, b) => (OK_RANK[b.name] || 0) - (OK_RANK[a.name] || 0));
  for (const v of vids) {
    const vu = v && v.url ? cleanUrl(String(v.url).replace(/\\u0026/gi, "&").replace(/\\\//g, "/")) : "";
    if (!vu) continue;
    const s = mkSrcBare(vu, lab + " " + (OK_LABEL[v.name] || v.name || "MP4"), "mp4");
    if (s) srcs.push(s);
    if (srcs.length >= 3) break;
  }
  let hls = meta.hlsManifestUrl || meta.hlsMasterPlaylistUrl || meta.ondemandHls || "";
  if (hls) {
    hls = cleanUrl(String(hls).replace(/\\u0026/gi, "&").replace(/\\\//g, "/"));
    const s = mkSrcBare(hls, lab + " HLS", "hls");
    if (s) srcs.push(s);
  }
  return okruSort(srcs);
}
function okHeaders(R) {
  const h = {};
  if (R.env.OKRU_COOKIE) h["Cookie"] = R.env.OKRU_COOKIE;
  return h;
}
async function exOkRu(R, url, label) {
  const id = (String(url).match(/(?:videoembed|video|live)\/(\d+)/) || String(url).match(/[?&](?:id|mid)=(\d+)/) || [])[1];
  if (!id) return [];
  const tries = [["https://ok.ru/videoembed/" + id, true], ["https://ok.ru/videoembed/" + id, false], ["https://ok.ru/video/" + id, false]];
  for (const [u, auth] of tries) {
    if (!budgetLeft(R)) break;
    const h = await httpGet(R, u, "https://ok.ru/", auth ? okHeaders(R) : null);
    if (!h) continue;
    const meta = await okParseMeta(R, h);
    const out = okruSourcesFromMeta(meta, label || "OK.ru");
    if (out.length) return out;
  }
  return [];
}

/* ---- series player (Juanita) / proxy player (Poseidon, Cuevana) ---- */
function encodePlayerUrl(url) {
  url = String(url || "").replace(/&amp;/g, "&");
  const m = /^(https?:\/\/[^?]+\?id=)(.+)$/i.exec(url);
  if (!m) return url;
  try { return m[1] + encodeURIComponent(decodeURIComponent(m[2])).replace(/%2F/gi, "/").replace(/%20/g, "+"); } catch (e) { return m[1] + encodeURIComponent(m[2]).replace(/%2F/gi, "/"); }
}
async function exSeriesPlayer(R, url, label, ref) {
  const raw = String(url || "").replace(/&amp;/g, "&");
  const tries = uniq([encodePlayerUrl(raw), raw]);
  for (const u of tries) {
    if (!budgetLeft(R)) break;
    const html = await httpGet(R, u, ref || JUANITA + "/");
    if (!html || /ID no v[\u00e1a]lido/i.test(html)) continue;
    const out = [];
    const t = normalizeMediaText(html);
    const re = /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
    let m;
    while ((m = re.exec(t)) != null) addMediaCandidate(out, m[0], (label || "Juanita") + " HLS", u, originOf(u));
    if (out.length) return out;
    const sm = scanMedia(html, label || "Juanita", u, u);
    if (sm.length) return sm;
  }
  return [];
}
function discoverLinks(html, pageUrl) {
  const out = [];
  const add = (x) => {
    x = cleanUrl(x);
    if (!x) return;
    x = absUrl(x, pageUrl);
    if (!/^https?:\/\//i.test(x) || x === pageUrl) return;
    if (out.indexOf(x) < 0 && out.length < 12) out.push(x);
  };
  for (const t of findTags(html, /^<iframe\b/i)) { const a = attrsOf(t.tag); add(a["data-src"] || a["src"] || ""); }
  let m, re = /(?:location(?:\.href)?|window\.location(?:\.href)?)\s*=\s*["']([^"']+)["']/gi;
  while ((m = re.exec(html)) != null) add(m[1]);
  re = /var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
  while ((m = re.exec(html)) != null) add(m[1]);
  re = /data-(?:video|link|url|tr|server|embed-url)=["']([^"']+)["']/gi;
  while ((m = re.exec(html)) != null) {
    let u = m[1];
    if (!/^https?:|^\//.test(u)) { const d = b64decode(u.split("?v=")[1] || u); if (/^https?:\/\//i.test(d)) u = d; }
    add(u);
  }
  re = /https?:\/\/[a-z0-9._-]+\/(?:e|v|embed|d|f)\/[a-zA-Z0-9_-]+/gi;
  while ((m = re.exec(html)) != null) add(m[0]);
  re = /https?:\/\/[^\s"'<>\\]+/gi;
  while ((m = re.exec(html)) != null) { if (isServerUrl(m[0]) && !/\.(?:js|css|png|jpe?g|gif|svg|ico|woff2?)(?:[?#]|$)/i.test(m[0])) add(m[0]); }
  return out;
}
async function exProxyPlayer(R, url, label, ref) {
  const html = await httpGet(R, url, ref || originOf(url) + "/");
  if (!html) return [];
  const links = [], seen = new Set();
  let m, re = /var\s+url\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
  while ((m = re.exec(html)) != null) { const u = cleanUrl(m[1]); if (u && !seen.has(u)) { seen.add(u); links.push(u); } }
  re = /(?:window\.)?location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi;
  while ((m = re.exec(html)) != null) { const u = cleanUrl(m[1]); if (u && !seen.has(u)) { seen.add(u); links.push(u); } }
  for (const u of discoverLinks(html, url)) if (!seen.has(u)) { seen.add(u); links.push(u); }
  const out = [];
  for (const l of links.slice(0, 5)) {
    if (!budgetLeft(R) || out.length >= 3) break;
    if (/player\.cuevana3|player\.poseidonhd2/i.test(hostOf(l))) continue;
    for (const s of await resolveEmbed(R, l, label, url, 1)) addSrc(out, s);
    if (out.length) break;
  }
  return out.length ? out : scanMedia(html, label, url, url);
}
async function exGeneric(R, url, label, ref, depth) {
  const h = await httpGet(R, url, ref || originOf(url) + "/");
  if (!h) return [];
  let out = scanMedia(h, label, url, url);
  if (out.length) return out;
  out = await voeFromHtml(R, h, url, label);
  if (out.length || depth >= 3) return out;
  for (const l of discoverLinks(h, url)) {
    if (!budgetLeft(R) || out.length >= 6) break;
    for (const s of await resolveEmbed(R, l, label, url, depth + 1)) addSrc(out, s);
  }
  return out;
}

/* ---- VK ---- */
async function exVk(R, url, label, ref) {
  let u = cleanUrl(url);
  const m = /video(-?\d+)_(\d+)/.exec(u);
  if (u.indexOf("video_ext.php") < 0 && m) u = "https://vk.com/video_ext.php?oid=" + m[1] + "&id=" + m[2] + ((/[?&]hash=([0-9a-f]+)/i.exec(u) || [])[0] || "").replace(/^\?/, "&");
  const RF = hostOf(u).indexOf("vkvideo") >= 0 ? "https://vkvideo.ru/" : "https://vk.com/";
  const h = await httpGet(R, u, ref || RF), out = [];
  if (!h) return out;
  const list = [];
  let k, re = /"url(\d{3,4})"\s*:\s*"([^"]+)"/g;
  while ((k = re.exec(h)) != null) list.push({ q: parseInt(k[1], 10), u: k[2] });
  list.sort((a, b) => b.q - a.q);
  const hl = /"(?:hls|hls_ondemand)"\s*:\s*"([^"]+)"/i.exec(h);
  if (hl) addSrc(out, mkSrc(hl[1], label + " HLS", RF, "hls"));
  for (const l of list) addSrc(out, mkSrc(l.u, label + " " + l.q + "p", RF, "mp4"));
  return out;
}

/* ---- Vimeo ---- */
function vimeoSources(cfg, label) {
  const out = [], RF = "https://player.vimeo.com/", files = cfg && cfg.request && cfg.request.files;
  if (!files) return out;
  if (files.hls) {
    const cdns = files.hls.cdns || {}, def = files.hls.default_cdn;
    let c = cdns[def] || null;
    if (!c) for (const k in cdns) { c = cdns[k]; break; }
    const hu = (c && (c.url || c.avc_url)) || files.hls.url || "";
    if (hu) addSrc(out, mkSrc(hu, label + " HLS", RF, "hls"));
  }
  const pr = (files.progressive || []).slice(0).sort((a, b) => (b.height || 0) - (a.height || 0));
  for (const p of pr) if (p.url) addSrc(out, mkSrc(p.url, label + " " + (p.quality || p.height || "MP4"), RF, "mp4"));
  return out;
}
async function exVimeo(R, url, label, ref) {
  const id = (/(?:player\.vimeo\.com\/video|vimeo\.com)\/(?:video\/)?(\d+)/.exec(url) || [])[1];
  if (!id) return [];
  const hash = (/[?&]h=([0-9a-f]+)/i.exec(url) || /vimeo\.com\/\d+\/([0-9a-f]{8,})/i.exec(url) || [])[1] || "";
  const refs = uniq([ref || "", ref ? originOf(ref) + "/" : "", "https://player.vimeo.com/"]), q = hash ? "?h=" + hash : "";
  for (const rf of refs) {
    if (!budgetLeft(R)) break;
    let cfg = parseJson(await httpGet(R, "https://player.vimeo.com/video/" + id + "/config" + q, rf || "https://player.vimeo.com/"));
    if (!cfg) {
      const page = await httpGet(R, "https://player.vimeo.com/video/" + id + q, rf || "https://player.vimeo.com/");
      cfg = jsonAfter(page, "playerConfig = ") || jsonAfter(page, "playerConfig=") || jsonAfter(page, "var config = ");
    }
    const out = vimeoSources(cfg, label);
    if (out.length) return out;
  }
  return [];
}
function jsonAfter(text, marker) {
  text = String(text || "");
  const i = text.indexOf(marker);
  if (i < 0) return null;
  let depth = 0, inStr = false, q = "", esc = false, start = -1;
  for (let j = i + marker.length; j < text.length && j < i + 400000; j++) {
    const ch = text.charAt(j);
    if (start < 0) { if (ch === "{") { start = j; depth = 1; } continue; }
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === q) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return parseJson(text.substring(start, j + 1)); }
  }
  return null;
}

/* ---- PlusVip / Esplay / Fastream ---- */
async function exPlusVip(R, url, label) {
  const h = await httpGet(R, url, "https://plusvip.net/"), m = /['"]\/sources\/([^'"]+)/i.exec(h || "");
  if (!m) return [];
  const linkPart = String(url).split("?data=")[1] || "", out = [];
  const b = await httpPost(R, "https://plusvip.net/sources/" + m[1], "link=" + enc(linkPart), url), x = /\{link:\s*([^}]+)\}/i.exec(b || "");
  if (x) addSrc(out, mkSrc(x[1].replace(/\\/g, ""), label, "https://plusvip.net/"));
  return out;
}
async function exEsplay(R, url, label) {
  let id = String(url).split("#")[1] || (String(url).match(/[?&](?:id|v)=([A-Za-z0-9_-]+)/) || [])[1] || "";
  if (!id) { const pm = String(url).match(/\/(?:video|player)\/([A-Za-z0-9_-]+)/i); if (pm) id = pm[1]; }
  if (!id) return [];
  const bases = ["https://api.mycdn.moe/video/", "https://api.mycdn.moe/player/?id=", "https://pelisplus.esplay.one/video/", "https://pelisplus.esplay.io/video/"], ref = "https://pelisplus.esplay.io/";
  for (const b0 of bases) {
    if (!budgetLeft(R)) break;
    const b = await httpGet(R, b0 + id, ref);
    if (!b) continue;
    const d = parseJson(b);
    if (d) {
      const s = mkSrc(d.file || d.url || d.source || (d.data && (d.data.file || d.data.url)) || "", label, ref);
      if (s) return [s];
    }
    const media = scanMedia(b, label, ref, ref);
    if (media.length) return media;
  }
  return [];
}
async function exFastream(R, url, label) {
  const n = String(url).indexOf("embed-") >= 0 ? (String(url).split("embed-").pop() || "").replace(".html", "") : (String(url).split("html?").pop() || "");
  if (!n) return [];
  const h = await httpPost(R, "https://fastream.to/dl", "op=embed&file_code=" + enc(n) + "&auto=1&referer=", "https://fastream.to/emb.html?" + n, { Origin: "https://fastream.to" });
  return scanMedia(h, label, "https://fastream.to/", "https://fastream.to/");
}

/* ---- familias Streamflix ---- */
async function exFileSources(R, url, label, ref) {
  const base = "https://" + hostOf(url) + "/", html = await httpGet(R, url, ref || base);
  let out = [];
  if (!html) return out;
  for (const raw of [html].concat(unpackAll(html))) {
    const t = normalizeMediaText(raw);
    let m, re = /player\.src\(\s*["']([^"']+)["']/gi;
    while ((m = re.exec(t)) != null) { const v = absUrl(cleanUrl(m[1]), base); addSrc(out, mkSrc(v, label, base) || mkSrc(v, label, base, "mp4")); }
    re = /<source[^>]+src=["']([^"']+)["']/gi;
    while ((m = re.exec(t)) != null) { const v = absUrl(cleanUrl(m[1]), base); addSrc(out, mkSrc(v, label, base) || mkSrc(v, label, base, "mp4")); }
  }
  if (out.length) return out;
  out = scanMedia(html, label, base, url);
  if (!out.length) out = await voeFromHtml(R, html, url, label);
  return out;
}
async function exSfJwFamily(R, url, label, ref) {
  const html = await httpGet(R, url, ref || originOf(url) + "/");
  if (!html) return [];
  let out = extractPackedSources(html, url, label || hostOf(url));
  if (!out.length) out = scanMedia(html, label || hostOf(url), url, url);
  return out;
}
async function exSfNuupload(R, url, label, ref) {
  const u = unwrapEmbedUrl(url);
  if (u !== url && /^https?:/i.test(u)) return resolveEmbed(R, u, label || "Nuupload", ref, 1);
  const html = await httpGet(R, url, ref || originOf(url) + "/");
  if (!html) return [];
  let out = extractPackedSources(html, url, label || "Nuupload");
  if (!out.length) for (const l of discoverLinks(html, url)) { out = await resolveEmbed(R, l, label || "Nuupload", url, 1); if (out.length) break; }
  return out;
}
async function exSfDood(R, url, label, ref) {
  const m = /\/(?:e|d)\/([a-zA-Z0-9]+)/i.exec(url || "");
  if (!m) return extractPackedSources((await httpGet(R, url, ref || originOf(url) + "/")) || "", url, label || "Dood");
  const id = m[1], hosts = uniq([hostOf(url)].concat(SF_ALL_HOSTS.dood));
  for (const hh of hosts) {
    if (!budgetLeft(R)) break;
    const base = "https://" + hh, u = base + "/e/" + id, html = await httpGet(R, u, ref || base + "/");
    if (!html) continue;
    const pass = (/\/pass_md5\/([^"']+)/i.exec(html) || [])[0];
    if (!pass) { const o = extractPackedSources(html, u, label || "Dood"); if (o.length) return o; continue; }
    const body = await httpGet(R, base + pass, u);
    if (!body || body.length > 1000) continue;
    const tok = pass.split("/").pop() || "", chs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let rnd = "";
    for (let i = 0; i < 10; i++) rnd += chs.charAt(Math.floor(Math.random() * chs.length));
    const s = mkSrc(body + rnd + "?token=" + tok + "&expiry=" + Date.now(), label || "Dood", base + "/", "mp4");
    if (s) return [s];
  }
  return [];
}

/* ---- resolveEmbed completo ---- */
async function resolveEmbed(R, url, label, ref, depth) {
  depth = depth || 0;
  try {
    url = cleanUrl(url);
    if (!/^https?:\/\//i.test(url) || depth > 3 || !budgetLeft(R)) return [];
    const un = unwrapEmbedUrl(url);
    if (un !== url) return resolveEmbed(R, un, label, ref, depth + 1);
    const h = hostOf(url);
    if (isDirectMediaUrl(url)) {
      const t = inferMediaType(url), d = mkSrc(url, label || (t === "hls" ? "HLS" : "Video"), ref, t);
      if (d) return [d];
    }
    if (hostMatches(h, UNSUPPORTED)) return [];
    if (/fortamomar\.workers\.dev$|seriesplayer\.|onfilom\.com$|playspelis\.com$|321moviesfree\.com$|flixlat\.com$/i.test(h)) {
      if (/\.m3u8/i.test(url)) { const s = mkSrc(url, label || "Juanita HLS", ref || "https://seriesplayer.fortamomar.workers.dev/", "hls"); return s ? [s] : []; }
      if (inferMediaType(url) === "mp4") { const s = mkSrc(url, label || "Juanita MP4", ref, "mp4"); return s ? [s] : []; }
      return exSeriesPlayer(R, url, label, ref);
    }
    if (/player\.cuevana3|player\.poseidonhd2/i.test(h) || /\/player\.php\?/i.test(url)) return exProxyPlayer(R, url, label, ref);

    const fam = sfMatchFamily(h);
    if (hostIn(h, MIX_HOSTS) || fam === "mixdrop") return exMixdrop(R, url, label, ref);
    if (hostIn(h, WISH_HOSTS) || fam === "wish" || /streamwish|swdyu|strwish|hlswish|wishembed|awish|embedwish|flaswish|sfastwish|playerwish|dwish|mwish|vidwish|wishfast/i.test(h))
      return exPackerFamily(R, url, label || "StreamWish", ref, WISH_MIRRORS);
    if (fam === "filemoon" || hostIn(h, MOON_HOSTS) || /filemoon|bysejikuar|moonmov|kerapoxy/i.test(h))
      return exPackerFamily(R, url, label || "Filemoon", ref, MOON_MIRRORS.concat(SF_ALL_HOSTS.filemoon));
    if (isPackerFamily(h) || fam === "vidhide" || /filelions|callistanise|morencius|hglink|vidhide|moon/i.test(h)) {
      const vh = await exPackerFamily(R, url, label || "VidHide", ref, VIDHIDE_MIRRORS);
      if (vh.length) return vh;
      const fs = await exFileSources(R, url, label, ref);
      if (fs.length) return fs;
      return extractPackedSources((await httpGet(R, url, ref || originOf(url) + "/")) || "", url, label);
    }
    if (/vimeus\.|goodstream\./i.test(h)) {
      const vg = extractPackedSources((await httpGet(R, url, ref || originOf(url) + "/")) || "", url, label || "Vimeus");
      if (vg.length) return vg;
      return exGeneric(R, url, label, ref, depth);
    }
    if (h.indexOf("voe.") >= 0 || hostIn(h, VOE_HOSTS) || fam === "voe") return exVoe(R, url, label, ref);
    if (/(?:^|\.)(?:vk\.com|vkvideo\.ru|vk\.ru)$/.test(h)) return exVk(R, url, label, ref);
    if (h.indexOf("vimeo.com") >= 0) return exVimeo(R, url, label, ref);
    if (h.indexOf("uqload.") >= 0 || hostIn(h, UQLOAD_HOSTS) || fam === "uqload") return exUqload(R, url, label);
    if (h.indexOf("streamtape.") >= 0 || /(?:^|\.)tape\./.test(h) || hostIn(h, TAPE_HOSTS) || fam === "streamtape") return exStreamTape(R, url, label);
    if (h.indexOf("dood") >= 0 || /d[o]{3,}d/.test(h) || hostIn(h, DOOD_HOSTS) || fam === "dood") return exSfDood(R, url, label, ref);
    if (h.indexOf("plusvip.") >= 0) return exPlusVip(R, url, label);
    if (h.indexOf("esplay.") >= 0) return exEsplay(R, url, label);
    if (h.indexOf("fastream.") >= 0) return exFastream(R, url, label);
    if (h === "ok.ru" || h.indexOf(".ok.ru") >= 0 || h.indexOf("odnoklassniki") >= 0 || fam === "okru") return exOkRu(R, url, label);
    if (fam === "nupload") return exSfNuupload(R, url, label, ref);
    if (hostIn(h, FILE_HOSTS)) return exFileSources(R, url, label, ref);
    if (fam) {
      const o = await exSfJwFamily(R, url, label || fam, ref);
      if (o.length) return o;
    } else if (/\/(?:e|v|embed|d|f|file|watch)\//i.test(url) || /player|stream|vid|embed|watch|play/i.test(h)) {
      const o = await exSfJwFamily(R, url, label || h, ref);
      if (o.length) return o;
    }
    return exGeneric(R, url, label, ref, depth);
  } catch (e) {
    log(R, "resolveEmbed ERROR " + String(url).substring(0, 80) + " -> " + e);
    return [];
  }
}

/* ================================================================== */
/* idioma / candidatos                                                 */
/* ================================================================== */

function langOf(t) {
  t = normalizeTitle(t);
  if (/\bsub|subtitul|vose|vos\b/.test(t)) return "Subtitulado";
  if (/castell|espana|\besp\b|\bcast\b/.test(t)) return "Castellano";
  if (/latin|\blat\b|\bmx\b|mexic|argent/.test(t)) return "Latino";
  if (/ingles|english|\ben\b|\beng\b/.test(t)) return "Ingles";
  return "";
}
const langRank = (l) => (l === "Latino" ? 0 : l === "Subtitulado" ? 1 : l === "Castellano" ? 2 : 3);
function prettyHost(u) {
  const h = hostOf(u).replace(/^www\./, "").split(".");
  return h.length > 1 ? h[h.length - 2] : h[0] || "server";
}
const mkCand = (url, lang, ref, prov) => ({ url, lang: lang || "", ref: ref || "", prov: prov || "" });

function candPri(u) {
  u = String(u || "");
  if (/fortamomar|seriesplayer/i.test(u)) return 0;
  if (/onfilom|playspelis|flixlat|321moviesfree/i.test(u)) return 1;
  if (/vimeus|goodstream/i.test(u)) return 2;
  if (/streamtape|voe\.|uqload/i.test(u)) return 3;
  if (/player\.php/i.test(u)) return 4;
  if (/streamwish|swdyu|filemoon|vidhide|callistanise|morencius/i.test(u)) return 6;
  return 5;
}
/* resuelve candidatos (en paralelo, de a 4) y los agrega a out. Devuelve cuantos candidatos dieron fuentes. */
async function resolveCands(R, cands, out, prov) {
  const seen = new Set(), list = [];
  cands.forEach((c, i) => {
    const k = c.srcs ? "srcs" + i : c.url;
    if (!k || seen.has(k)) return;
    seen.add(k); list.push(c);
  });
  list.sort((a, b) => candPri(a.url) - candPri(b.url) || langRank(a.lang) - langRank(b.lang));
  let good = 0;
  const batch = list.slice(0, MAX_CAND);
  for (let i = 0; i < batch.length && budgetLeft(R); i += 4) {
    const part = batch.slice(i, i + 4);
    const results = await Promise.all(part.map(async (c) => {
      const label = (c.lang ? c.lang + " \u00b7 " : "") + prov + " \u00b7 " + (c.url ? prettyHost(c.url) : "directo");
      let got = [];
      if (c.srcs) {
        got = c.srcs.map((s) => {
          const orig = s.name || "";
          if (/^(OK\.ru|Odysee|Dailymotion|Archive\.org)\b/i.test(orig)) return s;
          s.name = label + (orig ? " " + orig.replace(/^OK\.ru/, "") : "");
          return s;
        });
      } else {
        got = await withTimeout(resolveEmbed(R, c.url, label, c.ref || originOf(c.url) + "/", 0), 12000, []);
        for (const s of got) if (!s.name || s.name.indexOf(prov) < 0) s.name = label;
      }
      log(R, "  " + label + " [" + String(c.url || "").substring(0, 120) + "] -> " + got.length);
      return got;
    }));
    for (const got of results) {
      const before = out.length;
      for (const s of got) addSrc(out, s);
      if (out.length > before) good++;
    }
  }
  return good;
}

/* ================================================================== */
/* TMDB                                                                */
/* ================================================================== */

async function tmdbGet(R, path, lang) {
  const key = path + "|" + (lang || "es-AR");
  if (R.tmdbCache.has(key)) return R.tmdbCache.get(key);
  const url = TMDB_API + path + (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + enc(R.tmdbKey) + "&language=" + (lang || "es-AR");
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cf: { cacheTtl: 3600, cacheEverything: true } });
    const j = r.ok ? await r.json() : null;
    if (j) R.tmdbCache.set(key, j);
    return j;
  } catch (e) { log(R, "TMDB " + path + " -> " + e); return null; }
}
const img = (p, base) => (p ? (base || TMDB_IMG) + p : "");
const ALT_COUNTRIES = new Set(["ES", "MX", "AR", "CO", "CL", "PE", "VE", "US", "UY", "EC", "BO", "CR", "PA", "GT", "HN", "NI", "SV", "DO", "PR"]);
const pickTitle = (o) => (o ? clean(o.title || o.name || "") : "");

function buildCtx(p, es, en, altData, extIds, base, mx, trData) {
  const titleEn = pickTitle(en) || pickTitle(base);
  const titleOrig = clean((base && (base.original_title || base.original_name)) || "") || titleEn;
  const titleAr = pickTitle(es), titleMx = pickTitle(mx);
  let titleEs = titleMx || titleAr || titleEn;
  const nOrig = normalizeTitle(titleOrig), nEn = normalizeTitle(titleEn);
  if (titleAr && titleMx && normalizeTitle(titleAr) !== normalizeTitle(titleMx)) {
    titleEs = normalizeTitle(titleAr) !== nOrig && normalizeTitle(titleAr) !== nEn ? titleAr : titleMx;
  } else if (titleAr && normalizeTitle(titleAr) !== nOrig && normalizeTitle(titleAr) !== nEn) titleEs = titleAr;

  const ctx = {
    kind: p.kind, id: p.id, season: p.season || 1, episode: p.episode || 1,
    titleEs, titleEn, titleOrig,
    year: yearOf(base.release_date || base.first_air_date),
    imdbId: (extIds && extIds.imdb_id) || ""
  };
  const known = new Set([ctx.titleEs, ctx.titleEn, ctx.titleOrig, titleAr, titleMx].map(normalizeTitle));
  const alts = [];
  const pushAlt = (t) => { const n = normalizeTitle(t); if (n && !known.has(n)) { known.add(n); alts.push(clean(t)); } };
  if (titleMx) pushAlt(titleMx);
  if (titleAr) pushAlt(titleAr);
  for (const it of (altData && (altData.titles || altData.results)) || []) {
    if (it && (it.title || it.name) && ALT_COUNTRIES.has(it.iso_3166_1)) pushAlt(it.title || it.name);
  }
  for (const tr of (trData && trData.translations) || []) {
    const iso = String(tr.iso_3166_1 || "").toUpperCase(), lang = String(tr.iso_639_1 || "").toLowerCase();
    if (lang !== "es" && !ALT_COUNTRIES.has(iso)) continue;
    if (lang && lang !== "es" && lang !== "en") continue;
    if (lang === "es" || ALT_COUNTRIES.has(iso)) pushAlt((tr.data && (tr.data.title || tr.data.name)) || "");
  }
  ctx.altTitles = alts.slice(0, 8);
  return ctx;
}
function absEpisode(ctx) {
  if (ctx.kind !== "tv") return 0;
  const s = ctx.season, e = ctx.episode, counts = ctx.seasonCounts || {};
  let abs = e;
  for (let i = 1; i < s; i++) abs += parseInt(counts[i], 10) || 0;
  return abs;
}
async function loadCtx(R, kind, id, season, episode) {
  const isTv = kind === "tv", path = (isTv ? "/tv/" : "/movie/") + id;
  const [es, en, altData, extIds, mx, trData] = await Promise.all([
    tmdbGet(R, path, "es-AR"), tmdbGet(R, path, "en-US"), tmdbGet(R, path + "/alternative_titles", "en-US"),
    tmdbGet(R, path + "/external_ids", "en-US"), tmdbGet(R, path, "es-MX"), tmdbGet(R, path + "/translations", "en-US")
  ]);
  const base = es || mx || en;
  if (!base) return null;
  const ctx = buildCtx({ kind, id: String(id), season, episode }, es, en, altData, extIds, base, mx, trData);
  ctx.base = base;
  ctx.runtime = isTv ? 0 : (parseInt(base.runtime, 10) || 0) * 60; /* segundos, solo peliculas */
  if (isTv) {
    const sc = {};
    for (const s of (es && es.seasons) || (mx && mx.seasons) || (en && en.seasons) || base.seasons || []) {
      if (s && s.season_number > 0) sc[s.season_number] = s.episode_count || 0;
    }
    ctx.seasonCounts = sc;
    ctx.absEpisode = absEpisode(ctx);
  }
  return ctx;
}

/* ================================================================== */
/* coincidencia de episodio (OK.ru / Odysee / Dailymotion / Archive)   */
/* ================================================================== */

/* true si la duracion (seg) es compatible con la de la pelicula TMDB (+-20%). Sin datos -> true. */
function runtimeOk(ctx, seconds) {
  if (!ctx || ctx.kind !== "movie" || !ctx.runtime) return true;
  const n = Number(seconds);
  if (!n || !isFinite(n)) return true;
  const r = n / ctx.runtime;
  return r >= 0.8 && r <= 1.2;
}
function parseLen(v) {
  if (v == null || v === "") return 0;
  const t = String(v);
  if (t.indexOf(":") >= 0) return t.split(":").reduce((a, x) => a * 60 + (parseFloat(x) || 0), 0);
  return parseFloat(t) || 0;
}

function epMatch(pageTitle, ctx) {
  if (!ctx || ctx.kind !== "tv") return { ok: true, bonus: 0 };
  const s = ctx.season, e = ctx.episode, abs = ctx.absEpisode || 0, t = String(pageTitle || "");
  let hit = false, bonus = 0;
  const accept = (n, b) => {
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) return;
    if (n === e || (abs > 0 && n === abs)) { hit = true; if (b > bonus) bonus = b; }
  };
  let m = /\b[st]\s*0*(\d{1,2})\s*[xXeE]\s*0*(\d{1,4})\b/i.exec(t);
  if (m && parseInt(m[1], 10) === s && parseInt(m[2], 10) === e) { hit = true; bonus = 28; }
  m = /\b0*(\d{1,2})\s*[xX]\s*0*(\d{1,4})\b/.exec(t);
  if (m && parseInt(m[1], 10) === s && parseInt(m[2], 10) === e) { hit = true; bonus = Math.max(bonus, 26); }
  m = /(?:temporada|temp\.?|season)\s*0*(\d{1,2})[^0-9]{0,24}(?:cap[ií]tulo|capito|cap\.?|c\.?|episodio|ep\.?|e\.?|chapter)\s*0*(\d{1,4})\b/i.exec(t);
  if (m && parseInt(m[1], 10) === s && parseInt(m[2], 10) === e) { hit = true; bonus = Math.max(bonus, 26); }
  let re = /(?:cap[ií]tulo|capito|cap\.?|c\.?|episodio|ep\.?|e\.?|chapter)\s*0*(\d{1,4})\b/gi;
  while ((m = re.exec(t)) != null) accept(m[1], 20);
  re = /(?:^|[\s\-–—:|·•])0*(\d{1,4})\s*(?:серия|серии|seria|seriya|series)\b/gi;
  while ((m = re.exec(t)) != null) accept(m[1], 24);
  re = /(?:серия|серии|seria|seriya)\s*0*(\d{1,4})\b/gi;
  while ((m = re.exec(t)) != null) accept(m[1], 24);
  re = /(?:^|[^a-z0-9])([ec])\s*0*(\d{1,4})\b/gi;
  while ((m = re.exec(t)) != null) accept(m[2], 18);
  if (!hit) {
    re = /(?:^|[\s\-–—:|·•])0*(\d{1,4})(?=\s*(?:\(|\[|$|[\-–—|·•]|latino|latam|hd|full|1080|720|480|audio))/gi;
    let last = -1;
    while ((m = re.exec(t)) != null) {
      const n = parseInt(m[1], 10);
      if (n >= 1900 && n <= 2100) continue;
      if (n === e || (abs > 0 && n === abs)) last = n;
    }
    if (last > 0) { hit = true; bonus = Math.max(bonus, last >= 10 ? 12 : 6); }
  }
  return { ok: hit, bonus };
}

/* ================================================================== */
/* proveedores                                                         */
/* ================================================================== */

/* ---- PoseidonHD ---- */
async function poseidonBuildId(R) {
  const html = await httpGet(R, POSEIDON + "/", POSEIDON + "/");
  const m = /"buildId"\s*:\s*"([^"]+)"/.exec(html || "");
  return m && m[1] ? m[1] : "Q-i_R7Z4xGx1ZLVEa6Zzs";
}
const poseidonLang = (k) => { k = String(k || "").toLowerCase(); return k === "latino" ? "Latino" : k === "spanish" || k === "castellano" ? "Castellano" : k === "english" || k === "ingles" ? "Ingles" : k ? k.charAt(0).toUpperCase() + k.slice(1) : ""; };
function cyberRank(n) {
  n = String(n || "").toLowerCase();
  if (/vimeus|goodstream/.test(n)) return 0;
  if (/voe|vimeos/.test(n)) return 1;
  if (/streamtape|uqload/.test(n)) return 2;
  if (/filemoon|moon|bysejikuar/.test(n)) return 3;
  if (/streamwish|wishembed|hlswish|swdyu/.test(n)) return 4;
  if (/vidhide|callistanise|filelions|morencius|hglink/.test(n)) return 6;
  return 5;
}
async function provPoseidon(R, ctx) {
  const doFetchJson = async (bid) => {
    const s = ctx.season || 1, e = ctx.episode || 1;
    const url = ctx.kind === "movie"
      ? POSEIDON + "/_next/data/" + bid + "/es/pelicula/" + ctx.id + "/x.json?tmdb=" + enc(ctx.id) + "&movie=x"
      : POSEIDON + "/_next/data/" + bid + "/es/serie/" + ctx.id + "/x/temporada/" + s + "/episodio/" + e + ".json?tmdb=" + enc(ctx.id) + "&serie=x&season=" + s + "&episode=" + e;
    return parseJson(await httpGet(R, url, POSEIDON + "/"));
  };
  let bid = await poseidonBuildId(R);
  let data = await doFetchJson(bid);
  if (!data || !data.pageProps) {
    const bid2 = await poseidonBuildId(R);
    if (bid2 !== bid) data = await doFetchJson(bid2);
  }
  if (!data || !data.pageProps) { log(R, "  Poseidon JSON vacio"); return []; }
  let block = null;
  if (ctx.kind === "movie") {
    block = data.pageProps.thisMovie || null;
    if (!block || String(block.TMDbId || "") !== String(ctx.id)) return [];
  } else block = data.pageProps.episode || null;
  if (!block) return [];
  const tmp = [], videos = block.videos || {};
  for (const lk of ["latino", "spanish", "english"]) {
    for (const v of videos[lk] || []) {
      if (!v || !v.result) continue;
      tmp.push({ cand: mkCand(v.result, poseidonLang(lk), POSEIDON + "/", "PoseidonHD"), rank: cyberRank(v.cyberlocker || v.result) });
    }
  }
  tmp.sort((a, b) => a.rank - b.rank);
  return tmp.map((x) => x.cand);
}

/* ---- PelisJuanita ---- */
const JUANITA_ALIASES = {
  "the fresh prince of bel air": "el-principe-del-rap-en-bel-air",
  "el principe del rap de bel air": "el-principe-del-rap-en-bel-air"
};
function parseJuanita(html, base) {
  const out = [], seen = new Set();
  const addU = (u, lang) => {
    u = cleanUrl(absUrl(u, base));
    if (!u || !/^https?:\/\//i.test(u) || seen.has(u)) return;
    seen.add(u);
    out.push(mkCand(u, lang || "", base + "/", "Juanita"));
  };
  for (const t of findTags(html, /row-download/i)) {
    const a = attrsOf(t.tag), tipo = (a["data-tipo"] || "").toLowerCase();
    if (tipo === "torrent" || tipo === "magnet") continue;
    let u = a["data-url"];
    if (!u) continue;
    if (!/^https?:|^\/\//i.test(u)) { const d = b64decode(u); if (/^https?:\/\//i.test(d)) u = d; }
    addU(u, langOf(a["data-idioma"] || "") || langOf(strip(html.substring(t.end, t.end + 250))));
  }
  let m, re = /https?:\/\/(?:seriesplayer\.)?[a-z0-9._-]*(?:fortamomar\.workers\.dev|seriesplayer\.[a-z0-9._-]+)\/\?id=[^\s"'<>]*/gi;
  while ((m = re.exec(html || "")) != null) addU(m[0].replace(/&amp;/g, "&"), "Latino");
  for (const t of findTags(html, /^<iframe\b/i)) {
    const a = attrsOf(t.tag), src = a["src"] || a["data-src"] || "";
    if (/fortamomar|seriesplayer|onfilom|playspelis|flixlat/i.test(src)) addU(src, "");
  }
  return out;
}
async function provJuanitaSlug(R, ctx) {
  const raw = uniq([ctx.titleEn, ctx.titleEs, ctx.titleOrig].concat(ctx.altTitles || []));
  const slugs = [];
  for (const r of raw) { const k = normalizeTitle(r); if (JUANITA_ALIASES[k]) slugs.unshift(JUANITA_ALIASES[k]); }
  for (const r of raw) {
    const s = trimDash(slugJuanita(r));
    if (!s) continue;
    if (ctx.year) slugs.push(s + "-" + ctx.year);
    slugs.push(s);
  }
  const sl = uniq(slugs).slice(0, 4);
  const info = sl.map((s) => ctx.kind === "movie" ? JUANITA + "/movies/movieInfo.php?title=" + s
    : JUANITA + "/series/serieInfo.php?nombreSerie=" + s + "&nroTemporada=" + ctx.season + "&nroEpisodio=" + ctx.episode);
  const ver = sl.map((s) => ctx.kind === "movie" ? JUANITA + "/movies/pelicula/" + s : JUANITA + "/series/ver-serie/" + s);
  const bodies = await batchGet(R, info.concat(ver), JUANITA + "/");
  for (let i = 0; i < sl.length; i++) {
    const items = parseJuanita(bodies[i], JUANITA);
    if (!items.length) continue;
    const v = verifyPageTitle(bodies[sl.length + i], ctx);
    const pg = bodies[sl.length + i];
    if (ctx.kind === "movie" && ctx.year && pg && pg.indexOf(ctx.year) < 0) { log(R, "  Juanita descartado slug=" + sl[i] + " (la pagina no menciona " + ctx.year + ")"); continue; }
    if (v.ok === false) { log(R, "  Juanita descartado slug=" + sl[i] + " -> '" + v.pageTitle + "'"); continue; }
    log(R, "  Juanita slug OK: " + sl[i]);
    return items;
  }
  /* ver-serie como respaldo */
  if (ctx.kind === "tv") {
    for (let i = 0; i < sl.length; i++) {
      const vs = bodies[sl.length + i];
      if (!vs) continue;
      const out = discoverLinks(vs, ver[i]).map((l) => mkCand(l, "", JUANITA + "/", "Juanita"));
      for (const d of scanMedia(vs, "", JUANITA + "/", JUANITA + "/")) out.push({ url: "", lang: "", srcs: [d], prov: "Juanita" });
      if (out.length) return out;
    }
  }
  return [];
}

/* ---- Cuevana API (wp-api) ---- */
function pickId(o, depth) {
  depth = depth || 0;
  if (!o || typeof o !== "object" || depth > 3) return "";
  for (const k of ["_id", "id", "ID", "post_id", "postId"]) { const v = o[k]; if (v != null && (typeof v === "number" || /^\d+$/.test(String(v)))) return String(v); }
  for (const k in o) if (o[k] && typeof o[k] === "object") { const r = pickId(o[k], depth + 1); if (r) return r; }
  return "";
}
function firstArray(o, depth) {
  depth = depth || 0;
  if (!o || typeof o !== "object" || depth > 3) return null;
  if (Array.isArray(o)) return o;
  for (const k in o) if (o[k] && typeof o[k] === "object") { const r = firstArray(o[k], depth + 1); if (r) return r; }
  return null;
}
function pickEpisodeId(list, ep) {
  const arr = firstArray(list, 0);
  if (!arr) return "";
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    for (const k of ["episode", "number", "episode_number", "num", "n"]) { const n = it[k]; if (n != null && parseInt(n, 10) === ep) return pickId(it, 0); }
  }
  return arr[ep - 1] ? pickId(arr[ep - 1], 0) : "";
}
function embedFromText(t) {
  t = String(t || "").replace(/\\\//g, "/").replace(/\\"/g, '"');
  let m = /<iframe[^>]+(?:src|data-src)=["']([^"']+)/i.exec(t);
  if (m) return cleanUrl(m[1]);
  m = /^\s*(https?:\/\/[^\s"'<>]+|\/\/[^\s"'<>]+)/i.exec(t);
  if (m) return cleanUrl(m[1]);
  m = /"(?:embed_url|url|link|file|iframe|src)"\s*:\s*"([^"]+)"/i.exec(t);
  return m ? cleanUrl(m[1]) : "";
}
function playersFromJson(node, out, lang, depth) {
  if (!node || depth > 6 || out.length > 40) return;
  if (typeof node === "string") { const e = embedFromText(node); if (e) out.push({ url: e, lang: lang || "" }); return; }
  if (typeof node !== "object") return;
  let l = lang;
  if (!Array.isArray(node)) {
    const lv = node.lang || node.language || node.idioma || node.audio || node.label || node.name;
    if (typeof lv === "string" && langOf(lv)) l = langOf(lv);
  }
  for (const k in node) playersFromJson(node[k], out, (Array.isArray(node) ? "" : langOf(k)) || l, depth + 1);
}
async function provCuevanaApi(R, ctx) {
  const type = ctx.kind === "movie" ? "movies" : "tvshows";
  const slugs = uniq([ctx.titleEs, ctx.titleEn].concat((ctx.altTitles || []).slice(0, 2)).map(slugCuevana));
  for (const base of CUEVANA_BASES.slice(0, 4)) {
    if (!budgetLeft(R)) break;
    const api = base + "/wp-api/v1";
    const urls = [];
    for (const s of slugs) {
      if (ctx.year) urls.push(api + "/single/" + type + "?slug=" + enc(s + "-" + ctx.year) + "&postType=" + type);
      urls.push(api + "/single/" + type + "?slug=" + enc(s) + "&postType=" + type);
    }
    const bodies = await batchGet(R, uniq(urls).slice(0, 6), base + "/");
    let id = "";
    for (const b of bodies) { if (b) { id = pickId(parseJson(b), 0); if (id) break; } }
    if (!id) continue;
    let postId = id;
    if (ctx.kind === "tv") {
      const lst = parseJson(await httpGet(R, api + "/single/episodes/list?_id=" + enc(id) + "&season=" + ctx.season + "&page=1&postsPerPage=100", base + "/", { Accept: "application/json" }));
      postId = pickEpisodeId(lst, ctx.episode);
      if (!postId) continue;
    }
    const pj = await httpGet(R, api + "/player?postId=" + enc(postId) + "&demo=0", base + "/", { Accept: "application/json" });
    const found = [];
    playersFromJson(parseJson(pj) || pj, found, "", 0);
    const out = found.map((f) => mkCand(absUrl(f.url, base), f.lang, base + "/", "Cuevana"));
    log(R, "  cuevana-api " + hostOf(base) + " -> " + out.length);
    if (out.length) return out;
  }
  return [];
}

/* ---- LaCartoons ---- */
async function provLaCartoons(R, ctx) {
  if (ctx.kind === "movie") return [];
  const titles = uniq([ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []).filter(Boolean));
  let serieId = "";
  for (const t of titles) {
    if (!budgetLeft(R) || t.length < 3) continue;
    const html = await httpGet(R, LACARTOONS + "/?Titulo=" + enc(t), LACARTOONS + "/");
    if (!html) continue;
    const m = /href=["'](\/serie\/(\d+))["']/i.exec(html);
    if (!m) continue;
    const chunk = (new RegExp("href=[\"']\\/serie\\/" + m[2] + "[\"'][\\s\\S]{0,400}", "i").exec(html) || [""])[0];
    const cov = Math.max(titleCoverage(chunk, ctx.titleEs), titleCoverage(chunk, ctx.titleEn));
    const ids = uniq((html.match(/href=["']\/serie\/(\d+)["']/gi) || []).map((x) => (/(\d+)/.exec(x) || [])[1]).filter(Boolean));
    if (cov >= 50 || ids.length === 1 || (ids.length && cov >= 30)) { serieId = m[2]; break; }
  }
  if (!serieId) return [];
  const sh = await httpGet(R, LACARTOONS + "/serie/" + serieId, LACARTOONS + "/");
  if (!sh) return [];
  let capUrl = "", m;
  const re = /href=["'](\/serie\/capitulo\/(\d+)\?t=(\d+))["'][\s\S]{0,120}?Cap[ií]tulo\s*(\d+)/gi;
  while ((m = re.exec(sh)) != null) {
    if (parseInt(m[3], 10) === ctx.season && parseInt(m[4], 10) === ctx.episode) { capUrl = LACARTOONS + m[1]; break; }
  }
  if (!capUrl) {
    const list = [], re2 = /href=["'](\/serie\/capitulo\/\d+\?t=(\d+))["']/gi;
    while ((m = re2.exec(sh)) != null) if (parseInt(m[2], 10) === ctx.season) list.push(LACARTOONS + m[1]);
    if (list.length && ctx.episode <= list.length) capUrl = list[ctx.episode - 1];
  }
  if (!capUrl) return [];
  const html = await httpGet(R, capUrl, LACARTOONS + "/");
  if (!html) return [];
  const embeds = [];
  let re3 = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = re3.exec(html)) != null) embeds.push(cleanUrl(m[1]));
  re3 = /https?:\/\/(?:www\.)?ok\.ru\/[^"'\s<>]+/gi;
  while ((m = re3.exec(html)) != null) embeds.push(m[0]);
  return uniq(embeds).filter((u) => u && !/profitable|newrelic|paypal|bit\.ly/i.test(u)).map((u) => mkCand(u, "Latino", LACARTOONS + "/", "LaCartoons"));
}

/* ---- OK.ru (busqueda; necesita OKRU_COOKIE) ---- */
function okruIsGenericTitle(t) {
  t = clean(String(t || "")).toLowerCase().replace(/[.\u2026:!]+$/g, "").trim();
  if (!t || t.length < 2) return true;
  if (/^[\d:\s]+$/.test(t)) return true;
  if (/^(view|views|ver|watch|play|reproducir|image|video|videos|more|next|menu|share|like|open|abrir)\b/.test(t) && t.length <= 28) return true;
  if (/^ok\.ru video\b/i.test(t)) return true;
  return false;
}
function okruTitleScore(pageTitle, want) {
  if (!pageTitle || !want) return 0;
  let score = Math.max(titleCoverage(pageTitle, want), tokenSimilarity(pageTitle, want));
  const wt = titleTokens(want), pt = titleTokens(pageTitle);
  if (wt.length) {
    let soft = 0;
    for (const w of wt) {
      if (pt.some((p) => p === w || (w.length >= 4 && p.indexOf(w.substring(0, Math.max(3, w.length - 1))) === 0) || (p.length >= 4 && w.indexOf(p.substring(0, Math.max(3, p.length - 1))) === 0))) soft++;
    }
    score = Math.max(score, Math.round((soft / wt.length) * 100));
  }
  return score;
}
function okruCleanPageTitle(t) {
  t = clean(String(t || ""));
  t = t.replace(/^\s*(?:latino|audio\s+latino|d\.?\s*latino|latam|castellano|subtitulado)\s*[-–—:|]+\s*/i, "");
  t = t.replace(/\s*[\[\(]\s*(?:latino|audio\s+latino|d\.?\s*latino|latam|castellano|m?\d{3,4}p|4k|hd|full\s*hd)\s*[\]\)]\s*/gi, " ");
  t = t.replace(/\s*[\[\(]?\s*(?:audio\s+)?latino\s*[\]\)]?\s*$/i, "");
  return clean(t);
}
function okruBestScore(pageTitle, ctx) {
  const cleaned = okruCleanPageTitle(pageTitle);
  const wants = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []);
  let best = 0;
  for (const w of wants) best = Math.max(best, okruTitleScore(cleaned, w), okruTitleScore(pageTitle, w));
  if (best >= 50 && /\b(?:latino|latam|audio\s+latino|d\.?\s*latino)\b/i.test(String(pageTitle || ""))) best = Math.min(100, best + 12);
  if (ctx.kind === "tv") {
    const em = epMatch(pageTitle, ctx);
    if (em.ok) best = Math.min(100, best + em.bonus);
    else if (best > 0 && best < 90) best = Math.max(0, best - 25);
  }
  return best;
}
function okruCollectHits(html) {
  const list = [], seen = new Set();
  html = String(html || "");
  const add = (vid, name) => {
    vid = String(vid || "");
    if (!/^\d{6,}$/.test(vid) || seen.has(vid)) return;
    name = clean(htmlUnescape(name || ""));
    if (okruIsGenericTitle(name)) name = "";
    seen.add(vid);
    list.push({ id: vid, name });
  };
  let m, re = /<a\b([^>]*?href\s*=\s*["'](?:https?:\/\/[^"']+)?\/(?:video|videoembed)\/(\d+)(?:[?#][^"']*)?["'][^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = re.exec(html)) != null && list.length < 60) {
    let title = "", am = /(?:title|aria-label|data-title|data-name)\s*=\s*["']([^"']{2,300})["']/i.exec(m[1]);
    if (am) title = clean(am[1]);
    if (okruIsGenericTitle(title)) { am = /alt\s*=\s*["']([^"']{2,300})["']/i.exec(m[3]); if (am) title = clean(am[1]); }
    if (okruIsGenericTitle(title)) { am = /<(?:span|div)[^>]*class=["'][^"']*(?:title|name|caption)[^"']*["'][^>]*>([\s\S]{1,300}?)<\/(?:span|div)>/i.exec(m[3]); if (am) title = clean(strip(am[1])); }
    if (okruIsGenericTitle(title)) title = clean(strip(m[3]));
    add(m[2], title);
  }
  re = /(?:data-movie-id|data-video-id|data-content-id|st\.mvId|movieId|videoId|video_id|movie_id)\s*["':=]+\s*["']?(\d{6,})["']?/gi;
  while ((m = re.exec(html)) != null && list.length < 60) add(m[1], "");
  re = /(?:https?:\/\/)?(?:www\.|m\.)?ok\.ru\/(?:video|videoembed)\/(\d{6,})/gi;
  while ((m = re.exec(html)) != null && list.length < 60) add(m[1], "");
  m = /<video-search-results[^>]*\svideos=(?:"([^"]+)"|'([^']+)')/i.exec(html);
  if (m) {
    const data = parseJson(htmlUnescape(m[1] != null ? m[1] : m[2]));
    const rows = (data && data.table && data.table.data) || (data && data.data) || [];
    for (const r of rows) add(String((r && (r.id || r.movieId || r.videoId)) || ""), (r && (r.name || r.title || r.movieName || r.videoTitle)) || "");
  }
  return list;
}
function searchQueries(ctx, forOk) {
  const queries = [], seen = new Set();
  const addQ = (s) => {
    s = clean(String(s || ""));
    if (!s || s.length < 2) return;
    for (const v of [s, s.replace(/['’]/g, "")]) {
      const k = normalizeTitle(v);
      if (!k || seen.has(k)) continue;
      seen.add(k); queries.push(v);
    }
  };
  const isTv = ctx.kind === "tv", sn = ctx.season, en = ctx.episode, abs = ctx.absEpisode || en;
  const p2 = (n) => (n < 10 ? "0" + n : String(n));
  const yq = ctx.year ? " " + ctx.year : "";
  const primary = [ctx.titleEs].concat(ctx.altTitles || []).slice(0, 6);
  if (ctx.titleEn && normalizeTitle(ctx.titleEn) !== normalizeTitle(ctx.titleEs)) primary.push(ctx.titleEn);
  if (ctx.titleOrig && normalizeTitle(ctx.titleOrig) !== normalizeTitle(ctx.titleEs) && normalizeTitle(ctx.titleOrig) !== normalizeTitle(ctx.titleEn)) primary.push(ctx.titleOrig);
  primary.forEach((tq, pi) => {
    if (!tq) return;
    if (isTv) {
      const nums = uniq([en, abs]);
      if (pi === 0 && forOk) {
        for (const n of nums) {
          for (const f of ["Capítulo ", "Cap ", "Episodio ", "E", "- ", ""]) addQ(tq + " " + f + n);
          addQ(tq + " Capítulo " + n + " Latino");
          addQ(tq + " " + n + " серия");
        }
        addQ(tq + " S" + p2(sn) + "E" + p2(en));
        addQ(tq + " " + sn + "x" + en);
      } else {
        addQ(tq + " S" + sn + "E" + en);
        addQ(tq + " Capítulo " + en);
        addQ(tq + " Cap " + en);
        addQ(tq + " E" + en);
      }
    } else {
      if (pi === 0 && forOk) { addQ(tq + " Latino 1080p" + yq); addQ(tq + " Latino 720p" + yq); addQ(tq + " 1080p" + yq); }
      if (forOk) { addQ(tq + " Latino" + yq); addQ(tq + " Audio Latino" + yq); }
      addQ(tq + yq);
      addQ(tq);
    }
  });
  return queries;
}
async function provOkru(R, ctx) {
  const out = [];
  if (!R.env.OKRU_COOKIE) { log(R, "  OK.ru: falta OKRU_COOKIE, se omite la busqueda"); return out; }
  const queries = searchQueries(ctx, true), hits = [], seenHit = new Set();
  let latinoRun = 0;
  for (const q of queries.slice(0, 8)) {
    if (!budgetLeft(R) || hits.length >= 24) break;
    if (/(?:^|\s)(?:latino|audio\s+latino)(?:\s|$)/i.test(q)) latinoRun++;
    const url = "https://ok.ru/dk?st.cmd=searchResult&st.mode=Movie&st.grmode=Groups&st.query=" + enc(q);
    const html = await httpGet(R, url, "https://ok.ru/", okHeaders(R));
    if (!html) continue;
    if (/st\.cmd=anonym|anonymLogin|st\.email|field_email/i.test(html) && !okruCollectHits(html).length) { log(R, "  OK.ru: SIN SESION (cookie vencida?)"); break; }
    for (const h of okruCollectHits(html)) if (!seenHit.has(h.id)) { seenHit.add(h.id); hits.push(h); }
    const good = hits.filter((h) => h.name && okruBestScore(h.name, ctx) >= 55).length;
    if (good >= 1 && latinoRun >= 1) break;
  }
  const ranked = hits.map((h) => ({ id: h.id, name: h.name, pre: h.name ? okruBestScore(h.name, ctx) : 0 }))
    .sort((a, b) => b.pre - a.pre || (a.name ? -1 : 1));
  let target = null, processed = 0;
  for (const r of ranked) {
    if (processed >= 8 || !budgetLeft(R)) break;
    if (r.name && r.pre > 0 && r.pre < 35) continue;
    let html = await httpGet(R, "https://ok.ru/videoembed/" + r.id, "https://ok.ru/", okHeaders(R));
    let meta = html ? await okParseMeta(R, html) : null;
    let srcs = okruSourcesFromMeta(meta, "OK.ru");
    if (!srcs.length) {
      html = await httpGet(R, "https://ok.ru/videoembed/" + r.id, "https://ok.ru/");
      meta = html ? await okParseMeta(R, html) : null;
      srcs = okruSourcesFromMeta(meta, "OK.ru");
    }
    if (!html) continue;
    let title = (meta && meta.movie && clean(meta.movie.title || meta.movie.name || "")) || r.name || "";
    if (!title || okruIsGenericTitle(title)) {
      const tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
      if (tm) title = clean(strip(tm[1]).replace(/\s*[|\-\u2013]\s*OK\.?RU.*$/i, ""));
    }
    const score = okruBestScore(title, ctx);
    const yr = (/\b((?:19|20)\d{2})\b/.exec(title) || [])[1] || "";
    const yd = yr && ctx.year ? Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) : null;
    const yearOk = yd === null || yd <= 1 || (ctx.kind === "tv" && yd <= 5);
    const exact = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []).some((w) => w && normalizeTitle(title) === normalizeTitle(w));
    if (ctx.kind === "tv" && !epMatch(title, ctx).ok) continue;
    if (!yearOk || (!exact && score < (ctx.kind === "tv" ? 45 : 55))) continue;
    if (!srcs.length) continue;
    processed++;
    if (!target) { target = mkCand("https://ok.ru/video/" + r.id, "Latino", "https://ok.ru/", "OK.ru"); target.srcs = []; out.push(target); }
    for (const s of srcs) if (target.srcs.length < 18 && !target.srcs.some((x) => x.url === s.url)) target.srcs.push(s);
    okruSort(target.srcs);
    log(R, "  OK.ru HIT id=" + r.id + " score=" + score + " '" + title.substring(0, 50) + "'");
  }
  return out;
}

/* ---- Odysee ---- */
async function odyseeRpc(R, method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params: params || {}, id: Date.now() });
  const t = await httpPost(R, ODYSEE_API, body, "https://odysee.com/", { "Content-Type": "application/json" });
  const j = parseJson(t);
  if (j && j.error) { log(R, "  Odysee " + method + " error: " + (j.error.message || "")); return null; }
  return j ? j.result : null;
}
async function provOdysee(R, ctx) {
  const out = [], queries = searchQueries(ctx, false).slice(0, 6), seenId = new Set(), isTv = ctx.kind === "tv";
  for (const q of queries) {
    if (out.length >= 4 || !budgetLeft(R)) break;
    const res = await odyseeRpc(R, "claim_search", { text: q, claim_type: ["stream"], stream_types: ["video"], page_size: 6, page: 1, order_by: ["release_time"], has_source: true, no_totals: true });
    for (const it of (res && res.items) || []) {
      if (out.length >= 4) break;
      if (!it || !it.claim_id || seenId.has(it.claim_id)) continue;
      const title = clean((it.value && it.value.title) || it.name || "");
      let score = Math.max(tokenSimilarity(title, ctx.titleEs), tokenSimilarity(title, ctx.titleEn), tokenSimilarity(title, ctx.titleOrig));
      if (isTv) { if (!epMatch(title, ctx).ok) continue; }
      else if (ctx.year) { const yr = (/\b((?:19|20)\d{2})\b/.exec(title) || [])[1] || ""; if (yr && Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) > 1) score -= 25; }
      if (score < 55) continue;
      if (!isTv && !runtimeOk(ctx, it.value && it.value.video && it.value.video.duration)) continue;
      seenId.add(it.claim_id);
      const uri = it.permanent_url || it.canonical_url || "lbry://" + it.name + "#" + it.claim_id;
      const g = await odyseeRpc(R, "get", { uri, save_file: false });
      const stream = g && g.streaming_url ? cleanUrl(g.streaming_url) : "";
      if (!stream) continue;
      const s = mkSrcBare(stream, "Odysee \u00b7 " + (score >= 80 ? "HD" : "SD") + " \u00b7 " + title.substring(0, 40), /\.m3u8/i.test(stream) ? "hls" : "mp4");
      if (s) out.push({ url: "", lang: "", srcs: [s], prov: "Odysee" });
    }
  }
  return out;
}

/* ---- Dailymotion ---- */
async function dmStreams(R, id) {
  const metaUrl = "https://www.dailymotion.com/player/metadata/video/" + id;
  let j = parseJson(await httpGet(R, metaUrl, "https://www.dailymotion.com/"));
  if (!j || !j.qualities) j = parseJson(await httpGet(R, metaUrl + "?embedder=" + enc("https://www.dailymotion.com/video/" + id) + "&locale=es&is_native_app=0", "https://www.dailymotion.com/video/" + id));
  if (!j || j.error || !j.qualities) return [];
  const out = [], q = j.qualities, ref = "https://www.dailymotion.com/video/" + id;
  const keys = Object.keys(q).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return nb - na;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a === "auto" ? 1 : b === "auto" ? -1 : 0;
  });
  for (const k of keys) {
    for (const it of q[k] || []) {
      const u = cleanUrl(it.url || "");
      if (!u) continue;
      const type = /m3u8/i.test(u) || (it.type && /mpegURL/i.test(it.type)) ? "hls" : "mp4";
      const s = mkSrc(u, "Dailymotion \u00b7 " + (k === "auto" ? "Auto" : k), ref, type);
      if (s) out.push(s);
    }
    if (out.length >= 3) break;
  }
  return out;
}
async function provDailymotion(R, ctx) {
  const out = [], queries = searchQueries(ctx, false).slice(0, 6), seenId = new Set(), isTv = ctx.kind === "tv";
  for (const q of queries) {
    if (out.length >= 3 || !budgetLeft(R)) break;
    const j = parseJson(await httpGet(R, "https://api.dailymotion.com/videos?search=" + enc(q) + "&limit=6&fields=id,title,url,duration,language&sort=relevance", "https://www.dailymotion.com/"));
    for (const it of (j && j.list) || []) {
      if (out.length >= 3) break;
      if (!it || !it.id || seenId.has(it.id)) continue;
      const title = clean(it.title || "");
      let score = Math.max(tokenSimilarity(title, ctx.titleEs), tokenSimilarity(title, ctx.titleEn), tokenSimilarity(title, ctx.titleOrig));
      if (isTv) { if (!epMatch(title, ctx).ok) continue; }
      else if (ctx.year) { const yr = (/\b((?:19|20)\d{2})\b/.exec(title) || [])[1] || ""; if (yr && Math.abs(parseInt(yr, 10) - parseInt(ctx.year, 10)) > 1) score -= 25; }
      if (score < 55) continue;
      const dur = parseInt(it.duration, 10) || 0;
      if (dur && dur < (isTv ? 480 : 3000)) continue;
      if (!isTv && !runtimeOk(ctx, dur)) continue;
      seenId.add(it.id);
      const srcs = await dmStreams(R, it.id);
      if (srcs.length) out.push({ url: "", lang: "", srcs, prov: "Dailymotion" });
    }
  }
  return out;
}

/* ---- Archive.org ---- */
function archiveSrc(u, label) {
  u = cleanUrl(u);
  if (!/^https?:\/\//i.test(u)) return null;
  const ext = ((/\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(u) || [])[1] || "mp4").toLowerCase();
  return { name: label, url: u, type: ext === "m3u8" ? "hls" : "mp4", container: ext === "webm" ? "video/webm" : ext === "mkv" ? "video/x-matroska" : "video/mp4", headers: { "User-Agent": UA }, bare: true };
}
async function archiveStreams(R, identifier, ctx) {
  const j = parseJson(await httpGet(R, "https://archive.org/metadata/" + enc(identifier), "https://archive.org/"));
  if (!j || !j.files) return [];
  const isTv = ctx.kind === "tv", pref = [];
  for (const f of j.files) {
    const name = String(f.name || ""), fmt = String(f.format || "").toLowerCase();
    if (!/\.(mp4|mkv|webm|m3u8|avi|mov|m4v)$/i.test(name)) continue;
    if (/sample|preview|thumb|sprite|__ia|trailer/i.test(name)) continue;
    if (!isTv && !runtimeOk(ctx, parseLen(f.length))) continue;
    let bonus = 0;
    if (isTv) {
      const em = epMatch(name.replace(/^.*\//, "").replace(/\.[a-z0-9]{2,4}$/i, ""), ctx);
      if (!em.ok) continue;
      bonus = em.bonus;
    }
    const rank = /1080|hd|hi/i.test(name + " " + fmt) ? 3 : /720/i.test(name + " " + fmt) ? 2 : /480|512/i.test(name + " " + fmt) ? 1 : 0;
    pref.push({ name, rank, size: parseInt(f.size, 10) || 0, bonus });
  }
  pref.sort((a, b) => b.bonus - a.bonus || b.rank - a.rank || b.size - a.size);
  const out = [];
  for (const p of pref.slice(0, 3)) {
    const u = "https://archive.org/download/" + identifier + "/" + p.name.split("/").map(encodeURIComponent).join("/");
    const s = archiveSrc(u, "Archive.org \u00b7 " + (p.rank >= 3 ? "1080p" : p.rank >= 2 ? "720p" : "SD") + (/\.webm$/i.test(p.name) ? " webm" : ""));
    if (s) out.push(s);
  }
  return out;
}
async function provArchive(R, ctx) {
  const out = [], isTv = ctx.kind === "tv", queries = [], seenId = new Set();
  for (const t of uniq([ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []))) {
    queries.push("title:(" + t + ")" + (!isTv && ctx.year ? " AND year:" + ctx.year : ""));
    queries.push("title:(" + t + ") OR subject:(" + t + ") OR description:(" + t + ")");
  }
  for (const q of queries.slice(0, 6)) {
    if (out.length >= 3 || !budgetLeft(R)) break;
    const j = parseJson(await httpGet(R, "https://archive.org/advancedsearch.php?q=" + enc("(" + q + ") AND mediatype:(movies)") + "&fl[]=identifier&fl[]=title&fl[]=year&sort[]=downloads+desc&rows=8&page=1&output=json", "https://archive.org/"));
    for (const it of (j && j.response && j.response.docs) || []) {
      if (out.length >= 3) break;
      if (!it || !it.identifier || seenId.has(it.identifier)) continue;
      const title = clean(it.title || ""), hay = title + " " + String(it.identifier).replace(/[-_.]+/g, " ");
      let score = Math.max(tokenSimilarity(title, ctx.titleEs), tokenSimilarity(title, ctx.titleEn), tokenSimilarity(title, ctx.titleOrig));
      if (isTv) score = Math.max(score, titleCoverage(hay, ctx.titleEs), titleCoverage(hay, ctx.titleEn), titleCoverage(hay, ctx.titleOrig));
      else if (ctx.year && it.year && Math.abs(parseInt(it.year, 10) - parseInt(ctx.year, 10)) > 1) score -= 25;
      else if (ctx.year && !it.year) score -= 20; /* sin año: no se puede confirmar que sea la misma pelicula */
      if (score < (isTv ? 70 : 70)) continue;
      seenId.add(it.identifier);
      const srcs = await archiveStreams(R, it.identifier, ctx);
      if (srcs.length) out.push({ url: "", lang: "", srcs, prov: "Archive.org" });
    }
  }
  return out;
}

/* ---- coincidencia de titulos en listados ---- */
const BAD_PATH = /\/(?:genero|genre|generos|category|categoria|categorias|tag|tags|page|pagina|wp-|author|search|buscar|year|release|network|cast|director|actor|estrenos|top|login|register|contacto|dmca|feed|xfsearch|country|pais|idioma|lang)(?:\/|$)/i;
const RE_TV = /\/(?:serie|series|tv|tvshows?|ver-serie|show|shows|anime|animes)\//i;
const RE_MOVIE = /\/(?:pelicula|peliculas|movie|movies|ver-pelicula|film|films|pelis|ver)\//i;
function slugWords(u) {
  const p = String(u || "").split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() || "";
  return p.replace(/[-_]+/g, " ").replace(/\.html?$/i, "").replace(/\s+\d{4}$/, "");
}
function findLinks(html, base, kind) {
  const out = [], byUrl = {}, re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi, host = hostOf(base);
  let m;
  while ((m = re.exec(html || "")) != null) {
    const a = attrsOf(m[0].substring(0, m[0].indexOf(">") + 1)), href = a["href"];
    if (!href || href.charAt(0) === "#" || /^(?:javascript|mailto):/i.test(href)) continue;
    const u = absUrl(href.split("#")[0], base);
    if (hostOf(u) !== host && hostOf(u).replace(/^www\./, "") !== host.replace(/^www\./, "")) continue;
    const path = u.replace(/^https?:\/\/[^\/]+/, "");
    if (path.length < 3 || BAD_PATH.test(path)) continue;
    const type = RE_TV.test(path) ? "tv" : RE_MOVIE.test(path) ? "movie" : "unknown";
    const inner = m[1], alt = (/<img\b[^>]*\balt=["']([^"']+)/i.exec(inner) || [])[1] || "";
    if (type === "unknown" && !alt && !a["title"] && inner.indexOf("<img") < 0) continue;
    let title = a["title"] || alt || strip(inner);
    if (title.length > 140) title = "";
    const tail = html.substring(m.index + m[0].length, m.index + m[0].length + 500);
    const yr = (/>\s*((?:19|20)\d\d)\s*</.exec(tail) || /\b((?:19|20)\d\d)\b/.exec(strip(inner)) || [])[1] || "";
    let c = byUrl[u];
    if (!c) { c = { url: u, titles: [], type, year: yr }; byUrl[u] = c; out.push(c); }
    if (title) c.titles.push(clean(title));
    if (yr && !c.year) c.year = yr;
    if (out.length >= 80) break;
  }
  for (const c of out) c.titles.push(slugWords(c.url));
  return out;
}
function scoreLink(c, ctx) {
  const want = [ctx.titleEs, ctx.titleEn, ctx.titleOrig].concat(ctx.altTitles || []).map(normalizeTitle).filter(Boolean);
  let best = 0;
  for (const raw of c.titles) {
    const t = normalizeTitle(raw);
    if (!t) continue;
    for (const w of want) {
      let s = 0;
      if (t === w) s = 100;
      else if (t.indexOf(w) >= 0 || w.indexOf(t) >= 0) {
        const r = Math.min(t.length, w.length) / Math.max(t.length, w.length);
        s = r >= 0.85 ? 60 + r * 30 : 0;
      }
      if (!s) { const ts = tokenSimilarity(raw, w); if (ts >= 80) s = 55 + (ts - 80); }
      if (s > best) best = s;
    }
  }
  if (!best) return 0;
  if (c.type !== "unknown" && c.type !== ctx.kind) best -= 40;
  if (c.year && ctx.year) {
    const d = Math.abs(parseInt(c.year, 10) - parseInt(ctx.year, 10));
    if (d === 0) best += 12; else if (d === 1) best += 4; else return 0;
  } else if (ctx.year && c.url.indexOf(ctx.year) >= 0) best += 8;
  return best;
}
function pickBest(R, links, ctx) {
  let best = null, sc = 0;
  for (const l of links) { const s = scoreLink(l, ctx); if (s > sc) { sc = s; best = l; } }
  if (best && sc >= 75) { log(R, "  match " + sc + " -> " + best.url.substring(0, 100)); return best; }
  return null;
}

/* ---- sitios WordPress / DooPlay / Toroflix ---- */
const SITES = [
  { id: "pelisplus", name: "PelisPlusHD", bases: DOMAINS.pelisplushd, search: ["/search?s={q}", "/search/{q}/1"], mode: "pelisplus" },
  { id: "cinecalidad", name: "Cinecalidad", bases: DOMAINS.cinecalidad, search: ["/?s={q}"], mode: "wp" },
  { id: "flixlatam", name: "FlixLatam", bases: DOMAINS.flixlatam, search: ["/?s={q}", "/search?s={q}"], mode: "wp" },
  { id: "pelisflixhd", name: "PelisflixHD", bases: DOMAINS.pelisflixhd, search: ["/busqueda/{q}"], mode: "wp" },
  { id: "gnula", name: "Gnula", bases: DOMAINS.gnula, search: ["/?s={q}", "/search/{q}"], mode: "wp" }
];
const CORE_SITE_IDS = { pelisplus: 1, cinecalidad: 1, flixlatam: 1, pelisflixhd: 1 };
const MAX_WP_PROVIDERS = 4;
const siteQueries = (ctx) => uniq([ctx.titleEs, ctx.titleEn].concat((ctx.altTitles || []).slice(0, 2))).slice(0, 4);

async function siteFind(R, site, ctx) {
  const qs = siteQueries(ctx);
  for (const base of site.bases) {
    if (!budgetLeft(R)) break;
    let reached = false;
    for (const q of qs) {
      if (!budgetLeft(R)) break;
      for (const sp of site.search) {
        const html = await httpGet(R, base + sp.replace("{q}", enc(q).replace(/%20/g, "+")), base + "/");
        if (!html) continue;
        reached = true;
        const best = pickBest(R, findLinks(html, base, ctx.kind), ctx);
        if (best) return { url: best.url, base };
        break;
      }
    }
    if (reached) break;
  }
  return null;
}
function episodeLink(html, base, s, e) {
  const re = /<a\b[^>]*href=["']([^"']+)["']/gi, S = String(s), E = String(e);
  const ps = [
    new RegExp("[-/]0*" + S + "x0*" + E + "(?:[/?#]|$)", "i"),
    new RegExp("(?:temporada|season)-0*" + S + "[-/]+(?:episodio|episode|capitulo)-0*" + E + "(?:[/?#]|$)", "i"),
    new RegExp("/season/0*" + S + "/episode/0*" + E + "(?:[/?#]|$)", "i"),
    new RegExp("/temporada/0*" + S + "/episodio/0*" + E + "(?:[/?#]|$)", "i")
  ];
  let m;
  while ((m = re.exec(html || "")) != null) if (ps.some((p) => p.test(m[1]))) return absUrl(m[1], base);
  return "";
}
function deepUrls(node, out, depth) {
  if (!node || depth > 6 || out.length > 30) return;
  if (typeof node === "string") { const e = embedFromText(node); if (e) out.push(e); return; }
  if (typeof node !== "object") return;
  for (const k in node) deepUrls(node[k], out, depth + 1);
}
async function dooEmbed(R, base, post, 
