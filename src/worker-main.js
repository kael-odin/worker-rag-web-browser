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
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

// Allow insecure HTTPS connections (required for some proxy environments)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const turndownService = new TurndownService();
turndownService.use(gfm);

const DEFAULT_REMOVE_ELEMENTS = "nav, footer, script, style, noscript, svg, img[src^='data:'],\n[role=\"alert\"],\n[role=\"banner\"],\n[role=\"dialog\"],\n[role=\"alertdialog\"],\n[role=\"region\"][aria-label*=\"skip\" i],\n[aria-modal=\"true\"]";

const noop = async () => {};

/**
 * TimeMeasures utility for performance tracking
 */
class TimeMeasures {
  constructor() {
    this.measures = [];
    this.startTime = Date.now();
  }

  addEvent(event) {
    const time = Date.now();
    const timeDeltaPrevMs = this.measures.length > 0
      ? time - this.measures[this.measures.length - 1].timeMs
      : 0;

    this.measures.push({
      event,
      timeMs: time,
      timeDeltaPrevMs,
    });
  }

  getMeasures() {
    const firstMeasure = this.measures[0]?.timeMs || this.startTime;
    return this.measures.map((measure) => ({
      event: measure.event,
      timeMs: measure.timeMs - firstMeasure,
      timeDeltaPrevMs: measure.timeDeltaPrevMs,
    }));
  }

  getTotalTime() {
    return Date.now() - this.startTime;
  }
}

function getLogger(cafesdk) {
  if (cafesdk && cafesdk.log) {
    return {
      debug: (msg) => cafesdk.log.debug(msg),
      info: (msg) => cafesdk.log.info(msg),
      warn: (msg) => cafesdk.log.warn(msg),
      error: (msg) => cafesdk.log.error(msg),
    };
  }
  return {
    debug: console.log,
    info: console.log,
    warn: console.warn,
    error: console.error,
  };
}

function transformHtmlToMarkdown(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.content) {
      const markdown = turndownService.turndown(article.content);
      return {
        markdown,
        title: article.title || '',
        description: article.excerpt || '',
        languageCode: article.lang || 'en',
      };
    }
  } catch (err) {
    // Fall through to basic conversion
  }

  const markdown = turndownService.turndown(html);
  return {
    markdown,
    title: '',
    description: '',
    languageCode: 'en',
  };
}

function extractTextFromHtml(html) {
  const $ = load(html);
  return $('body').text().trim();
}

