# RAG Web Browser Worker

CafeScraper Worker for web content scraping and RAG (Retrieval-Augmented Generation) pipelines.

## Features

- **Google Search**: Search and extract organic results from Google
- **Direct URL Scraping**: Scrape content directly from URLs
- **Multiple Output Formats**: Support for Markdown, Text, and HTML output
- **Two Scraping Modes**:
  - `raw-http`: Fast HTTP requests with Cheerio parsing
  - `browser-playwright`: Full browser rendering with Playwright (CDP support)
- **Cookie Warning Removal**: Built-in Ghostery adblocker integration
- **Dynamic Content Support**: Intelligent waiting for JavaScript-rendered content

## Requirements

- Node.js >= 18.0.0

## Installation

```bash
npm install
```

## Usage

### Local Testing

```bash
node local-test.js
```

### As CafeScraper Worker

```bash
npm start
```

## Input Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | - | Search query or direct URL to scrape (required) |
| `maxResults` | number | 3 | Maximum number of search results (1-100) |
| `outputFormat` | string | `"markdown"` | Output format: `text`, `markdown`, or `html` |
| `scrapingTool` | string | `"raw-http"` | Scraping mode: `raw-http` or `browser-playwright` |
| `requestTimeoutSecs` | number | 40 | Request timeout in seconds (1-300) |
| `serpMaxRetries` | number | 2 | Maximum retries for Google Search |
| `maxRequestRetries` | number | 1 | Maximum retries for target page |
| `dynamicContentWaitSecs` | number | 10 | Wait time for dynamic content |
| `removeCookieWarnings` | boolean | true | Remove cookie warning popups |
| `htmlTransformer` | string | `"none"` | HTML transformation: `none` or `readableText` |
| `removeElementsCssSelector` | string | - | CSS selector for elements to remove |
| `debugMode` | boolean | false | Enable debug logging |

## Output Format

```json
{
  "url": "https://example.com",
  "crawl": {
    "httpStatusCode": 200,
    "httpStatusMessage": "OK",
    "loadedAt": "2024-01-01T00:00:00.000Z",
    "requestStatus": "handled",
    "uniqueKey": "abc123"
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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PROXY_AUTH` | CafeScraper browser authentication token for CDP connection |

## Architecture

```
worker-rag-web-browser/
├── main.js                 # Worker entry point
├── src/
│   ├── worker-main.js      # Core scraping logic
│   ├── types.ts            # TypeScript type definitions
│   ├── const.ts            # Constants
│   ├── google-search/      # Google search extraction
│   └── website-content-crawler/  # Content processing
├── sdk.js                  # CafeScraper SDK
├── sdk_pb.js              # Protocol buffer definitions
├── sdk_grpc_pb.js         # gRPC service definitions
├── input_schema.json      # Input schema for CafeScraper
├── local-test.js          # Local test script
└── package.json
```

## License

ISC
