export var ContentCrawlerStatus;
(function (ContentCrawlerStatus) {
    ContentCrawlerStatus["PENDING"] = "pending";
    ContentCrawlerStatus["HANDLED"] = "handled";
    ContentCrawlerStatus["FAILED"] = "failed";
})(ContentCrawlerStatus || (ContentCrawlerStatus = {}));
export var Routes;
(function (Routes) {
    Routes["SEARCH"] = "/search";
    Routes["SSE"] = "/sse";
    Routes["MESSAGE"] = "/message";
})(Routes || (Routes = {}));
export var ContentCrawlerTypes;
(function (ContentCrawlerTypes) {
    ContentCrawlerTypes["PLAYWRIGHT"] = "playwright";
    ContentCrawlerTypes["CHEERIO"] = "cheerio";
})(ContentCrawlerTypes || (ContentCrawlerTypes = {}));
export const PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS = 60;
export const GOOGLE_STANDARD_RESULTS_PER_PAGE = 10;
