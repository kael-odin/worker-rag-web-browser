/**
 * Worker Main - RAG Web Browser Worker Entry
 * CafeScraper Worker for web content scraping and RAG pipelines
 */

const { chromium } = require('playwright');
const http = require('node:http');
const https = require('node:https');
const { load } = require('cheerio');
const TurndownService = require('turndown');
const { gfm } = require('joplin-turndown-plugin-gfm');

const turndownService = new TurndownService();
turndownService.use(gfm);

function htmlToText(html) {
  if (!html) return '';
  const $ = load(html);
  $('script, style, noscript, nav, footer, header').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function htmlToMarkdown(html) {
  if (!html) return '';
  try {
    return turndownService.turndown(html);
  } catch (err) {
    return '';
  }
}

function processHtml(html, settings) {
  if (!html) return '';
  let $ = load(html);
  
  if (settings.removeElementsCssSelector) {
    $(settings.removeElementsCssSelector).remove();
  }
  
  return $('body').html() || html;
}

function scrapeGoogleResults($) {
  const results = [];
  const seenUrls = new Set();
  
  const selectors = [
    '#search .g',
    '#rso .g',
    '.g[data-hveid]'
  ];
  
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const title = $el.find('h3').first().text();
      const link = $el.find('a').first().attr('href');
      const desc = $el.find('[data-sncf], .VwiC3b, .IsZvec').text();
      
      if (title && link && link.startsWith('http') && !seenUrls.has(link)) {
        seenUrls.add(link);
        results.push({
          title,
          url: link,
          description: desc.trim()
        });
      }
    });
  }
  
  return results;
}

function createOutputItem(url, data, settings) {
  const result = {
    url,
    crawl: {
      httpStatusCode: data.statusCode || 200,
      httpStatusMessage: 'OK',
      loadedAt: new Date().toISOString(),
      requestStatus: 'handled',
      uniqueKey: Math.random().toString(36).substring(7),
    },
    metadata: {
      title: data.title || '',
      url,
      description: data.description || '',
      languageCode: data.languageCode || 'en',
    },
  };

  if (settings.outputFormats && settings.outputFormats.includes('markdown')) {
    result.markdown = data.markdown || '';
  }
  if (settings.outputFormats && settings.outputFormats.includes('text')) {
    result.text = data.text || '';
  }
  if (settings.outputFormats && settings.outputFormats.includes('html')) {
    result.html = data.html || '';
  }

  return result;
}

async function fetchUrl(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    }, (response) => {
      clearTimeout(timeoutId);
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        resolve({ html: data, statusCode: response.statusCode });
      });
    });
    req.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

async function runGoogleSearch(query, maxResults, cafesdk) {
  const log = cafesdk?.log || console;
  log.info && await log.info(`Running Google Search for: ${query}`);
  console.log(`[INFO] Running Google Search for: ${query}`);

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;

  try {
    const { html, statusCode } = await fetchUrl(searchUrl);
    
    if (statusCode !== 200) {
      console.log(`[WARN] Google search returned status ${statusCode}`);
    }
    
    const $ = load(html);
    const organicResults = scrapeGoogleResults($);
    console.log(`[INFO] Found ${organicResults.length} organic results`);

    return organicResults.slice(0, maxResults);
  } catch (err) {
    console.error(`[ERROR] Google search failed: ${err.message}`);
    return [];
  }
}

async function connectBrowser(cafesdk) {
  const proxyAuth = process.env.PROXY_AUTH;
  if (!proxyAuth) {
    console.log('[WARN] PROXY_AUTH not set, using local browser');
    return { browser: null, isRemote: false };
  }

  const browserWSEndpoint = `ws://${proxyAuth}@chrome-ws-inner.cafescraper.com`;
  console.log('[INFO] Connecting to remote browser via CDP');

  try {
    const browser = await chromium.connectOverCDP(browserWSEndpoint);
    console.log('[INFO] Connected to remote browser successfully');
    return { browser, isRemote: true };
  } catch (err) {
    console.error(`[ERROR] Failed to connect to remote browser: ${err.message}`);
    return { browser: null, isRemote: false };
  }
}

async function handleContent($, html, url, settings, statusCode) {
  const processedHtml = processHtml(html, settings);
  
  const data = {
    title: $('title').first().text(),
    description: $('meta[name=description]').first().attr('content') || '',
    languageCode: $('html').first().attr('lang') || 'en',
    statusCode,
    text: settings.outputFormats?.includes('text') ? htmlToText(processedHtml) : undefined,
    markdown: settings.outputFormats?.includes('markdown') ? htmlToMarkdown(processedHtml) : undefined,
    html: settings.outputFormats?.includes('html') ? processedHtml : undefined,
  };

  return data;
}

