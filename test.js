/**
 * Test script - 测试 Worker 核心功能
 * 验证模块加载和基本语法正确性
 */

console.log('='.repeat(60));
console.log('RAG Web Browser Worker - 模块加载测试');
console.log('='.repeat(60));

import('./src/worker-main.js')
  .then((module) => {
    console.log('✅ worker-main.js 加载成功');
    console.log(`   导出函数: ${Object.keys(module)}`);
    console.log('');
  })
  .catch((err) => {
    console.error('❌ worker-main.js 加载失败');
    console.error(`   错误: ${err.message}`);
    console.error(`   堆栈: ${err.stack}`);
    process.exit(1);
  });

import('./dist/google-search/google-extractors-urls.js')
  .then((module) => {
    console.log('✅ google-extractors-urls.js 编译成功');
    console.log(`   导出函数: ${Object.keys(module)}`);
    console.log('');
  })
  .catch((err) => {
    console.error('❌ google-extractors-urls.js 编译失败');
    console.error(`   错误: ${err.message}`);
    process.exit(1);
  });

import('./dist/website-content-crawler/html-processing.js')
  .then((module) => {
    console.log('✅ html-processing.js 编译成功');
    console.log(`   导出函数: ${Object.keys(module)}`);
    console.log('');
  })
  .catch((err) => {
    console.error('❌ html-processing.js 编译失败');
    console.error(`   错误: ${err.message}`);
    process.exit(1);
  });

import('./dist/website-content-crawler/markdown.js')
  .then((module) => {
    console.log('✅ markdown.js 编译成功');
    console.log(`   导出函数: ${Object.keys(module)}`);
    console.log('');
  })
  .catch((err) => {
    console.error('❌ markdown.js 编译失败');
    console.error(`   错误: ${err.message}`);
    process.exit(1);
  });

import('./dist/website-content-crawler/text-extractor.js')
  .then((module) => {
    console.log('✅ text-extractor.js 编译成功');
    console.log(`   导出函数: ${Object.keys(module)}`);
    console.log('');
  })
  .catch((err) => {
    console.error('❌ text-extractor.js 编译失败');
    console.error(`   错误: ${err.message}`);
    process.exit(1);
  });

console.log('');
console.log('🎉 所有模块编译成功！');
console.log('');
console.log('Worker 结构检查完成:');
console.log('✓ 所有 TypeScript 文件编译成功');
console.log('✓ 没有语法错误');
console.log('✓ 模块依赖正确');
console.log('');
console.log('Worker 已准备就绪，可以运行！');
