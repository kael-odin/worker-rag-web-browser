/**
 * Worker Main - RAG Web Browser Worker Entry
 * CafeScraper Worker for web content scraping and RAG pipelines
 */

const { chromium } = require('playwright');
const { readFile } = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const { load } = require('cheerio');
const { PlaywrightBlocker } = require('@ghostery/adblocker-playwright');

const { scrapeOrganicResults } = require('../dist/google-search/google-extractors-urls.js');
const { processHtml } = require('../dist/website-content-crawler/html-processing.js');
const { htmlToMarkdown } = require('../dist/website-content-crawler/markdown.js');

function htmlToText(html) {
  if (!html) return '';
  const $ = load(html);
  $('script, style, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

let ghosteryBlocker = null;

async function getGhosteryBlocker() {
  if (ghosteryBlocker) return ghosteryBlocker;
  try {
    ghosteryBlocker = await PlaywrightBlocker.deserialize(await readFile('./blockers/fanboy-cookiemonster.bin'));
    return ghosteryBlocker;
  } catch (err) {
    return null;
  }
}

function createOutputItem(url, data, settings) {
  const result = {
    url,
    crawl: {
      httpStatusCode: data.statusCode || 200,
      httpStatusMessage: 'OK',
      loadedAt: new Date(),
      requestStatus: 'handled',
      uniqueKey: Math.random().toString(36).substring(7),
    },
    searchResult: data.searchResult || {
      title: data.title,
      description: data.description,
      url,
    },
    metadata: {
      title: data.title,
      url,
      description: data.description,
      languageCode: data.languageCode || 'en',
    },
  };

  if (settings.outputFormats.includes('markdown')) {
    result.markdown = data.markdown || '';
  }
  if (settings.outputFormats.includes('text')) {
    result.text = data.text || '';
  }
  if (settings.outputFormats.includes('html')) {
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
        'Accept-Encoding': 'identity',
      },
    }, (response) => {
      clearTimeout(timeoutId);
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        resolve({ html: data, statusCode: response.statusCode, headers: response.headers });
      });
    });
    req.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

async function runGoogleSearch(query, maxResults, cafesdk) {
  console.log(`[INFO] Running Google Search for: ${query}`);

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;

  try {
    const { html, statusCode } = await fetchUrl(searchUrl);
    
    if (statusCode !== 200) {
      console.log(`[WARN] Google search returned status ${statusCode}`);
    }
    
    const $ = load(html);
    const organicResults = scrapeOrganicResults($);
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
    console.log('[WARN] PROXY_AUTH environment variable not found, using local browser');
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

async function waitForDynamicContent(page, maxWaitSecs) {
  const hardDelay = Math.min(1000, Math.floor(0.3 * maxWaitSecs * 1000));
  await page.waitForTimeout(hardDelay);
  
  try {
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: (maxWaitSecs * 1000) - hardDelay }),
      page.waitForTimeout((maxWaitSecs * 1000) - hardDelay),
    ]);
  } catch {
    // Ignore timeout
  }
}

async function handleContent($, html, url, settings, statusCode) {
  const $html = $('html');
  const htmlContent = $html.html() || html;
  
  const processedHtml = await processHtml(htmlContent, url, settings, $);
  
  const isTooLarge = processedHtml.length > (settings.maxHtmlCharsToProcess || 1500000);
  let text;
  if (isTooLarge) {
    text = load(processedHtml).text();
  } else {
    const processedHtmlForText = load(processedHtml).html();
    text = htmlToText(processedHtmlForText);
  }

  const data = {
    title: $('title').first().text(),
    description: $('meta[name=description]').first().attr('content') ?? undefined,
    languageCode: $html.first().attr('lang') ?? 'en',
    statusCode,
    text: settings.outputFormats.includes('text') ? text : undefined,
    markdown: settings.outputFormats.includes('markdown') ? htmlToMarkdown(processedHtml) : undefined,
    html: settings.outputFormats.includes('html') ? processedHtml : undefined,
  };

  return data;
}

async function scrapeWithBrowser(urls, inputData, cafesdk) {
  const results = [];
  const { contentScraperSettings, searchResults, requestTimeoutSecs } = inputData;
  const blocker = await getGhosteryBlocker();

  const { browser, isRemote } = await connectBrowser(cafesdk);

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

      if (blocker && contentScraperSettings.removeCookieWarnings) {
        try {
          await blocker.enableBlockingInPage(page);
        } catch {
          // Ignore blocker errors
        }
      }

      await page.goto(url, { timeout: requestTimeoutSecs * 1000, waitUntil: 'domcontentloaded' });

      if (contentScraperSettings.dynamicContentWaitSecs > 0) {
        await waitForDynamicContent(page, contentScraperSettings.dynamicContentWaitSecs);
      }

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
        try {
          await page.close();
        } catch {
          // Ignore
        }
      }
      if (localBrowser) {
        try {
          await localBrowser.close();
        } catch {
          // Ignore
        }
      }
    }
  }

  if (browser) {
    try {
      await browser.close();
    } catch {
      // Ignore
    }
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
      const { html, statusCode } = await fetchUrl(url, requestTimeoutSecs * 1000);
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

function validateAndFillInput(input) {
  const validated = { ...input };

  const validateRange = (value, min, max, defaultValue, fieldName) => {
    if (value === undefined) {
      return defaultValue;
    }
    const num = typeof value === 'string' ? Number(value) : value;
    if (num < min) return min;
    if (num > max) return max;
    return num;
  };

  validated.maxResults = validateRange(validated.maxResults, 1, 100, 3);
  validated.requestTimeoutSecs = validateRange(validated.requestTimeoutSecs, 1, 300, 40);
  validated.maxRequestRetries = validateRange(validated.maxRequestRetries, 0, 10, 2);

  if (!validated.outputFormats || validated.outputFormats.length === 0) {
    validated.outputFormats = ['markdown'];
  }

  if (!validated.scrapingTool) {
    validated.scrapingTool = 'raw-http';
  }

  if (!validated.removeElementsCssSelector) {
    validated.removeElementsCssSelector = 'nav, footer, script, style, noscript, svg, img[src^="data:"]';
  }

  if (!validated.htmlTransformer) {
    validated.htmlTransformer = 'none';
  }

  if (validated.removeCookieWarnings === undefined) {
    validated.removeCookieWarnings = true;
  }

  if (!validated.dynamicContentWaitSecs || validated.dynamicContentWaitSecs >= validated.requestTimeoutSecs) {
    validated.dynamicContentWaitSecs = Math.round(validated.requestTimeoutSecs / 2);
  }

  return validated;
}

async function runRAGWebBrowser(inputData, cafesdk) {
  const input = validateAndFillInput(inputData);

  const {
    query,
    maxResults,
    outputFormats,
    scrapingTool,
    requestTimeoutSecs,
    dynamicContentWaitSecs,
    removeElementsCssSelector,
    htmlTransformer,
    removeCookieWarnings,
  } = input;

  const contentScraperSettings = {
    outputFormats,
    removeCookieWarnings,
    removeElementsCssSelector,
    htmlTransformer,
    dynamicContentWaitSecs,
    maxHtmlCharsToProcess: 1500000,
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
