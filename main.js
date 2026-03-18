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
};

async function run() {
  try {
    const inputJson = await cafesdk.parameter.getInputJSONObject();
    console.log(`[DEBUG] Input parameters: ${JSON.stringify(inputJson)}`);

    const inputData = { ...DEFAULT_INPUT, ...inputJson };

    if (!inputData.query) {
      console.error('[ERROR] Missing required parameter: query');
      await cafesdk.result.pushData({ error: 'Missing query parameter', status: 'failed' });
      return;
    }

    await cafesdk.result.setTableHeader(RESULT_TABLE_HEADERS);

    console.log(`[INFO] Starting RAG Web Browser with query: ${inputData.query}`);

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
      console.warn('[WARN] No results found');
      await cafesdk.result.pushData({
        query: inputData.query,
        status: 'no_results',
        error: 'No results found',
      });
    }

    console.log(`[INFO] Completed with ${Array.isArray(results) ? results.length : 0} results`);
  } catch (err) {
    console.error(`[ERROR] Execution error: ${err.message}`);
    await cafesdk.result.pushData({ error: err.message, status: 'failed' });
    throw err;
  }
}

run();
