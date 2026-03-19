#!/usr/bin/env node

const cafesdk = require('./sdk.js');
const { runRAGWebBrowser } = require('./src/worker-main.js');

const RESULT_TABLE_HEADERS = [
  { label: 'Query', key: 'query', format: 'text' },
  { label: 'URL', key: 'url', format: 'text' },
  { label: 'Title', key: 'title', format: 'text' },
  { label: 'Description', key: 'description', format: 'text' },
  { label: 'Content', key: 'content', format: 'text' },
  { label: 'Markdown', key: 'markdown', format: 'text' },
  { label: 'HTML', key: 'html', format: 'text' },
  { label: 'Status Code', key: 'status_code', format: 'integer' },
  { label: 'Error', key: 'error', format: 'text' },
];

const DEFAULT_INPUT = {
  query: '',
  maxResults: 3,
  outputFormats: ['markdown'],
  requestTimeoutSecs: 40,
  scrapingTool: 'raw-http',
  serpMaxRetries: 2,
  maxRequestRetries: 1,
  dynamicContentWaitSecs: 10,
  removeCookieWarnings: true,
  htmlTransformer: 'none',
  readableTextCharThreshold: 0,
  removeElementsCssSelector:
    'nav, footer, script, style, noscript, svg, img[src^="data:"],\n' +
    '[role="alert"],\n' +
    '[role="banner"],\n' +
    '[role="dialog"],\n' +
    '[role="alertdialog"],\n' +
    '[role="region"][aria-label*="skip" i],\n' +
    '[aria-modal="true"]',
};

async function safeLog(log, level, message) {
  try {
    if (log && typeof log[level] === 'function') {
      await log[level](message);
    }
  } catch (e) {
    console.error(`Failed to log ${level}:`, message);
  }
}

async function run() {
  try {
    const inputJson = await cafesdk.parameter.getInputJSONObject();
    await safeLog(cafesdk.log, 'debug', `Input parameters: ${JSON.stringify(inputJson)}`);

    const inputData = { ...DEFAULT_INPUT, ...inputJson };

    if (!inputData.query) {
      await safeLog(cafesdk.log, 'error', 'Missing required parameter: query');
      await cafesdk.result.setTableHeader(RESULT_TABLE_HEADERS);
      await cafesdk.result.pushData({ error: 'Missing query parameter', status: 'failed' });
      return;
    }

    await cafesdk.result.setTableHeader(RESULT_TABLE_HEADERS);

    await safeLog(cafesdk.log, 'info', `Starting RAG Web Browser with query: ${inputData.query}`);

    const results = await runRAGWebBrowser(inputData, cafesdk);

    if (Array.isArray(results) && results.length > 0) {
      for (const item of results) {
        await cafesdk.result.pushData({
          query: inputData.query,
          url: item.url || item.metadata?.url,
          title: item.title || item.metadata?.title,
          description: item.description || item.metadata?.description,
          content: item.text,
          markdown: item.markdown,
          html: item.html,
          status_code: item.crawl?.httpStatusCode || 200,
          error: item.error || null,
        });
      }
    } else {
      await safeLog(cafesdk.log, 'warn', 'No results found');
      await cafesdk.result.pushData({
        query: inputData.query,
        status: 'no_results',
        error: 'No results found',
      });
    }

    await safeLog(cafesdk.log, 'info', `Completed with ${Array.isArray(results) ? results.length : 0} results`);
  } catch (err) {
    await safeLog(cafesdk.log, 'error', `Execution error: ${err.message}`);
    try {
      await cafesdk.result.setTableHeader(RESULT_TABLE_HEADERS);
      await cafesdk.result.pushData({ error: err.message, status: 'failed' });
    } catch (pushError) {
      console.error('Failed to push error data:', pushError);
    }
  }
}

run();