async function scrapeWithBrowser(urls, inputData, cafesdk) {
  const results = [];
  const { contentScraperSettings, searchResults, requestTimeoutSecs } = inputData;

  const { browser } = await connectBrowser(cafesdk);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[INFO] Scraping with Playwright: ${url}`);

    let page = null;
    let localBrowser = null;

    try {
      if (browser) {
        page = await browser.newPage({ viewport: null });
      } else {
        localBrowser = await chromium.launch({ headless: true });
        page = await localBrowser.newPage();
      }

      await page.goto(url, { timeout: (requestTimeoutSecs || 40) * 1000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const html = await page.content();
      const $ = load(html);

      const data = await handleContent($, html, url, contentScraperSettings, 200);
      
      if (searchResults && searchResults[i]) {
        data.searchResult = searchResults[i];
      }

      results.push(createOutputItem(url, data, contentScraperSettings));
    } catch (err) {
      console.error(`[ERROR] Failed to scrape ${url}: ${err.message}`);
      results.push({
        url,
        error: err.message,
        status: 'failed',
      });
    } finally {
      if (page) {
        try { await page.close(); } catch {}
      }
      if (localBrowser) {
        try { await localBrowser.close(); } catch {}
      }
    }
  }

  if (browser) {
    try { await browser.close(); } catch {}
  }

  return results;
}

async function scrapeWithHttp(urls, inputData, cafesdk) {
  const results = [];
  const { contentScraperSettings, searchResults, requestTimeoutSecs } = inputData;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[INFO] Scraping with HTTP: ${url}`);

    try {
      const { html, statusCode } = await fetchUrl(url, (requestTimeoutSecs || 40) * 1000);
      const $ = load(html);

      const data = await handleContent($, html, url, contentScraperSettings, statusCode);
      
      if (searchResults && searchResults[i]) {
        data.searchResult = searchResults[i];
      }

      results.push(createOutputItem(url, data, contentScraperSettings));
    } catch (err) {
      console.error(`[ERROR] Failed to scrape ${url}: ${err.message}`);
      results.push({
        url,
        error: err.message,
        status: 'failed',
      });
    }
  }

  return results;
}

function validateInput(input) {
  const validated = { ...input };
  
  validated.maxResults = Math.min(100, Math.max(1, validated.maxResults || 3));
  validated.requestTimeoutSecs = Math.min(300, Math.max(1, validated.requestTimeoutSecs || 40));
  
  if (!validated.outputFormats || validated.outputFormats.length === 0) {
    validated.outputFormats = ['markdown'];
  }
  
  if (!validated.scrapingTool) {
    validated.scrapingTool = 'raw-http';
  }
  
  if (!validated.removeElementsCssSelector) {
    validated.removeElementsCssSelector = 'nav, footer, script, style, noscript, svg';
  }

  return validated;
}

async function runRAGWebBrowser(inputData, cafesdk) {
  const input = validateInput(inputData);

  const {
    query,
    maxResults,
    outputFormats,
    scrapingTool,
    requestTimeoutSecs,
    removeElementsCssSelector,
  } = input;

  const contentScraperSettings = {
    outputFormats,
    removeElementsCssSelector,
  };

  const isUrl = query && query.match(/^https?:\/\//);

  let urlsToScrape = [];
  let searchResults = null;

  if (isUrl) {
    console.log(`[INFO] Direct URL provided: ${query}`);
    urlsToScrape = [query];
  } else if (query) {
    searchResults = await runGoogleSearch(query, maxResults, cafesdk);
    urlsToScrape = searchResults.map(r => r.url).filter(Boolean);
    console.log(`[INFO] Found ${urlsToScrape.length} URLs to scrape`);
  } else {
    console.error('[ERROR] No query or URL provided');
    return [];
  }

  if (urlsToScrape.length === 0) {
    console.log('[WARN] No URLs to scrape');
    return [];
  }

  let results;
  if (scrapingTool === 'browser-playwright') {
    results = await scrapeWithBrowser(
      urlsToScrape,
      { ...input, contentScraperSettings, searchResults },
      cafesdk
    );
  } else {
    results = await scrapeWithHttp(
      urlsToScrape,
      { ...input, contentScraperSettings, searchResults },
      cafesdk
    );
  }

  return results;
}

module.exports = { runRAGWebBrowser };