function processHtml(html, settings, url) {
  const { removeElementsCssSelector, removeCookieWarnings, htmlTransformer, readableTextCharThreshold } = settings;

  let $ = load(html);

  // Remove elements by CSS selector
  const selectorsToRemove = removeElementsCssSelector || DEFAULT_REMOVE_ELEMENTS;
  if (selectorsToRemove) {
    $(selectorsToRemove).remove();
  }

  // Remove cookie warnings
  if (removeCookieWarnings) {
    $(COOKIE_WARNING_SELECTORS).remove();
  }

  let bodyHtml = $('body').html() || html;

  // Apply htmlTransformer
  if (htmlTransformer === 'readableText') {
    const dom = new JSDOM(bodyHtml, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const readableText = article ? article.textContent : '';

    if (readableTextCharThreshold && readableText.length < readableTextCharThreshold) {
      return bodyHtml;
    }
    const cleanedText = readableText.replace(/\s+/g, ' ').trim();
    return cleanedText ? `<html><body>${cleanedText}</body></html>` : bodyHtml;
  }

  return bodyHtml;
}

/**
 * Validates if a URL is a valid absolute URL and filters out Google's internal search URLs
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Reject Google's internal search URLs (relative URLs starting with /search)
  if (url.startsWith('/search')) {
    return false;
  }

  // Check if it's a valid HTTP/HTTPS URL
  try {
    const urlObj = new URL(url, 'http://example.com');
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Deduplicates search results based on their title and URL
 */
function deduplicateResults(results) {
  const deduplicatedResults = [];
  const resultHashes = new Set();
  for (const result of results) {
    const hash = JSON.stringify({ title: result.title, url: result.url });
    if (!resultHashes.has(hash)) {
      deduplicatedResults.push(result);
      resultHashes.add(hash);
    }
  }
  return deduplicatedResults;
}

/**
 * Extracts search results from the given Cheerio instance
 * Uses multiple selectors to handle Google's changing HTML structure
 */
function scrapeGoogleResults($, log) {
  const results = [];

  // Debug: log the HTML structure if no results found
  const bodyText = $('body').text().substring(0, 500);
  if (log && log.debug) {
    log.debug(`Page body preview: ${bodyText}...`);
  }

  // Multiple selectors to handle different Google search result layouts
  // Based on @apify/google-search - updated to handle various layouts
  const resultSelectors = [
    '.hlcw0c', // Top result with site links
    '.g.Ww4FFb', // General search results
    '.MjjYud', // General search results 2025 March
    '.g .tF2Cxc>.yuRUbf', // Old search selector 2021 January
    '.g [data-header-feature="0"]', // Old search selector 2022 January
    '.g .rc', // Very old selector
    '.sATSHe', // Another new selector in March 2025
    '#search .g', // Current fallback
    '#rso .g', // Alternative fallback
    '.g[data-hveid]', // Data attribute based
    '[data-ved] h3', // Alternative title-based approach
    'h3', // Most generic fallback for any heading that might be a result
  ];

  // Try each selector individually to find matches
  for (const selector of resultSelectors) {
    const elements = $(selector);
    if (elements.length > 0 && log && log.debug) {
      log.debug(`Selector "${selector}" found ${elements.length} elements`);
    }
  }

  const selector = resultSelectors.join(', ');

  $(selector).each((_, el) => {
    const $el = $(el);

    // Remove action menu to avoid extracting wrong text
    $el.find('div.action-menu').remove();

    // Try multiple strategies to find the title and link
    let title = $el.find('h3').first().text();
    let link = $el.find('a').first().attr('href');
    let desc = $el.find('[data-sncf], .VwiC3b, .IsZvec, .s3v94d, .yXK7lf, .lEBKkf, .st, span').text();

    // If we only found a title (from h3 selector), try to find the closest link
    if (title && !link) {
      // Look for a link in parent or sibling elements
      const parentLink = $el.closest('a').attr('href') ||
                        $el.parent().find('a').first().attr('href') ||
                        $el.siblings('a').first().attr('href');
      if (parentLink) {
        link = parentLink;
      }
    }

    // Only include results with both title and a valid URL
    if (title && link && isValidUrl(link)) {
      results.push({
        title: title.trim(),
        url: link,
        description: desc.trim(),
      });
    }
  });

  if (log && log.debug) {
    log.debug(`Total results found before deduplication: ${results.length}`);
  }

  return deduplicateResults(results);
}

function createOutputItem(url, data, settings) {
  const result = {
    url,
    crawl: {
      httpStatusCode: data.statusCode || 200,
      httpStatusMessage: data.statusMessage || 'OK',
      loadedAt: new Date().toISOString(),
      requestStatus: data.statusCode && data.statusCode >= 400 ? 'failed' : 'handled',
      uniqueKey: Math.random().toString(36).substring(7),
    },
    metadata: {
      title: data.title || '',
      url,
      description: data.description || '',
      languageCode: data.languageCode || 'en',
    },
  };

  if (data.searchResult) {
    result.searchResult = data.searchResult;
  }

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

async function fetchUrl(url, timeout = 30000, log = { warn: console.warn, error: console.error }) {
  const zlib = require('zlib');
  const { promisify } = require('util');
  const gunzip = promisify(zlib.gunzip);
  const inflate = promisify(zlib.inflate);
  const brotliDecompress = promisify(zlib.brotliDecompress);

  return new Promise((resolve, reject) => {
    const proxyAuth = process.env.PROXY_AUTH;
    const proxyHost = 'proxy-inner.cafescraper.com';
    const proxyPort = 6000;

    const requestHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };

    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const decompressResponse = async (buffer, encoding) => {
      try {
        switch (encoding) {
          case 'gzip':
            return await gunzip(buffer);
          case 'deflate':
            return await inflate(buffer);
          case 'br':
            return await brotliDecompress(buffer);
          default:
            return buffer;
        }
      } catch (err) {
        if (log.warn) {
          log.warn(`Decompression failed (${encoding}): ${err.message}, returning raw data`);
        }
        return buffer;
      }
    };

    const handleResponse = async (response) => {
      clearTimeout(timeoutId);
      const chunks = [];

      response.on('data', (chunk) => {
        chunks.push(chunk);
      });

      response.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const encoding = response.headers['content-encoding'];
          const decompressed = await decompressResponse(buffer, encoding);
          const data = decompressed.toString('utf8');

          resolve({
            html: data,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage || '',
            headers: response.headers,
          });
        } catch (e) {
          if (log.error) {
            log.error(`Error processing response: ${e.message}`);
          }
          resolve({
            html: '',
            statusCode: response.statusCode || 500,
            statusMessage: `Error processing response: ${e.message}`,
            headers: response.headers,
          });
        }
      });

      response.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    };

    const handleError = (err) => {
      clearTimeout(timeoutId);
      reject(err);
    };

    if (proxyAuth) {
      if (log.info) {
        log.info(`Using proxy ${proxyHost}:${proxyPort} for ${url}`);
      }

      // Use https-proxy-agent or similar approach
      // For now, let's use a simpler approach with custom agent
      const targetUrl = new URL(url);
      const isHttps = targetUrl.protocol === 'https:';

      // Create a custom agent that uses the proxy
      const net = require('net');
      const tls = require('tls');

      const proxyReq = http.request({
        host: proxyHost,
        port: proxyPort,
        method: 'CONNECT',
        path: `${targetUrl.hostname}:${targetUrl.port || (isHttps ? 443 : 80)}`,
        headers: {
          'Proxy-Authorization': `Basic ${Buffer.from(proxyAuth).toString('base64')}`,
        },
      });

      proxyReq.on('connect', (proxyRes, socket) => {
        if (proxyRes.statusCode !== 200) {
          clearTimeout(timeoutId);
          reject(new Error(`Proxy CONNECT failed with status ${proxyRes.statusCode}`));
          return;
        }

        if (log.debug) {
          log.debug(`Proxy CONNECT successful for ${targetUrl.hostname}`);
        }

        if (isHttps) {
          // For HTTPS, wrap the socket in TLS with timeout
          const tlsOptions = {
            socket: socket,
            servername: targetUrl.hostname,
            rejectUnauthorized: false,
            // Add ALPN protocols for better compatibility
            ALPNProtocols: ['http/1.1'],
            // Enable session reuse
            session: undefined,
          };

          if (log.debug) {
            log.debug(`Starting TLS handshake with ${targetUrl.hostname}`);
          }

          const tlsSocket = tls.connect(tlsOptions);

          // Set a timeout for TLS handshake
          const tlsTimeout = setTimeout(() => {
            tlsSocket.destroy();
            handleError(new Error('TLS handshake timeout'));
          }, 10000);

          tlsSocket.on('secureConnect', () => {
            clearTimeout(tlsTimeout);
            if (log.debug) {
              log.debug(`TLS handshake successful, protocol: ${tlsSocket.getProtocol()}, cipher: ${tlsSocket.getCipher().name}`);
            }

            const request = https.get({
              hostname: targetUrl.hostname,
              port: targetUrl.port || 443,
              path: `${targetUrl.pathname}${targetUrl.search}`,
              headers: requestHeaders,
              // Use the established TLS socket
              createConnection: () => tlsSocket,
            }, handleResponse);

            request.on('error', (err) => {
              if (log.error) {
                log.error(`HTTPS request error: ${err.message}`);
              }
              handleError(err);
            });
          });

          tlsSocket.on('error', (err) => {
            clearTimeout(tlsTimeout);
            if (log.error) {
              log.error(`TLS error: ${err.message}`);
            }
            handleError(err);
          });

          tlsSocket.on('close', () => {
            clearTimeout(tlsTimeout);
          });
        } else {
          // For HTTP, use the socket directly
          const request = http.get({
            hostname: targetUrl.hostname,
            port: targetUrl.port || 80,
            path: `${targetUrl.pathname}${targetUrl.search}`,
            headers: requestHeaders,
            createConnection: () => socket,
          }, handleResponse);

          request.on('error', (err) => {
            if (log.error) {
              log.error(`HTTP request error: ${err.message}`);
            }
            handleError(err);
          });
        }
      });

      proxyReq.on('error', (err) => {
        if (log.error) {
          log.error(`Proxy CONNECT error: ${err.message}`);
        }
        handleError(err);
      });

      proxyReq.end();
    } else {
      if (log.warn) {
        log.warn('PROXY_AUTH not set, performing direct HTTP request');
      }
      const protocol = url.startsWith('https:') ? https : http;
      const req = protocol.get(
        url,
        {
          headers: requestHeaders,
          timeout: timeout,
        },
        handleResponse
      );
      req.on('error', handleError);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    }
  });
}

