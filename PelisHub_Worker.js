source.enable = function (conf, settings, saveStateStr) {
    throw new ScriptException("DEBUG OK v13: script ejecutado. No hay SyntaxError.");
};

source.getHome = function () {
    return new VideoPager([], false, {});
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
    throw new ScriptException("no details");
};
