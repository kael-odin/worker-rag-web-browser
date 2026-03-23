# worker-rag-web-browser 优化分析报告

## 项目概述

- **原项目**: `d:\kael_odin\kael_study\rag-web-browser` (Apify开源Actor)
- **Worker项目**: `d:\kael_odin\kael_study\worker-rag-web-browser` (基于原actor改造)
- **运行平台**: CafeScraper

---

## 一、功能对比总览

| 功能模块 | rag-web-browser (原actor) | worker-rag-web-browser | 差距 |
|---------|---------------------------|------------------------|------|
| **搜索模块** | 完整 (Crawlee + 分页 + 重试) | 简化版 (简单HTTP + 有限重试) | ⚠️ 较大 |
| **内容抓取** | Cheerio + Playwright 双引擎 | 简化HTTP + 可选Playwright | ⚠️ 中等 |
| **并发控制** | Crawlee 自动扩缩容 | 串行处理 | ⚠️ 较大 |
| **错误处理** | 完善 (超时/重试/响应管理) | 基础 | ⚠️ 中等 |
| **性能监控** | TimeMeasures | 无 | ⚠️ 大 |
| **输入验证** | 完整Schema验证 | 简化验证 | ⚠️ 中等 |

---

## 二、具体不足与缺陷

### 1. 搜索结果提取不完善

**位置**: `src/worker-main.js#L102-127`

**问题**:
- 只用了3个固定选择器，无法应对Google搜索结果的频繁变化
- 原actor使用了7个选择器，且按时间排序尝试
- 没有处理Google的 `/search` 内部链接过滤
- 没有结果去重逻辑

**原actor实现**:
- `google-extractors-urls.ts` 使用多个选择器fallback
- 有 `isValidUrl()` 验证函数排除内部链接
- 有 `deduplicateResults()` 去重函数

---

### 2. 缺少分页处理

**位置**: `src/worker-main.js#L279`

**问题**:
- 搜索请求只获取一页（`num=${maxResults * 3}`）
- Google实际每页最多返回10个结果
- 当maxResults > 10时，无法获取足够结果

**原actor实现**:
- 使用 `?start=` 参数进行分页
- 根据 maxResults 计算总页数: `Math.ceil(maxResults / 10) + 1`

---

### 3. HTTP请求处理简化

**位置**: `src/worker-main.js#L164-272`

**问题**:
- 手动处理gzip解压，但处理逻辑不完整（只处理了gzip，未处理deflate）
- 没有正确处理 chunked 编码
- 代理认证逻辑硬编码，不够灵活
- 没有设置合理的请求头和编码处理

---

### 4. Playwright使用问题

**位置**: `src/worker-main.js#L380-487`

**问题**:
- 串行处理URLs，没有利用并发
- 每次循环都创建新page，效率低
- 没有使用Crawlee的高级特性（cookie modal自动关闭、blocker）
- 动态内容等待使用 `waitForTimeout`，不够智能
- 缺少对响应内容类型的验证

**原actor实现**:
- 使用Crawlee的 `closeCookieModals()` 和 PlaywrightBlocker
- 智能等待动态内容：先等待1/3时间，然后竞态等待networkidle
- 并发处理多个请求

---

### 5. 缺少关键配置参数

| 参数 | 原actor | worker | 说明 |
|------|---------|--------|------|
| `desiredConcurrency` | ✅ | ❌ | 并发数控制 |
| `serpProxyGroup` | ✅ | ❌ | Google搜索专用代理 |
| `proxyConfiguration` | ✅ | ❌ | 完整的代理配置 |
| `htmlTransformer` | ✅ | ⚠️ | 仅部分支持 'readableText' |
| `serpMaxRetries` | ✅ | ⚠️ | 默认值未应用到搜索 |

---

### 6. 输入验证不完整

**位置**: `src/worker-main.js#L550-598`

**问题**:
- 没有范围验证（如maxResults最大值限制）
- 没有对query为空的情况进行正确处理
- 参数命名不一致（`outputFormat` vs `outputFormats`）

---

### 7. 缺少TimeMeasure性能监控

**原actor** 有完整的性能追踪：

```typescript
interface TimeMeasure {
    event: 'actor-started' | 'cheerio-request-start' | ...;
    timeMs: number;
    timeDeltaPrevMs: number;
}
```

用于分析每个请求各阶段耗时，便于性能优化。

---

## 三、优化建议（优先级排序）

### 🔴 高优先级（建议立即修复）

#### 1. 修复Google搜索分页逻辑

```javascript
// 添加分页支持
const totalPages = Math.ceil(maxResults / 10) + 1;
for (let page = 0; page < totalPages; page++) {
    const startOffset = page * 10;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${startOffset}`;
    // ...获取并合并结果
}
```

#### 2. 完善搜索结果提取器

- 采用原actor的多选择器策略
- 添加URL验证和去重

#### 3. 改进HTTP请求处理

- 完善gzip/deflate解压
- 处理chunked编码
- 使用更健壮的请求库（如axios或fetch）

---

### 🟡 中优先级（建议尽快实现）

#### 4. 添加并发控制

- 允许多个URL并行抓取
- 添加 `desiredConcurrency` 参数

#### 5. 完善Playwright集成

- 复用browser/page实例
- 使用 `waitForLoadState('networkidle')` 替代固定超时
- 添加cookie modal处理

#### 6. 添加性能监控

- 记录各阶段耗时
- 在debug模式下输出

---

### 🟢 低优先级（可后续优化）

#### 7. 扩展配置参数

- 添加 `serpProxyGroup` 支持
- 添加完整的 `proxyConfiguration`

#### 8. 改进输入验证

- 使用JSON Schema验证
- 添加更详细的错误信息

---

## 四、架构建议

考虑到worker运行在cafescraper环境下，建议采用以下架构：

```
┌─────────────────────────────────────────────────────────────┐
│                      main.js                                │
│  (参数解析、验证、结果格式化)                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   worker-main.js                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Google Search │  │ URL解析/验证  │  │ 搜索结果处理      │  │
│  │   模块       │  │              │  │ (分页/去重)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   内容抓取层                                  │
│  ┌──────────────────┐    ┌────────────────────┐            │
│  │  Cheerio (HTTP)  │    │   Playwright       │            │
│  │                  │    │   (Browser)        │            │
│  └──────────────────┘    └────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   HTML处理层                                 │
│  (元素移除 → Cookie移除 → HTML转换 → 格式转换)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、总结

你的worker已经实现了核心功能（搜索+抓取+Markdown转换），可以在cafscraper上运行。但与原actor相比，在以下方面存在明显差距：

1. **搜索能力**：分页、结果提取、URL验证
2. **抓取效率**：并发控制、错误处理
3. **功能完整性**：配置参数、性能监控

建议优先修复分页逻辑和搜索结果提取，这两部分对搜索质量影响最大。

---

*报告生成时间: 2026-03-23*
