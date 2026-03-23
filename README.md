<div align="center">

# 🌐 RAG Web Browser Worker

**CafeScraper Worker for Intelligent Web Content Extraction**

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

[English](#english) | [中文](#chinese)

</div>

---

<a name="english"></a>
## 🇺🇸 English

### Overview

RAG Web Browser Worker is a high-performance web scraping tool designed for **Retrieval-Augmented Generation (RAG)** pipelines and AI applications. It combines Google Search capabilities with intelligent content extraction, supporting both fast HTTP requests and full browser rendering.

### ✨ Key Features

- 🔍 **Google Search Integration**: Multi-page search result extraction with intelligent pagination
- 🚀 **Dual Scraping Modes**:
  - `raw-http`: Lightning-fast HTTP requests with Cheerio parsing
  - `browser-playwright`: Full browser rendering with Playwright (CDP support)
- 📄 **Multiple Output Formats**: Markdown, Plain Text, and HTML
- ⚡ **Concurrent Processing**: Parallel scraping with configurable concurrency
- 🛡️ **Smart Content Processing**: Cookie warning removal, element filtering, readability extraction
- 📊 **Performance Monitoring**: Built-in timing metrics and debug mode
- 🔧 **Production Ready**: Optimized for CafeScraper cloud environment

### 🚀 Quick Start

```bash
# Install dependencies
npm install

# Local testing
node local-test.js

# Run as CafeScraper Worker
npm start
```

### 📋 Input Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `query` | string | - | - | **Required.** Search query or direct URL to scrape |
| `maxResults` | number | 3 | 1-100 | Maximum number of search results to extract |
| `outputFormat` | string | `"markdown"` | `text`/`markdown`/`html` | Output content format |
| `scrapingTool` | string | `"raw-http"` | `raw-http`/`browser-playwright` | Scraping engine |
| `requestTimeoutSecs` | number | 40 | 1-300 | Request timeout in seconds |
| `serpMaxRetries` | number | 2 | 0-5 | Google Search retry attempts |
| `maxRequestRetries` | number | 1 | 0-3 | Target page retry attempts |
| `dynamicContentWaitSecs` | number | 10 | 0-60 | Wait time for JavaScript-rendered content |
| `desiredConcurrency` | number | 3 | 1-10 | Parallel scraping operations |
| `removeCookieWarnings` | boolean | true | - | Remove cookie consent popups |
| `htmlTransformer` | string | `"none"` | `none`/`readableText` | HTML content transformation |
| `removeElementsCssSelector` | string | - | - | CSS selector for elements to remove |
| `debugMode` | boolean | false | - | Enable debug logging and metrics |

### 📤 Output Format

```json
{
  "url": "https://example.com",
  "crawl": {
    "httpStatusCode": 200,
    "httpStatusMessage": "OK",
    "loadedAt": "2024-01-01T00:00:00.000Z",
    "requestStatus": "handled",
    "uniqueKey": "abc123",
    "debug": {
      "timeMeasures": [...],
      "totalTimeMs": 1654,
      "urlsScraped": 3
    }
  },
  "searchResult": {
    "title": "Page Title",
    "description": "Page description",
    "url": "https://example.com"
  },
  "metadata": {
    "title": "Page Title",
    "url": "https://example.com",
    "description": "Page description",
    "languageCode": "en"
  },
  "markdown": "# Page Content...",
  "text": "Page Content...",
  "html": "<html>...</html>"
}
```

### 🔧 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PROXY_AUTH` | Recommended | CafeScraper browser authentication token for CDP connection and Google Search |

### 🏗️ Architecture

```
worker-rag-web-browser/
├── main.js                    # Worker entry point
├── src/
│   ├── worker-main.js         # Core scraping logic with concurrency & monitoring
│   ├── types.ts               # TypeScript type definitions
│   ├── const.ts               # Constants
│   ├── google-search/         # Google search extraction (multi-selector)
│   └── website-content-crawler/  # Content processing modules
├── sdk.js                     # CafeScraper SDK integration
├── sdk_pb.js                  # Protocol buffer definitions
├── sdk_grpc_pb.js             # gRPC service definitions
├── input_schema.json          # Input schema for CafeScraper UI
├── local-test.js              # Local test suite
├── OPTIMIZATION_REPORT.md     # Optimization analysis report
├── OPTIMIZATION_SUMMARY.md    # Optimization summary
└── package.json
```

### 💡 Use Cases

- **AI Chatbots**: Provide real-time web search capabilities to LLMs
- **RAG Pipelines**: Extract and process web content for knowledge bases
- **Content Aggregation**: Collect articles, documentation, and research
- **SEO Analysis**: Extract metadata and content from competitor websites
- **Data Mining**: Structured data extraction from web pages

### ⚡ Performance

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Search Pagination | Single page | Multi-page | ✅ New |
| Concurrent Scraping | Serial | 3x parallel | ~3x faster |
| Compression Support | gzip only | gzip+deflate+br | ✅ Enhanced |
| Performance Monitoring | None | Full metrics | ✅ New |

---

<a name="chinese"></a>
## 🇨🇳 中文

### 概述

RAG Web Browser Worker 是一款专为 **检索增强生成（RAG）** 流程和 AI 应用设计的高性能网页抓取工具。它结合了 Google 搜索功能与智能内容提取，支持快速 HTTP 请求和完整浏览器渲染两种模式。

### ✨ 核心特性

- 🔍 **Google 搜索集成**：智能分页的多页搜索结果提取
- 🚀 **双模式抓取**：
  - `raw-http`：基于 Cheerio 的超快 HTTP 请求解析
  - `browser-playwright`：基于 Playwright 的完整浏览器渲染（支持 CDP）
- 📄 **多格式输出**：Markdown、纯文本、HTML
- ⚡ **并发处理**：可配置并行度的并行抓取
- 🛡️ **智能内容处理**：Cookie 弹窗移除、元素过滤、可读性提取
- 📊 **性能监控**：内置耗时指标和调试模式
- 🔧 **生产就绪**：针对 CafeScraper 云环境优化

### 🚀 快速开始

```bash
# 安装依赖
npm install

# 本地测试
node local-test.js

# 作为 CafeScraper Worker 运行
npm start
```

### 📋 输入参数

| 参数名 | 类型 | 默认值 | 范围 | 说明 |
|--------|------|--------|------|------|
| `query` | 字符串 | - | - | **必填。** 搜索关键词或直接 URL |
| `maxResults` | 数字 | 3 | 1-100 | 最大搜索结果数 |
| `outputFormat` | 字符串 | `"markdown"` | `text`/`markdown`/`html` | 输出格式 |
| `scrapingTool` | 字符串 | `"raw-http"` | `raw-http`/`browser-playwright` | 抓取引擎 |
| `requestTimeoutSecs` | 数字 | 40 | 1-300 | 请求超时秒数 |
| `serpMaxRetries` | 数字 | 2 | 0-5 | Google 搜索重试次数 |
| `maxRequestRetries` | 数字 | 1 | 0-3 | 目标页面重试次数 |
| `dynamicContentWaitSecs` | 数字 | 10 | 0-60 | 动态内容等待时间 |
| `desiredConcurrency` | 数字 | 3 | 1-10 | 并行抓取操作数 |
| `removeCookieWarnings` | 布尔 | true | - | 移除 Cookie 弹窗 |
| `htmlTransformer` | 字符串 | `"none"` | `none`/`readableText` | HTML 内容转换 |
| `removeElementsCssSelector` | 字符串 | - | - | 要移除元素的 CSS 选择器 |
| `debugMode` | 布尔 | false | - | 启用调试日志和指标 |

### 📤 输出格式

```json
{
  "url": "https://example.com",
  "crawl": {
    "httpStatusCode": 200,
    "httpStatusMessage": "OK",
    "loadedAt": "2024-01-01T00:00:00.000Z",
    "requestStatus": "handled",
    "uniqueKey": "abc123",
    "debug": {
      "timeMeasures": [...],
      "totalTimeMs": 1654,
      "urlsScraped": 3
    }
  },
  "searchResult": {
    "title": "页面标题",
    "description": "页面描述",
    "url": "https://example.com"
  },
  "metadata": {
    "title": "页面标题",
    "url": "https://example.com",
    "description": "页面描述",
    "languageCode": "zh"
  },
  "markdown": "# 页面内容...",
  "text": "页面内容...",
  "html": "<html>...</html>"
}
```

### 🔧 环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `PROXY_AUTH` | 推荐 | CafeScraper 浏览器认证令牌，用于 CDP 连接和 Google 搜索 |

### 🏗️ 架构

```
worker-rag-web-browser/
├── main.js                    # Worker 入口
├── src/
│   ├── worker-main.js         # 核心抓取逻辑（并发与监控）
│   ├── types.ts               # TypeScript 类型定义
│   ├── const.ts               # 常量
│   ├── google-search/         # Google 搜索提取（多选择器）
│   └── website-content-crawler/  # 内容处理模块
├── sdk.js                     # CafeScraper SDK 集成
├── sdk_pb.js                  # Protocol Buffer 定义
├── sdk_grpc_pb.js             # gRPC 服务定义
├── input_schema.json          # CafeScraper UI 输入模式
├── local-test.js              # 本地测试套件
├── OPTIMIZATION_REPORT.md     # 优化分析报告
├── OPTIMIZATION_SUMMARY.md    # 优化总结
└── package.json
```

### 💡 应用场景

- **AI 聊天机器人**：为 LLM 提供实时网络搜索能力
- **RAG 流程**：提取和处理网页内容用于知识库
- **内容聚合**：收集文章、文档和研究资料
- **SEO 分析**：提取竞品网站的元数据和内容
- **数据挖掘**：从网页提取结构化数据

### ⚡ 性能表现

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 搜索分页 | 单页 | 多页 | ✅ 新增 |
| 并发抓取 | 串行 | 3倍并行 | ~3倍快 |
| 压缩支持 | 仅 gzip | gzip+deflate+br | ✅ 增强 |
| 性能监控 | 无 | 完整指标 | ✅ 新增 |

---

## 📄 License

ISC License - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📞 Support

For support and questions, please open an issue on the repository.

---

<div align="center">

**Made with ❤️ for the AI and RAG community**

</div>