async function runGoogleSearch(query, maxResults, serpMaxRetries, log) {
  if (log.info) {
    await log.info(`Running Google Search for: ${query}, maxResults: ${maxResults}`);
  }

  const retries = Math.max(0, serpMaxRetries || 0);
  const GOOGLE_RESULTS_PER_PAGE = 10;

  // Calculate total pages needed (Google returns max 10 results per page)
  // Add +1 to handle pages that return fewer than 10 results
  const totalPages = Math.ceil(maxResults / GOOGLE_RESULTS_PER_PAGE) + 1;

  const allResults = [];

  for (let currentPage = 0; currentPage < totalPages; currentPage++) {
    const startOffset = currentPage * GOOGLE_RESULTS_PER_PAGE;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${startOffset}`;

    if (log.info) {
      await log.info(`Fetching page ${currentPage + 1}/${totalPages} (offset: ${startOffset})`);
    }

    let pageSuccess = false;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { html, statusCode } = await fetchUrl(searchUrl, 30000, log);

        if (statusCode !== 200 && log.warn) {
          await log.warn(`Google search returned status ${statusCode}`);
        }

        if (!html || html.length < 100) {
          if (log.warn) {
            await log.warn(`Google search returned empty or very short response (${html?.length || 0} chars), page ${currentPage + 1}, attempt ${attempt + 1}`);
          }
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          break; // Move to next page
        }

        const $ = load(html);

        if ($('#captcha').length > 0 || $('form[action*="verify"]').length > 0) {
          if (log.error) {
            await log.error('Google presented CAPTCHA, search failed');
          }
          return allResults.slice(0, maxResults);
        }

        const organicResults = scrapeGoogleResults($, log);
      if (log.info) {
        await log.info(`Page ${currentPage + 1}: Found ${organicResults.length} organic results`);
      }

        // Merge with accumulated results
        allResults.push(...organicResults);

        // Check if we should stop pagination
        // Stop if: (1) we have enough results OR (2) Google returned 0 results (empty page)
        if (organicResults.length === 0) {
          if (log.info) {
            await log.info(`No more results on page ${currentPage + 1}, stopping pagination`);
          }
          return allResults.slice(0, maxResults);
        }

        if (allResults.length >= maxResults) {
          if (log.info) {
            await log.info(`Collected enough results (${allResults.length}), stopping pagination`);
          }
          return allResults.slice(0, maxResults);
        }

        pageSuccess = true;
        break; // Success, move to next page

      } catch (err) {
        if (log.error) {
          await log.error(`Google search page ${currentPage + 1}, attempt ${attempt + 1} failed: ${err.message}`);
        }
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (!pageSuccess && log.warn) {
      await log.warn(`Failed to fetch page ${currentPage + 1} after ${retries + 1} attempts`);
    }

    // Small delay between pages to avoid rate limiting
    if (currentPage < totalPages - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (log.info) {
    await log.info(`Pagination complete. Total unique results: ${allResults.length}`);
  }

  return allResults.slice(0, maxResults);
}

async function connectBrowser(log) {
  const proxyAuth = process.env.PROXY_AUTH;
  if (!proxyAuth) {
    if (log.warn) {
      await log.warn('PROXY_AUTH not set, using local browser');
    }
    return { browser: null, isRemote: false };
  }

  const browserWSEndpoint = `ws://${proxyAuth}@chrome-ws-inner.cafescraper.com`;
  if (log.info) {
    await log.info('Connecting to remote browser via CDP');
  }

  try {
    const browser = await chromium.connectOverCDP(browserWSEndpoint);
    if (log.info) {
      await log.info('Connected to remote browser successfully');
    }
    return { browser, isRemote: true };
  } catch (err) {
    if (log.error) {
      await log.error(`Failed to connect to remote browser: ${err.message}`);
    }
    return { browser: null, isRemote: false };
  }
}

async function handleContent($, html, url, settings, statusCode, statusMessage) {
  const processedHtml = processHtml(html, settings, url);

  const data = {
    html: processedHtml,
    statusCode,
    statusMessage,
  };

  // Extract title
  data.title = $('title').text().trim() || $('h1').first().text().trim() || '';

  // Extract description
  data.description = $('meta[name="description"]').attr('content') || '';

  // Extract language
  data.languageCode = $('html').attr('lang') || 'en';

  // Transform to markdown if needed
  if (settings.outputFormats && settings.outputFormats.includes('markdown')) {
    const markdownResult = transformHtmlToMarkdown(processedHtml, url);
    data.markdown = markdownResult.markdown;
    data.title = data.title || markdownResult.title;
    data.description = data.description || markdownResult.description;
    data.languageCode = data.languageCode || markdownResult.languageCode;
  }

  // Extract text if needed
  if (settings.outputFormats && settings.outputFormats.includes('text')) {
    data.text = extractTextFromHtml(processedHtml);
  }

  return data;
}

/**
 * Process URLs with controlled concurrency
 * @param {string[]} urls - URLs to process
 * @param {Function} processFn - Async function to process each URL
 * @param {number} concurrency - Number of concurrent operations
 * @returns {Promise<Array>} - Results in the same order as input URLs
 */
async function processWithConcurrency(urls, processFn, concurrency = 3) {
  const results = new Array(urls.length);
  const executing = [];

  for (let i = 0; i < urls.length; i++) {
    const promise = processFn(urls[i], i).then((result) => {
      results[i] = result;
      return result;
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex((p) => p === promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
}

async function scrapeWithHttp(urls, inputData, log) {
  const { contentScraperSettings, searchResults, requestTimeoutSecs, maxRequestRetries, desiredConcurrency } = inputData;

  const concurrency = Math.max(1, Math.min(desiredConcurrency || 3, 10));

  if (log.info) {
    await log.info(`Scraping ${urls.length} URLs with HTTP, concurrency: ${concurrency}`);
  }

  const processUrl = async (url, index) => {
    if (log.info) {
      await log.info(`Scraping with HTTP: ${url}`);
    }

    try {
      const retries = Math.max(0, maxRequestRetries || 0);
      let lastError = null;
      let html = '';
      let statusCode = 0;
      let statusMessage = 'OK';

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const response = await fetchUrl(url, (requestTimeoutSecs || 40) * 1000, log);
          html = response.html;
          statusCode = response.statusCode;
          statusMessage = response.statusMessage || 'OK';
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (attempt === retries) {
            throw err;
          }
          // Wait before retry
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      if (lastError) {
        throw lastError;
      }

      const $ = load(html);

      const data = await handleContent($, html, url, contentScraperSettings, statusCode, statusMessage);

      if (searchResults && searchResults[index]) {
        data.searchResult = searchResults[index];
      }

      return createOutputItem(url, data, contentScraperSettings);
    } catch (err) {
      if (log.error) {
        await log.error(`Failed to scrape ${url}: ${err.message}`);
      }
      return {
        url,
        error: err.message,
        status: 'failed',
      };
    }
  };

  return processWithConcurrency(urls, processUrl, concurrency);
}

async function scrapeWithBrowser(urls, inputData, log) {
  const {
    contentScraperSettings,
    searchResults,
    requestTimeoutSecs,
    dynamicContentWaitSecs,
    maxRequestRetries,
    removeCookieWarnings,
    desiredConcurrency,
  } = inputData;

  const concurrency = Math.max(1, Math.min(desiredConcurrency || 2, 5)); // Lower concurrency for browser

  if (log.info) {
    await log.info(`Scraping ${urls.length} URLs with Playwright, concurrency: ${concurrency}`);
  }

  const { browser } = await connectBrowser(log);

  // Create a pool of pages for reuse
  const pagePool = [];
  const maxPages = concurrency;

  const getPage = async () => {
    if (browser) {
      return browser.newPage({ viewport: null });
    } else {
      const localBrowser = await chromium.launch({ headless: true });
      const page = await localBrowser.newPage();
      page._localBrowser = localBrowser; // Attach browser reference for cleanup
      return page;
    }
  };

  const releasePage = async (page) => {
    try {
      await page.close();
    } catch {}
    if (page._localBrowser) {
      try {
        await page._localBrowser.close();
      } catch {}
    }
  };

  const processUrl = async (url, index) => {
    if (log.info) {
      await log.info(`Scraping with Playwright: ${url}`);
    }

    let page = null;

    try {
      page = await getPage();

      const retries = Math.max(0, maxRequestRetries || 0);
      let lastError = null;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Use smarter wait strategy
          const navigationTimeout = (requestTimeoutSecs || 40) * 1000;

          await page.goto(url, {
            timeout: navigationTimeout,
            waitUntil: 'domcontentloaded',
          });

          // Smart wait for dynamic content
          const waitTime = (dynamicContentWaitSecs || 10) * 1000;
          const hardDelay = Math.min(1000, Math.floor(0.3 * waitTime));
          await page.waitForTimeout(hardDelay);

          // Try to wait for network idle for remaining time
          const remainingTime = waitTime - hardDelay;
          if (remainingTime > 0) {
            try {
              await Promise.race([
                page.waitForLoadState('networkidle', { timeout: remainingTime }),
                page.waitForTimeout(remainingTime),
              ]);
            } catch {
              // Ignore timeout, continue with what we have
            }
          }

          if (removeCookieWarnings) {
            await page.evaluate((selectors) => {
              document.querySelectorAll(selectors).forEach((el) => el.remove());
            }, COOKIE_WARNING_SELECTORS);
          }

          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (attempt === retries) {
            throw err;
          }
          await page.waitForTimeout(1000 * (attempt + 1));
        }
      }

      if (lastError) {
        throw lastError;
      }

      const html = await page.content();
      const $ = load(html);

      const data = await handleContent($, html, url, contentScraperSettings, 200, 'OK');

      if (searchResults && searchResults[index]) {
        data.searchResult = searchResults[index];
      }

      return createOutputItem(url, data, contentScraperSettings);
    } catch (err) {
      if (log.error) {
        await log.error(`Failed to scrape ${url}: ${err.message}`);
      }
      return {
        url,
        error: err.message,
        status: 'failed',
      };
    } finally {
      if (page) {
        await releasePage(page);
      }
    }
  };

  try {
    return await processWithConcurrency(urls, processUrl, concurrency);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

const COOKIE_WARNING_SELECTORS = `
  [class*="cookie" i],
  [id*="cookie" i],
  [class*="consent" i],
  [id*="consent" i],
  [class*="gdpr" i],
  [id*="gdpr" i],
  [class*="privacy" i],
  [id*="privacy" i],
  [class*="banner" i][class*="cookie" i],
  [aria-label*="cookie" i],
  [aria-label*="consent" i]
`;

function validateInput(input) {
  const validated = { ...input };

  // Validate and set defaults
  if (!validated.maxResults || validated.maxResults < 1 || validated.maxResults > 100) {
    validated.maxResults = 3;
  }

  if (!validated.outputFormat) {
    validated.outputFormat = 'markdown';
  }

  if (!validated.outputFormats) {
    validated.outputFormats = [validated.outputFormat];
  }

  if (!validated.scrapingTool) {
    validated.scrapingTool = 'raw-http';
  }

  if (!validated.requestTimeoutSecs || validated.requestTimeoutSecs < 1 || validated.requestTimeoutSecs > 300) {
    validated.requestTimeoutSecs = 40;
  }

  if (!validated.dynamicContentWaitSecs || validated.dynamicContentWaitSecs < 0 || validated.dynamicContentWaitSecs > 60) {
    validated.dynamicContentWaitSecs = 10;
  }

  if (!validated.maxRequestRetries && validated.maxRequestRetries !== 0) {
    validated.maxRequestRetries = 1;
  }

  if (!validated.serpMaxRetries && validated.serpMaxRetries !== 0) {
    validated.serpMaxRetries = 2;
  }

  // Desired concurrency for parallel scraping
  if (!validated.desiredConcurrency && validated.desiredConcurrency !== 0) {
    validated.desiredConcurrency = 3;
  } else {
    validated.desiredConcurrency = Math.min(10, Math.max(1, validated.desiredConcurrency));
  }

  return validated;
}

async function runRAGWebBrowser(inputData, cafesdk) {
  const log = getLogger(cafesdk);
  const timeMeasures = new TimeMeasures();

  timeMeasures.addEvent('request-received');

  const input = validateInput(inputData);

  const {
    query,
    maxResults,
    outputFormats,
    scrapingTool,
    requestTimeoutSecs,
    removeElementsCssSelector,
    removeCookieWarnings,
    htmlTransformer,
    readableTextCharThreshold,
    serpMaxRetries,
    dynamicContentWaitSecs,
    maxRequestRetries,
    debugMode,
  } = input;

  const contentScraperSettings = {
    outputFormats,
    removeElementsCssSelector,
    removeCookieWarnings,
    htmlTransformer,
    readableTextCharThreshold,
  };

  const isUrl = query && query.match(/^https?:\/\//);

  let urlsToScrape = [];
  let searchResults = null;

  if (isUrl) {
    await log.info(`Direct URL provided: ${query}`);
    urlsToScrape = [query];
    timeMeasures.addEvent('url-parsed');
  } else if (query) {
    try {
      timeMeasures.addEvent('before-search');
      searchResults = await runGoogleSearch(query, maxResults, serpMaxRetries, log);
      timeMeasures.addEvent('search-complete');
      urlsToScrape = searchResults.map((r) => r.url).filter(Boolean);
      await log.info(`Found ${urlsToScrape.length} URLs to scrape`);
    } catch (err) {
      await log.error(`Search failed: ${err.message}`);
      await log.warn('Falling back to direct URL scraping (no search results)');
      urlsToScrape = [];
    }
  } else {
    await log.error('No query or URL provided');
    return [];
  }

  if (urlsToScrape.length === 0) {
    await log.warn('No URLs to scrape');
    return [];
  }

  const runtimeSettings = {
    ...input,
    contentScraperSettings,
    searchResults,
    requestTimeoutSecs,
    dynamicContentWaitSecs,
    maxRequestRetries,
  };

  timeMeasures.addEvent('before-scraping');

  let results;
  if (scrapingTool === 'browser-playwright') {
    results = await scrapeWithBrowser(urlsToScrape, runtimeSettings, log);
  } else {
    results = await scrapeWithHttp(urlsToScrape, runtimeSettings, log);
  }

  timeMeasures.addEvent('scraping-complete');

  // Add performance metrics to results if debug mode is enabled
  if (debugMode) {
    const perfMetrics = {
      timeMeasures: timeMeasures.getMeasures(),
      totalTimeMs: timeMeasures.getTotalTime(),
      urlsScraped: urlsToScrape.length,
      scrapingTool,
    };

    if (log.info) {
      await log.info(`Performance metrics: ${JSON.stringify(perfMetrics)}`);
    }

    // Attach debug info to each result
    results.forEach((result) => {
      if (result.crawl) {
        result.crawl.debug = perfMetrics;
      }
    });
  }

  return results;
}

module.exports = { runRAGWebBrowser };
