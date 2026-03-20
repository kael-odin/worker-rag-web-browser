/**
 * Local Test Script for RAG Web Browser Worker
 * Run: node local-test.js
 */

const { runRAGWebBrowser } = require('./src/worker-main.js');

const mockCafeSDK = {
  parameter: {
    getInputJSONObject: async () => ({
      query: 'https://github.com/microsoft/vscode',
      maxResults: 1,
      outputFormat: 'markdown',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }),
  },
  log: {
    debug: async (msg) => console.log(`[DEBUG] ${msg}`),
    info: async (msg) => console.log(`[INFO] ${msg}`),
    warn: async (msg) => console.log(`[WARN] ${msg}`),
    error: async (msg) => console.log(`[ERROR] ${msg}`),
  },
  result: {
    setTableHeader: async (headers) => {
      console.log('[SDK] Table header set:', headers.map(h => h.label).join(', '));
    },
    pushData: async (data) => {
      console.log('[SDK] Push data:', JSON.stringify(data).substring(0, 200) + '...');
    },
  },
};

async function test() {
  console.log('');
  console.log('========================================');
  console.log('RAG Web Browser Worker - Local Test');
  console.log('========================================');
  console.log('');

  const startTime = Date.now();

  try {
    const results = await runRAGWebBrowser(
      {
        query: 'https://github.com/microsoft/vscode',
        maxResults: 1,
        outputFormat: 'markdown',
        scrapingTool: 'raw-http',
        requestTimeoutSecs: 30,
      },
      mockCafeSDK
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('========================================');
    console.log(`Test completed in ${elapsed} seconds`);
    console.log(`Results: ${results.length} items`);
    console.log('========================================');

    if (results.length > 0) {
      const first = results[0];
      console.log('');
      console.log('First result:');
      console.log(`  URL: ${first.url}`);
      console.log(`  Title: ${first.metadata?.title}`);
      console.log(`  Markdown length: ${first.markdown?.length || 0} chars`);
      console.log(`  Status: ${first.crawl?.httpStatusCode}`);
    }

    console.log('');
    console.log('Test PASSED!');
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('');
    console.log('========================================');
    console.log(`Test FAILED in ${elapsed} seconds`);
    console.log(`Error: ${err.message}`);
    console.log('========================================');
    console.log('');
    console.log('Test FAILED!');
    process.exit(1);
  }
}

test();
