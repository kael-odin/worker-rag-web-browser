#!/usr/bin/env node

import cafesdk from './sdk.js';
import { runRAGWebBrowser } from './src/worker-main.js';

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
  scrapingTool: 'browser-playwright',
};

async function run() {
  try {
    const inputJson = await cafesdk.parameter.getInputJSONObject();
    await cafesdk.log.debug(`Input parameters: ${JSON.stringify(inputJson)}`);

    const inputData = { ...DEFAULT_INPUT, ...inputJson };

    if (!inputData.query) {
      await cafesdk.log.error('Missing required parameter: query');
      await cafesdk.result.pushData({ error: 'Missing query parameter', status: 'failed' });
      return;
    }

    await cafesdk.result.setTableHeader(RESULT_TABLE_HEADERS);

    await cafesdk.log.info(`Starting RAG Web Browser with query: ${inputData.query}`);

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
          error: item.crawl?.error || null,
        });
      }
    } else {
      await cafesdk.log.warn('No results found');
      await cafesdk.result.pushData({
        query: inputData.query,
        status: 'no_results',
        error: 'No results found',
      });
    }

    await cafesdk.log.info(`Completed with ${Array.isArray(results) ? results.length : 0} results`);
  } catch (err) {
    await cafesdk.log.error(`Execution error: ${err.message}`);
    await cafesdk.result.pushData({ error: err.message, status: 'failed' });
    throw err;
  }
}

run();
