/**
 * Cafe Platform Simulator Test
 * 模拟 Cafe 云环境进行完整验收测试
 * 
 * 运行方式:
 * 1. 本地测试（无代理）: node cafe-simulator-test.js
 * 2. 模拟云环境（设置 PROXY_AUTH）: PROXY_AUTH=user:pass node cafe-simulator-test.js
 */

const { runRAGWebBrowser } = require('./src/worker-main.js');
const fs = require('fs');
const path = require('path');

// ============================================
// Cafe SDK 模拟器
// ============================================
class CafeSDKSimulator {
  constructor() {
    this.logs = [];
    this.results = [];
    this.startTime = Date.now();
  }

  parameter = {
    getInputJSONObject: async () => ({}),
  };

  log = {
    debug: async (msg) => this.logs.push({ level: 'DEBUG', msg, time: Date.now() }),
    info: async (msg) => {
      this.logs.push({ level: 'INFO', msg, time: Date.now() });
      console.log(`[INFO] ${msg}`);
    },
    warn: async (msg) => {
      this.logs.push({ level: 'WARN', msg, time: Date.now() });
      console.log(`[WARN] ${msg}`);
    },
    error: async (msg) => {
      this.logs.push({ level: 'ERROR', msg, time: Date.now() });
      console.log(`[ERROR] ${msg}`);
    },
  };

  result = {
    setTableHeader: async (headers) => {
      this.headers = headers;
    },
    pushData: async (data) => {
      this.results.push(data);
    },
  };

  getReport() {
    return {
      duration: Date.now() - this.startTime,
      logs: this.logs,
      results: this.results,
      resultCount: this.results.length,
    };
  }
}

// ============================================
// 测试用例定义
// ============================================
const TEST_CASES = [
  // === 基础功能测试 ===
  {
    name: 'Direct URL - Markdown output',
    input: {
      query: 'https://example.com',
      outputFormat: 'markdown',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (results.length !== 1) return `Expected 1 result, got ${results.length}`;
      if (!results[0].markdown) return 'Missing markdown field';
      if (!results[0].metadata?.title) return 'Missing title';
      return null;
    },
  },
  {
    name: 'Direct URL - HTML output',
    input: {
      query: 'https://example.com',
      outputFormat: 'html',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (!results[0]?.html) return 'Missing html field';
      return null;
    },
  },
  {
    name: 'Direct URL - Text output',
    input: {
      query: 'https://example.com',
      outputFormat: 'text',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (!results[0]?.text) return 'Missing text field';
      return null;
    },
  },
  
  // === 浏览器模式测试 ===
  {
    name: 'Browser mode - Static page',
    input: {
      query: 'https://example.com',
      outputFormat: 'markdown',
      scrapingTool: 'browser-playwright',
      dynamicContentWaitSecs: 2,
    },
    validate: (results) => {
      if (results.length !== 1) return `Expected 1 result, got ${results.length}`;
      if (!results[0].markdown) return 'Missing markdown field';
      return null;
    },
  },
  {
    name: 'Browser mode - SPA page',
    input: {
      query: 'https://react.dev',
      outputFormat: 'markdown',
      scrapingTool: 'browser-playwright',
      dynamicContentWaitSecs: 10,
      requestTimeoutSecs: 60,
    },
    validate: (results) => {
      if (!results[0]?.markdown || results[0].markdown.length < 100) {
        return 'SPA page should have rendered content';
      }
      return null;
    },
    timeout: 90000,
  },

  // === 遗留格式兼容性测试 ===
  {
    name: 'Legacy format - URL array',
    input: {
      url: [{ url: 'https://example.com' }],
      outputFormat: 'markdown',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (results.length !== 1) return 'Should handle legacy url array';
      if (!results[0].url) return 'Missing url field';
      return null;
    },
  },
  {
    name: 'Legacy format - URL string',
    input: {
      url: 'https://example.com',
      outputFormat: 'markdown',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (results.length !== 1) return 'Should handle legacy url string';
      return null;
    },
  },

  // === 边界值测试 ===
  {
    name: 'Boundary - maxResults=1',
    input: {
      query: 'https://example.com',
      maxResults: 1,
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (results.length > 1) return 'Should respect maxResults=1';
      return null;
    },
  },
  {
    name: 'Boundary - requestTimeoutSecs=1',
    input: {
      query: 'https://example.com',
      requestTimeoutSecs: 1,
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      // Should not crash
      return null;
    },
  },
  {
    name: 'Boundary - desiredConcurrency=0 (should be corrected)',
    input: {
      query: 'https://example.com',
      desiredConcurrency: 0,
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (results.length !== 1) return 'Should correct concurrency=0 to 1';
      return null;
    },
  },

  // === 错误处理测试 ===
  {
    name: 'Error handling - Invalid URL',
    input: {
      query: 'https://invalid-domain-test-12345.com',
      scrapingTool: 'raw-http',
      requestTimeoutSecs: 5,
      maxRequestRetries: 0,
    },
    validate: (results) => {
      if (!results[0]?.error) return 'Should have error for invalid URL';
      return null;
    },
  },
  {
    name: 'Error handling - HTTP 404',
    input: {
      query: 'https://httpbin.org/status/404',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (results[0]?.crawl?.httpStatusCode !== 404) return 'Should return 404 status';
      return null;
    },
  },
  {
    name: 'Error handling - HTTP 500',
    input: {
      query: 'https://httpbin.org/status/500',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (results[0]?.crawl?.httpStatusCode !== 500) return 'Should return 500 status';
      return null;
    },
  },

  // === 内容提取测试 ===
  {
    name: 'Content extraction - GitHub repo',
    input: {
      query: 'https://github.com/microsoft/vscode',
      outputFormat: 'markdown',
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      const md = results[0]?.markdown || '';
      if (md.length < 100) return 'Should extract meaningful content';
      if (!results[0]?.metadata?.title) return 'Should extract title';
      return null;
    },
  },

  // === 调试模式测试 ===
  {
    name: 'Debug mode - Performance metrics',
    input: {
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      debugMode: true,
    },
    validate: (results) => {
      if (!results[0]?.crawl?.debug) return 'Should include debug info';
      if (!results[0]?.crawl?.debug?.timeMeasures) return 'Should include timeMeasures';
      return null;
    },
  },

  // === Cookie 警告移除测试 ===
  {
    name: 'Cookie warning - Remove enabled',
    input: {
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      removeCookieWarnings: true,
    },
    validate: (results) => {
      if (results.length !== 1) return 'Should work with removeCookieWarnings=true';
      return null;
    },
  },
  {
    name: 'Cookie warning - Remove disabled',
    input: {
      query: 'https://example.com',
      scrapingTool: 'raw-http',
      removeCookieWarnings: false,
    },
    validate: (results) => {
      if (results.length !== 1) return 'Should work with removeCookieWarnings=false';
      return null;
    },
  },

  // === 多格式输出测试 ===
  {
    name: 'Multiple output formats',
    input: {
      query: 'https://example.com',
      outputFormats: ['markdown', 'html', 'text'],
      scrapingTool: 'raw-http',
    },
    validate: (results) => {
      if (!results[0]?.markdown) return 'Missing markdown';
      if (!results[0]?.html) return 'Missing html';
      if (!results[0]?.text) return 'Missing text';
      return null;
    },
  },
];

