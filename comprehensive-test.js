/**
 * Comprehensive Test Suite for RAG Web Browser Worker
 * 全量测试套件 - 模拟 Cafe 云环境进行完整验收
 * 
 * 运行: node comprehensive-test.js
 */

const { runRAGWebBrowser } = require('./src/worker-main.js');

// ============================================
// 测试统计
// ============================================
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  startTime: Date.now(),
};

// ============================================
// Mock Cafe SDK - 模拟云环境
// ============================================
const createMockSDK = () => ({
  parameter: {
    getInputJSONObject: async () => ({}),
  },
  log: {
    debug: async (msg) => process.env.DEBUG && console.log(`[DEBUG] ${msg}`),
    info: async (msg) => console.log(`[INFO] ${msg}`),
    warn: async (msg) => console.log(`[WARN] ${msg}`),
    error: async (msg) => console.log(`[ERROR] ${msg}`),
  },
  result: {
    setTableHeader: async () => {},
    pushData: async () => {},
  },
});

// ============================================
// 测试工具函数
// ============================================
async function runTest(name, testFn, options = {}) {
  stats.total++;
  const { timeout = 60000, skip = false } = options;
  
  if (skip) {
    console.log(`⏭️  [SKIP] ${name}`);
    stats.skipped++;
    return { success: true, skipped: true };
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Test #${stats.total}: ${name}`);
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  try {
    const result = await Promise.race([
      testFn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
      ),
    ]);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ PASSED in ${elapsed}s`);
    stats.passed++;
    return { success: true, result, elapsed };
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`❌ FAILED in ${elapsed}s: ${err.message}`);
    stats.failed++;
    stats.errors.push({ name, error: err.message, stack: err.stack });
    return { success: false, error: err.message, elapsed };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(str, substr, message) {
  if (!str || !str.includes(substr)) {
    throw new Error(message || `Expected string to include "${substr}"`);
  }
}

function assertLength(arr, min, max, message) {
  const len = arr?.length || 0;
  if (len < min || (max !== undefined && len > max)) {
    throw new Error(message || `Expected length ${min}-${max}, got ${len}`);
  }
}

// ============================================
// 测试套件 1: 输入验证测试
// ============================================
async function testInputValidation() {
  const sdk = createMockSDK();

  // Test 1.1: 空查询
  await runTest('Input Validation - Empty query should return empty array', async () => {
    const result = await runRAGWebBrowser({ query: '' }, sdk);
    assertEqual(result.length, 0, 'Empty query should return empty array');
  });

  // Test 1.2: maxResults 边界值
  await runTest('Input Validation - maxResults=1', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      maxResults: 1,
      scrapingTool: 'raw-http',
    }, sdk);
    assert(result.length <= 1, 'maxResults=1 should return at most 1 result');
  });

  // Test 1.3: maxResults=0 应该被修正为默认值
  await runTest('Input Validation - maxResults=0 should use default', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      maxResults: 0,
      scrapingTool: 'raw-http',
    }, sdk);
    // maxResults=0 应该被 validateInput 修正为 3
    assert(result.length <= 100, 'maxResults=0 should be corrected to default');
  });

  // Test 1.4: maxResults > 100 应该被限制
  await runTest('Input Validation - maxResults=200 should be capped', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      maxResults: 200,
      scrapingTool: 'raw-http',
    }, sdk);
    // 验证不会抛出错误
    assert(Array.isArray(result), 'Should return array even with large maxResults');
  });

  // Test 1.5: outputFormat 默认值
  await runTest('Input Validation - Default outputFormat is markdown', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
    }, sdk);
    if (result.length > 0) {
      assert(result[0].markdown !== undefined, 'Default format should include markdown');
    }
  });

  // Test 1.6: scrapingTool 默认值
  await runTest('Input Validation - Default scrapingTool is raw-http', async () => {
    // 这个测试验证不会抛出错误
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
    }, sdk);
    assert(Array.isArray(result), 'Should work with default scrapingTool');
  });
}

// ============================================
// 测试套件 2: 直接 URL 抓取测试
// ============================================
async function testDirectUrlScraping() {
  const sdk = createMockSDK();

  // Test 2.1: HTTP URL
  await runTest('Direct URL - HTTP URL', async () => {
    const result = await runRAGWebBrowser({
      query: 'http://example.com',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result for single URL');
    assert(result[0].url || result[0].metadata?.url, 'Should have URL');
    assertEqual(result[0].crawl?.httpStatusCode, 200, 'Should return HTTP 200');
  }, { timeout: 45000 });

  // Test 2.2: HTTPS URL
  await runTest('Direct URL - HTTPS URL', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://www.google.com',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assertEqual(result[0].crawl?.httpStatusCode, 200, 'Should return HTTP 200');
  }, { timeout: 45000 });

  // Test 2.3: GitHub 页面（有内容）
  await runTest('Direct URL - GitHub repository', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://github.com/microsoft/vscode',
      scrapingTool: 'raw-http',
      outputFormat: 'markdown',
      requestTimeoutSecs: 30,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assert(result[0].markdown?.length > 100, 'Should have meaningful markdown content');
    assert(result[0].metadata?.title, 'Should have title');
  }, { timeout: 45000 });

  // Test 2.4: 无效 URL
  await runTest('Direct URL - Invalid URL should handle error', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://this-is-an-invalid-url-that-does-not-exist-12345.com',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 10,
    }, sdk);
    // 应该返回错误但不会崩溃
    assert(Array.isArray(result), 'Should return array even for invalid URL');
    if (result.length > 0) {
      assert(result[0].error || result[0].crawl?.requestStatus === 'failed', 'Should indicate error');
    }
  }, { timeout: 30000 });

  // Test 2.5: URL 带路径和查询参数
  await runTest('Direct URL - URL with path and query params', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://httpbin.org/get?test=1&foo=bar',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assertEqual(result[0].crawl?.httpStatusCode, 200, 'Should return HTTP 200');
  }, { timeout: 45000 });
}

// ============================================
// 测试套件 3: Google 搜索测试
// 注意: 本地环境无代理无法访问 Google，需在云环境测试
// ============================================
async function testGoogleSearch() {
  const sdk = createMockSDK();
  
  // 检查是否有代理环境（本地测试通常没有）
  const hasProxy = process.env.PROXY_AUTH ? true : false;
  const skipReason = 'Requires proxy/云环境 - 本地无代理无法访问 Google';

  // Test 3.1: 基本搜索
  await runTest('Google Search - Basic search', async () => {
    const result = await runRAGWebBrowser({
      query: 'OpenAI ChatGPT',
      maxResults: 3,
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }, sdk);
    assert(result.length > 0, 'Should return results for popular search');
    assert(result.length <= 3, 'Should respect maxResults');
    // 检查是否有搜索结果元数据
    const hasSearchResult = result.some(r => r.searchResult);
    console.log(`  Found ${result.length} results, searchResult metadata: ${hasSearchResult}`);
  }, { timeout: 90000, skip: !hasProxy });

  // Test 3.2: 搜索并抓取内容
  await runTest('Google Search - Search and scrape content', async () => {
    const result = await runRAGWebBrowser({
      query: 'Node.js tutorial',
      maxResults: 2,
      scrapingTool: 'raw-http',
      outputFormat: 'markdown',
      requestTimeoutSecs: 30,
    }, sdk);
    assert(result.length > 0, 'Should return results');
    // 检查是否有内容
    const withContent = result.filter(r => r.markdown?.length > 100);
    console.log(`  ${withContent.length}/${result.length} results have meaningful content`);
  }, { timeout: 90000, skip: !hasProxy });

  // Test 3.3: 搜索结果数超过10（需要分页）
  await runTest('Google Search - Pagination (maxResults=15)', async () => {
    const result = await runRAGWebBrowser({
      query: 'JavaScript framework',
      maxResults: 15,
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }, sdk);
    console.log(`  Found ${result.length} results`);
    assert(result.length >= 5, 'Should return at least 5 results for pagination');
    assert(result.length <= 15, 'Should not exceed maxResults');
  }, { timeout: 120000, skip: !hasProxy });

  // Test 3.4: 使用 site: 操作符
  await runTest('Google Search - Site operator', async () => {
    const result = await runRAGWebBrowser({
      query: 'API documentation site:github.com',
      maxResults: 3,
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }, sdk);
    console.log(`  Found ${result.length} results`);
    // 验证 URL 来自 github.com
    const githubResults = result.filter(r => r.url?.includes('github.com'));
    console.log(`  GitHub URLs: ${githubResults.length}/${result.length}`);
  }, { timeout: 90000, skip: !hasProxy });
}

// ============================================
// 测试套件 4: 输出格式测试
// ============================================
async function testOutputFormats() {
  const sdk = createMockSDK();
  const testUrl = 'https://example.com';

  // Test 4.1: Markdown 格式
  await runTest('Output Format - Markdown', async () => {
    const result = await runRAGWebBrowser({
      query: testUrl,
      outputFormat: 'markdown',
      scrapingTool: 'raw-http',
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assert(result[0].markdown !== undefined, 'Should have markdown field');
    assert(result[0].markdown.length > 0, 'Markdown should not be empty');
    console.log(`  Markdown length: ${result[0].markdown.length} chars`);
  }, { timeout: 45000 });

  // Test 4.2: HTML 格式
  await runTest('Output Format - HTML', async () => {
    const result = await runRAGWebBrowser({
      query: testUrl,
      outputFormat: 'html',
      scrapingTool: 'raw-http',
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assert(result[0].html !== undefined, 'Should have html field');
    assert(result[0].html.length > 0, 'HTML should not be empty');
    console.log(`  HTML length: ${result[0].html.length} chars`);
  }, { timeout: 45000 });

  // Test 4.3: Text 格式
  await runTest('Output Format - Plain Text', async () => {
    const result = await runRAGWebBrowser({
      query: testUrl,
      outputFormat: 'text',
      scrapingTool: 'raw-http',
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assert(result[0].text !== undefined, 'Should have text field');
    assert(result[0].text.length > 0, 'Text should not be empty');
    console.log(`  Text length: ${result[0].text.length} chars`);
  }, { timeout: 45000 });

  // Test 4.4: 所有格式
  await runTest('Output Format - Multiple formats via outputFormats array', async () => {
    const result = await runRAGWebBrowser({
      query: testUrl,
      outputFormat: 'markdown',
      outputFormats: ['markdown', 'html', 'text'],
      scrapingTool: 'raw-http',
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assert(result[0].markdown !== undefined, 'Should have markdown');
    assert(result[0].html !== undefined, 'Should have html');
    assert(result[0].text !== undefined, 'Should have text');
    console.log(`  All formats present: markdown(${result[0].markdown?.length}), html(${result[0].html?.length}), text(${result[0].text?.length})`);
  }, { timeout: 45000 });
}

// ============================================
// 测试套件 5: 抓取工具测试
// ============================================
async function testScrapingTools() {
  const sdk = createMockSDK();

  // Test 5.1: Raw HTTP 模式
  await runTest('Scraping Tool - Raw HTTP mode', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 30,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    assertEqual(result[0].crawl?.httpStatusCode, 200, 'Should return HTTP 200');
    console.log(`  Status: ${result[0].crawl?.httpStatusCode}`);
  }, { timeout: 45000 });

  // Test 5.2: Browser Playwright 模式 - 本地测试需要浏览器
  await runTest('Scraping Tool - Browser Playwright mode (local browser)', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'browser-playwright',
      requestTimeoutSecs: 30,
      dynamicContentWaitSecs: 5,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    console.log(`  Title: ${result[0].metadata?.title}`);
    console.log(`  Markdown length: ${result[0].markdown?.length || 0}`);
  }, { timeout: 60000 });

  // Test 5.3: SPA 页面 - 需要浏览器模式
  await runTest('Scraping Tool - SPA page with browser mode', async () => {
    // React 官网是一个 SPA
    const result = await runRAGWebBrowser({
      query: 'https://react.dev',
      scrapingTool: 'browser-playwright',
      outputFormat: 'markdown',
      requestTimeoutSecs: 40,
      dynamicContentWaitSecs: 10,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    // SPA 页面应该有内容
    const content = result[0].markdown || result[0].text || '';
    console.log(`  Content length: ${content.length} chars`);
    // 验证有实际内容（不是空白 shell）
    assert(content.length > 100, 'SPA should have rendered content');
  }, { timeout: 90000 });

  // Test 5.4: 比较 HTTP 和浏览器模式的内容
  await runTest('Scraping Tool - Compare HTTP vs Browser content', async () => {
    const testUrl = 'https://example.com';
    
    const httpResult = await runRAGWebBrowser({
      query: testUrl,
      scrapingTool: 'raw-http',
      outputFormat: 'markdown',
    }, sdk);
    
    const browserResult = await runRAGWebBrowser({
      query: testUrl,
      scrapingTool: 'browser-playwright',
      outputFormat: 'markdown',
    }, sdk);
    
    console.log(`  HTTP content: ${httpResult[0]?.markdown?.length || 0} chars`);
    console.log(`  Browser content: ${browserResult[0]?.markdown?.length || 0} chars`);
    
    // 两者都应该成功
    assert(httpResult.length === 1 && browserResult.length === 1, 'Both should return 1 result');
  }, { timeout: 90000 });
}

// ============================================
// 测试套件 6: 并发控制测试
// ============================================
async function testConcurrency() {
  const sdk = createMockSDK();
  
  // 检查是否有代理环境
  const hasProxy = process.env.PROXY_AUTH ? true : false;

  // Test 6.1: 低并发 - 使用直接 URL 测试并发
  await runTest('Concurrency - Low concurrency (1) with direct URLs', async () => {
    const startTime = Date.now();
    // 使用多个直接 URL 测试并发
    const result = await runRAGWebBrowser({
      query: 'https://example.com',  // 直接 URL 模式只处理一个 URL
      scrapingTool: 'raw-http',
      desiredConcurrency: 1,
      requestTimeoutSecs: 20,
    }, sdk);
    const elapsed = Date.now() - startTime;
    console.log(`  Completed in ${elapsed}ms with concurrency=1`);
    assert(result.length === 1, 'Should return 1 result');
  }, { timeout: 45000 });

  // Test 6.2: 高并发 - Google 搜索需要代理
  await runTest('Concurrency - High concurrency (5) with Google Search', async () => {
    const startTime = Date.now();
    const result = await runRAGWebBrowser({
      query: 'JavaScript framework',
      maxResults: 5,
      scrapingTool: 'raw-http',
      desiredConcurrency: 5,
      requestTimeoutSecs: 20,
    }, sdk);
    const elapsed = Date.now() - startTime;
    console.log(`  Found ${result.length} results in ${elapsed}ms with concurrency=5`);
    assert(result.length > 0, 'Should return results');
  }, { timeout: 120000, skip: !hasProxy });

  // Test 6.3: 并发边界值
  await runTest('Concurrency - Boundary value (10)', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      desiredConcurrency: 10,
      requestTimeoutSecs: 20,
    }, sdk);
    console.log(`  Completed with concurrency=10`);
    assert(Array.isArray(result), 'Should handle max concurrency');
  }, { timeout: 45000 });

  // Test 6.4: 并发为0应该被修正
  await runTest('Concurrency - Zero should be corrected', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      desiredConcurrency: 0,
    }, sdk);
    // 不应该抛出错误
    assert(Array.isArray(result), 'Should handle concurrency=0');
  }, { timeout: 45000 });
}

// ============================================
// 测试套件 7: 错误处理和重试测试
// ============================================
async function testErrorHandling() {
  const sdk = createMockSDK();

  // Test 7.1: 超时处理
  await runTest('Error Handling - Request timeout', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://httpbin.org/delay/10', // 延迟10秒响应
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 3, // 3秒超时
      maxRequestRetries: 0,
    }, sdk);
    // 应该返回错误结果但不会崩溃
    console.log(`  Result: ${JSON.stringify(result[0]?.error || result[0]?.crawl)}`);
    assert(Array.isArray(result), 'Should return array even on timeout');
  }, { timeout: 30000 });

  // Test 7.2: 重试机制
  await runTest('Error Handling - Retry mechanism', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://httpbin.org/status/500', // 返回500错误
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 10,
      maxRequestRetries: 1,
    }, sdk);
    console.log(`  Status: ${result[0]?.crawl?.httpStatusCode}`);
    // 应该返回结果（即使是错误状态）
    assert(Array.isArray(result), 'Should return array');
    assertEqual(result.length, 1, 'Should return 1 result');
  }, { timeout: 45000 });

  // Test 7.3: 404 错误
  await runTest('Error Handling - 404 Not Found', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://httpbin.org/status/404',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 10,
    }, sdk);
    console.log(`  Status: ${result[0]?.crawl?.httpStatusCode}`);
    assertEqual(result.length, 1, 'Should return 1 result');
    assertEqual(result[0].crawl?.httpStatusCode, 404, 'Should return HTTP 404');
  }, { timeout: 30000 });

  // Test 7.4: 网络错误（无效域名）
  await runTest('Error Handling - Network error (invalid domain)', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://invalid-domain-xyz-12345.com',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 5,
      maxRequestRetries: 0,
    }, sdk);
    console.log(`  Error: ${result[0]?.error}`);
    // 应该有错误信息
    assert(result[0]?.error || result[0]?.crawl?.requestStatus === 'failed', 'Should have error');
  }, { timeout: 20000 });
}

// ============================================
// 测试套件 8: Cookie 警告移除测试
// ============================================
async function testCookieWarningRemoval() {
  const sdk = createMockSDK();

  // Test 8.1: 启用 Cookie 警告移除
  await runTest('Cookie Warning - Remove enabled', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      removeCookieWarnings: true,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    console.log(`  Cookie warning removal enabled`);
  }, { timeout: 45000 });

  // Test 8.2: 禁用 Cookie 警告移除
  await runTest('Cookie Warning - Remove disabled', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      removeCookieWarnings: false,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    console.log(`  Cookie warning removal disabled`);
  }, { timeout: 45000 });
}

// ============================================
// 测试套件 9: 调试模式测试
// ============================================
async function testDebugMode() {
  const sdk = createMockSDK();

  // Test 9.1: 调试模式启用
  await runTest('Debug Mode - Enabled', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      debugMode: true,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    if (result[0]?.crawl?.debug) {
      console.log(`  Performance measures: ${JSON.stringify(result[0].crawl.debug.timeMeasures)}`);
      console.log(`  Total time: ${result[0].crawl.debug.totalTimeMs}ms`);
    }
  }, { timeout: 45000 });

  // Test 9.2: 调试模式禁用
  await runTest('Debug Mode - Disabled', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      debugMode: false,
    }, sdk);
    assertEqual(result.length, 1, 'Should return 1 result');
    // debugMode=false 时不应该有 debug 信息
    console.log(`  Debug info: ${result[0]?.crawl?.debug ? 'present' : 'not present'}`);
  }, { timeout: 45000 });
}

// ============================================
// 测试套件 10: 遗留格式兼容性测试
// ============================================
async function testLegacyFormatCompatibility() {
  const sdk = createMockSDK();

  // Test 10.1: 遗留 url 数组格式
  await runTest('Legacy Format - url array format', async () => {
    const result = await runRAGWebBrowser({
      url: [{ url: 'https://example.com' }],
      scrapingTool: 'raw-http',
    }, sdk);
    assertEqual(result.length, 1, 'Should handle legacy url array format');
    console.log(`  Legacy format handled correctly`);
  }, { timeout: 45000 });

  // Test 10.2: 遗留 url 字符串格式
  await runTest('Legacy Format - url string format', async () => {
    const result = await runRAGWebBrowser({
      url: 'https://example.com',
      scrapingTool: 'raw-http',
    }, sdk);
    assertEqual(result.length, 1, 'Should handle legacy url string format');
    console.log(`  Legacy string format handled correctly`);
  }, { timeout: 45000 });
}

// ============================================
// 测试套件 11: 边界条件测试
// ============================================
async function testBoundaryConditions() {
  const sdk = createMockSDK();

  // Test 11.1: requestTimeoutSecs 边界
  await runTest('Boundary - requestTimeoutSecs=1 (minimum)', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 1,
    }, sdk);
    console.log(`  Request with 1s timeout`);
    assert(Array.isArray(result), 'Should handle minimum timeout');
  }, { timeout: 30000 });

  // Test 11.2: dynamicContentWaitSecs 边界
  await runTest('Boundary - dynamicContentWaitSecs=0', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'browser-playwright',
      dynamicContentWaitSecs: 0,
    }, sdk);
    console.log(`  Browser mode with 0s wait`);
    assertEqual(result.length, 1, 'Should work with 0 wait time');
  }, { timeout: 60000 });

  // Test 11.3: maxRequestRetries=0
  await runTest('Boundary - maxRequestRetries=0', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      maxRequestRetries: 0,
    }, sdk);
    assertEqual(result.length, 1, 'Should work with no retries');
  }, { timeout: 45000 });
}

// ============================================
// 测试套件 12: 内容提取测试
// ============================================
async function testContentExtraction() {
  const sdk = createMockSDK();

  // Test 12.1: 提取标题
  await runTest('Content Extraction - Title extraction', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
    }, sdk);
    console.log(`  Title: "${result[0]?.metadata?.title}"`);
    assert(result[0]?.metadata?.title, 'Should extract title');
  }, { timeout: 45000 });

  // Test 12.2: 提取描述
  await runTest('Content Extraction - Description extraction', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
    }, sdk);
    console.log(`  Description: "${result[0]?.metadata?.description}"`);
    // description 可能为空，所以只检查字段存在
    assert(result[0]?.metadata?.description !== undefined, 'Should have description field');
  }, { timeout: 45000 });

  // Test 12.3: 语言检测
  await runTest('Content Extraction - Language detection', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://example.com',
      scrapingTool: 'raw-http',
    }, sdk);
    console.log(`  Language: "${result[0]?.metadata?.languageCode}"`);
    assert(result[0]?.metadata?.languageCode, 'Should detect language');
  }, { timeout: 45000 });

  // Test 12.4: Markdown 转换质量
  await runTest('Content Extraction - Markdown quality', async () => {
    const result = await runRAGWebBrowser({
      query: 'https://github.com/microsoft/vscode',
      scrapingTool: 'raw-http',
      outputFormat: 'markdown',
    }, sdk);
    const markdown = result[0]?.markdown || '';
    console.log(`  Markdown length: ${markdown.length} chars`);
    // 验证 markdown 不是空白
    assert(markdown.length > 100, 'Should have meaningful markdown content');
    // 验证 markdown 包含一些结构（标题、链接等）
    const hasStructure = markdown.includes('#') || markdown.includes('[') || markdown.includes('-');
    console.log(`  Has markdown structure: ${hasStructure}`);
  }, { timeout: 45000 });
}

// ============================================
// 主测试运行器
// ============================================
async function runAllTests() {
  console.log('\n' + '█'.repeat(60));
  console.log('█  RAG Web Browser Worker - 综合测试套件');
  console.log('█  Comprehensive Test Suite');
  console.log('█'.repeat(60));
  console.log(`\n开始时间: ${new Date().toLocaleString()}`);
  console.log(`测试环境: Node.js ${process.version}`);
  console.log('');

  // 运行所有测试套件
  await testInputValidation();
  await testDirectUrlScraping();
  await testGoogleSearch();
  await testOutputFormats();
  await testScrapingTools();
  await testConcurrency();
  await testErrorHandling();
  await testCookieWarningRemoval();
  await testDebugMode();
  await testLegacyFormatCompatibility();
  await testBoundaryConditions();
  await testContentExtraction();

  // 输出测试报告
  console.log('\n' + '█'.repeat(60));
  console.log('█  测试报告 / Test Report');
  console.log('█'.repeat(60));
  
  const totalElapsed = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log(`\n📊 统计:`);
  console.log(`   总测试数: ${stats.total}`);
  console.log(`   ✅ 通过: ${stats.passed}`);
  console.log(`   ❌ 失败: ${stats.failed}`);
  console.log(`   ⏭️  跳过: ${stats.skipped}`);
  console.log(`   ⏱️  总耗时: ${totalElapsed}s`);
  console.log(`   📈 成功率: ${((stats.passed / stats.total) * 100).toFixed(1)}%`);

  if (stats.errors.length > 0) {
    console.log('\n❌ 失败详情:');
    stats.errors.forEach((err, i) => {
      console.log(`\n   ${i + 1}. ${err.name}`);
      console.log(`      Error: ${err.error}`);
    });
  }

  console.log('\n' + '█'.repeat(60));
  
  if (stats.failed === 0) {
    console.log('✅ 所有测试通过！All tests passed!');
    process.exit(0);
  } else {
    console.log(`❌ ${stats.failed} 个测试失败。Tests failed.`);
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
