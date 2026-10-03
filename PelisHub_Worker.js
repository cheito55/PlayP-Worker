var PLATFORM = "PelisHubWorker";
var PID = "c8b3f5d2-4e6a-5f9b-0d37-2a1e8b6c9f45";
var PPID = new PlatformID(PLATFORM, PLATFORM, PID);
var API_BASE = "https://pelishub.cheito55.workers.dev";

source.enable = function (conf, settings, saveStateStr) {
    throw new ScriptException("DEBUG OK: el JS cargo bien (v12). Syntax esta bien. API_BASE=" + API_BASE);
};

source.getHome = function () {
    throw new ScriptException("DEBUG: getHome llamado. El plugin funciona.");
};

source.getSearchCapabilities = function () {
    return { types: ["MIXED"], sorts: [], filters: [] };
};

source.search = function (query) {
    return new VideoPager([], false, {});
};

source.isContentDetailsUrl = function (url) {
    return false;
};

source.getContentDetails = function (url) {
    throw new ScriptException("DEBUG: details");
};
