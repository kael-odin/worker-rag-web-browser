/**
 * Local Test - 本地测试 RAG Web Browser Worker
 * 模拟 CafeScraper SDK 环境，方便本地测试
 */

console.log('='.repeat(80));
console.log('RAG Web Browser Worker - 本地功能测试');
console.log('='.repeat(80));
console.log('');

// 模拟 CafeScraper SDK
const mockCafeSDK = {
  parameter: {
    getInputJSONObject: async () => {
      // 测试输入：直接爬取一个 GitHub URL
      return {
        query: 'https://github.com/microsoft/vscode',
        maxResults: 1,
        outputFormats: ['markdown'],
        scrapingTool: 'raw-http',
        requestTimeoutSecs: 40,
      };
    },
  },
  log: {
    debug: async (msg) => console.log(`[DEBUG] ${msg}`),
    info: async (msg) => console.log(`[INFO] ${msg}`),
    warn: async (msg) => console.log(`[WARN] ${msg}`),
    error: async (msg) => console.error(`[ERROR] ${msg}`),
  },
  result: {
    setTableHeader: async (headers) => {
      console.log('\n[RESULT] 设置表头:');
      console.log(JSON.stringify(headers, null, 2));
      return { success: true };
    },
    pushData: async (data) => {
      console.log(`\n[RESULT] 推送数据:`);
      console.log(JSON.stringify(data, null, 2));
      return { success: true };
    },
  },
};

console.log('🚀 启动本地测试...');
console.log('');

import { runRAGWebBrowser } from './src/worker-main.js';

async function runLocalTest() {
  try {
    const startTime = Date.now();
    
    // 获取测试输入
    const input = await mockCafeSDK.parameter.getInputJSONObject();
    console.log(`📥 测试输入: ${JSON.stringify(input, null, 2)}`);
    console.log('');

    // 运行 Worker
    const results = await runRAGWebBrowser(input, mockCafeSDK);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('='.repeat(80));
    console.log(`✅ 测试完成！耗时: ${duration} 秒`);
    console.log(`📊 获取结果数: ${results.length}`);
    console.log('='.repeat(80));

    if (results.length > 0) {
      console.log('\n🎉 Worker 功能正常！');
      console.log('   搜索和爬取逻辑工作正常');
      console.log('   可以部署到 CafeScraper 平台使用');
    } else {
      console.log('\n⚠️  测试完成但未获取到结果');
      console.log('   可能是网络问题或搜索结果为空');
    }

  } catch (error) {
    console.error('\n');
    console.error('❌ 测试失败！');
    console.error(`错误信息: ${error.message}`);
    console.error(`错误堆栈: ${error.stack}`);
    process.exit(1);
  }
}

runLocalTest();
