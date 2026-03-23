/**
 * Local Test Script for RAG Web Browser Worker
 * Run: node local-test.js
 */

const { runRAGWebBrowser } = require('./src/worker-main.js');

const mockCafeSDK = {
  parameter: {
    getInputJSONObject: async () => ({
      query: 'OpenAI GPT-4',
      maxResults: 3,
      outputFormat: 'markdown',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
      debugMode: true,
      desiredConcurrency: 3,
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

async function testDirectUrl() {
  console.log('');
  console.log('========================================');
  console.log('Test 1: Direct URL Scraping');
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
        debugMode: true,
      },
      mockCafeSDK
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log(`Test 1 completed in ${elapsed} seconds`);
    console.log(`Results: ${results.length} items`);

    if (results.length > 0) {
      const first = results[0];
      console.log('First result:');
      console.log(`  URL: ${first.url}`);
      console.log(`  Title: ${first.metadata?.title}`);
      console.log(`  Markdown length: ${first.markdown?.length || 0} chars`);
      console.log(`  Status: ${first.crawl?.httpStatusCode}`);
      if (first.crawl?.debug) {
        console.log(`  Performance: ${JSON.stringify(first.crawl.debug.timeMeasures)}`);
      }
    }

    console.log('Test 1 PASSED!');
    return true;
  } catch (err) {
    console.log(`Test 1 FAILED: ${err.message}`);
    console.log(err.stack);
    return false;
  }
}

async function testGoogleSearch() {
  console.log('');
  console.log('========================================');
  console.log('Test 2: Google Search + Scraping');
  console.log('========================================');
  console.log('');

  const startTime = Date.now();

  try {
    const results = await runRAGWebBrowser(
      {
        query: 'OpenAI GPT-4 latest news',
        maxResults: 3,
        outputFormat: 'markdown',
        scrapingTool: 'raw-http',
        requestTimeoutSecs: 30,
        debugMode: true,
        desiredConcurrency: 3,
      },
      mockCafeSDK
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log(`Test 2 completed in ${elapsed} seconds`);
    console.log(`Results: ${results.length} items`);

    results.forEach((result, index) => {
      console.log(`\nResult ${index + 1}:`);
      console.log(`  URL: ${result.url || result.metadata?.url}`);
      console.log(`  Title: ${result.metadata?.title || 'N/A'}`);
      console.log(`  Markdown length: ${result.markdown?.length || 0} chars`);
      console.log(`  Status: ${result.crawl?.httpStatusCode || result.status}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    });

    console.log('Test 2 PASSED!');
    return true;
  } catch (err) {
    console.log(`Test 2 FAILED: ${err.message}`);
    console.log(err.stack);
    return false;
  }
}

async function testConcurrency() {
  console.log('');
  console.log('========================================');
  console.log('Test 3: Concurrent Scraping');
  console.log('========================================');
  console.log('');

  const startTime = Date.now();

  try {
    const results = await runRAGWebBrowser(
      {
        query: 'Node.js best practices',
        maxResults: 5,
        outputFormat: 'markdown',
        scrapingTool: 'raw-http',
        requestTimeoutSecs: 30,
        debugMode: true,
        desiredConcurrency: 5,
      },
      mockCafeSDK
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log(`Test 3 completed in ${elapsed} seconds`);
    console.log(`Results: ${results.length} items`);
    console.log(`Average time per URL: ${(elapsed / results.length).toFixed(2)}s`);

    console.log('Test 3 PASSED!');
    return true;
  } catch (err) {
    console.log(`Test 3 FAILED: ${err.message}`);
    console.log(err.stack);
    return false;
  }
}

async function runAllTests() {
  console.log('');
  console.log('########################################');
  console.log('RAG Web Browser Worker - Test Suite');
  console.log('########################################');

  const results = [];

  results.push(await testDirectUrl());
  results.push(await testGoogleSearch());
  results.push(await testConcurrency());

  console.log('');
  console.log('########################################');
  console.log('Test Summary');
  console.log('########################################');
  console.log(`Passed: ${results.filter(r => r).length}/${results.length}`);

  if (results.every(r => r)) {
    console.log('All tests PASSED!');
    process.exit(0);
  } else {
    console.log('Some tests FAILED!');
    process.exit(1);
  }
}

runAllTests();