// ============================================
// 测试运行器
// ============================================
async function runTests() {
  console.log('\n' + '█'.repeat(60));
  console.log('█  Cafe Platform Simulator Test');
  console.log('█  模拟 Cafe 云环境验收测试');
  console.log('█'.repeat(60));
  console.log(`\n开始时间: ${new Date().toLocaleString()}`);
  console.log(`环境: ${process.env.PROXY_AUTH ? '模拟云环境(有代理)' : '本地环境(无代理)'}`);
  console.log(`Node.js: ${process.version}`);
  console.log('');

  const stats = {
    total: TEST_CASES.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    startTime: Date.now(),
  };

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    const testNum = i + 1;
    
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Test #${testNum}/${TEST_CASES.length}: ${testCase.name}`);
    console.log('─'.repeat(50));

    const sdk = new CafeSDKSimulator();
    const timeout = testCase.timeout || 30000;
    
    try {
      const startTime = Date.now();
      
      const results = await Promise.race([
        runRAGWebBrowser(testCase.input, sdk),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
        ),
      ]);
      
      const elapsed = Date.now() - startTime;
      
      // 验证结果
      const validationError = testCase.validate(results);
      
      if (validationError) {
        console.log(`❌ FAILED (${elapsed}ms): ${validationError}`);
        stats.failed++;
        stats.errors.push({ name: testCase.name, error: validationError });
      } else {
        console.log(`✅ PASSED (${elapsed}ms)`);
        stats.passed++;
      }
      
      // 输出结果摘要
      if (results.length > 0) {
        const r = results[0];
        console.log(`   URL: ${r.url || r.metadata?.url}`);
        console.log(`   Status: ${r.crawl?.httpStatusCode || r.status || 'N/A'}`);
        if (r.markdown) console.log(`   Markdown: ${r.markdown.length} chars`);
        if (r.html) console.log(`   HTML: ${r.html.length} chars`);
        if (r.text) console.log(`   Text: ${r.text.length} chars`);
        if (r.error) console.log(`   Error: ${r.error}`);
      }
      
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      stats.failed++;
      stats.errors.push({ name: testCase.name, error: err.message });
    }
  }

  // 输出测试报告
  const totalElapsed = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log('\n' + '█'.repeat(60));
  console.log('█  测试报告 / Test Report');
  console.log('█'.repeat(60));
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
      console.log(`   ${i + 1}. ${err.name}: ${err.error}`);
    });
  }

  // 保存测试报告
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.PROXY_AUTH ? 'cloud' : 'local',
    stats: {
      ...stats,
      startTime: new Date(stats.startTime).toISOString(),
      totalElapsed,
    },
    errors: stats.errors,
  };
  
  fs.writeFileSync(
    path.join(__dirname, 'test-report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(`\n📄 测试报告已保存: test-report.json`);

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
runTests().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
