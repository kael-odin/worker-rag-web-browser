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

const turndownService = new TurndownService();
turndownService.use(gfm);

const DEFAULT_REMOVE_ELEMENTS = "nav, footer, script, style, noscript, svg, img[src^='data:'],\n[role=\"alert\"],\n[role=\"banner\"],\n[role=\"dialog\"],\n[role=\"alertdialog\"],\n[role=\"region\"][aria-label*=\"skip\" i],\n[aria-modal=\"true\"]";

const noop = async () => {};

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

const COOKIE_WARNING_SELECTORS = [
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="consent" i]',
  '[class*="consent" i]',
  '[id*="gdpr" i]',
  '[class*="gdpr" i]',
  '[aria-label*="cookie" i]',
  '[aria-label*="consent" i]',
  '[data-cookie]',
  '[data-consent]',
].join(', ');

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

function readableTextFromHtml(html, url) {
  if (!html) return '';
  const dom = new JSDOM(html, { url: url || 'https://example.com' });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  return article?.textContent || '';
}

function processHtml(html, settings, url) {
  if (!html) return '';
  let $ = load(html);

  if (settings.removeElementsCssSelector) {
    $(settings.removeElementsCssSelector).remove();
  }

  if (settings.removeCookieWarnings) {
    $(COOKIE_WARNING_SELECTORS).remove();
  }

  const bodyHtml = $('body').html() || html;

  if (settings.htmlTransformer === 'readableText') {
    const readableText = readableTextFromHtml(bodyHtml, url);
    if (settings.readableTextCharThreshold && readableText.length < settings.readableTextCharThreshold) {
      return bodyHtml;
    }
    const cleanedText = readableText.replace(/\s+/g, ' ').trim();
    return cleanedText ? `<html><body>${cleanedText}</body></html>` : bodyHtml;
  }

  return bodyHtml;
}

function scrapeGoogleResults($) {
  const results = [];
  const seenUrls = new Set();

  const selectors = ['#search .g', '#rso .g', '.g[data-hveid]'];

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
          description: desc.trim(),
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
  return new Promise((resolve, reject) => {
    const proxyAuth = process.env.PROXY_AUTH;
    const proxyHost = 'proxy-inner.cafescraper.com';
    const proxyPort = 6000;

    const requestHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      Connection: 'keep-alive',
    };

    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const handleResponse = (response) => {
      clearTimeout(timeoutId);
      let data = '';
      const chunks = [];
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      response.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          if (response.headers['content-encoding'] === 'gzip') {
            const zlib = require('zlib');
            data = zlib.gunzipSync(buffer).toString('utf8');
          } else {
            data = buffer.toString('utf8');
          }
        } catch (e) {
          data = chunks.join('');
        }
        resolve({ html: data, statusCode: response.statusCode, statusMessage: response.statusMessage || '' });
      });
    };

    const handleError = (err) => {
      clearTimeout(timeoutId);
      reject(err);
    };

    if (proxyAuth) {
      const req = http.request(
        {
          host: proxyHost,
          port: proxyPort,
          method: 'CONNECT',
          path: url,
          headers: {
            Host: proxyHost,
            'Proxy-Authorization': `Basic ${Buffer.from(proxyAuth).toString('base64')}`,
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            clearTimeout(timeoutId);
            reject(new Error(`Proxy CONNECT failed with status ${res.statusCode}`));
            return;
          }

          const targetUrl = new URL(url);
          const protocol = targetUrl.protocol === 'https:' ? https : http;
          const requestOptions = {
            protocol: targetUrl.protocol,
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: `${targetUrl.pathname}${targetUrl.search}`,
            method: 'GET',
            headers: requestHeaders,
            socket: res.socket,
          };

          const request = protocol.request(requestOptions, handleResponse);
          request.on('error', handleError);
          request.end();
        }
      );

      req.on('error', handleError);
      req.end();
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
    await log.info(`Running Google Search for: ${query}`);
  }

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults * 3}`;
  const retries = Math.max(0, serpMaxRetries || 0);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { html, statusCode } = await fetchUrl(searchUrl, 30000, log);

      if (statusCode !== 200 && log.warn) {
        await log.warn(`Google search returned status ${statusCode}`);
      }

      if (!html || html.length < 100) {
        if (log.warn) {
          await log.warn(`Google search returned empty or very short response (${html?.length || 0} chars), attempt ${attempt + 1}`);
        }
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return [];
      }

      const $ = load(html);
      
      if ($('#captcha').length > 0 || $('form[action*="verify"]').length > 0) {
        if (log.error) {
          await log.error('Google presented CAPTCHA, search failed');
        }
        return [];
      }

      const organicResults = scrapeGoogleResults($);
      if (log.info) {
        await log.info(`Found ${organicResults.length} organic results`);
      }

      if (organicResults.length > 0) {
        return organicResults.slice(0, maxResults);
      }

      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      if (log.error) {
        await log.error(`Google search attempt ${attempt + 1} failed: ${err.message}`);
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  return [];
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
    title: $('title').first().text(),
    description: $('meta[name=description]').first().attr('content') || '',
    languageCode: $('html').first().attr('lang') || 'en',
    statusCode,
    statusMessage,
    text: settings.outputFormats?.includes('text') ? htmlToText(processedHtml) : undefined,
    markdown: settings.outputFormats?.includes('markdown') ? htmlToMarkdown(processedHtml) : undefined,
    html: settings.outputFormats?.includes('html') ? processedHtml : undefined,
  };

  return data;
}

async function scrapeWithBrowser(urls, inputData, log) {
  const results = [];
  const {
    contentScraperSettings,
    searchResults,
    requestTimeoutSecs,
    dynamicContentWaitSecs,
    maxRequestRetries,
    removeCookieWarnings,
  } = inputData;

  const { browser } = await connectBrowser(log);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (log.info) {
      await log.info(`Scraping with Playwright: ${url}`);
    }

    let page = null;
    let localBrowser = null;

    try {
      if (browser) {
        page = await browser.newPage({ viewport: null });
      } else {
        localBrowser = await chromium.launch({ headless: true });
        page = await localBrowser.newPage();
      }

      const retries = Math.max(0, maxRequestRetries || 0);
      let lastError = null;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await page.goto(url, {
            timeout: (requestTimeoutSecs || 40) * 1000,
            waitUntil: 'domcontentloaded',
          });

          if (dynamicContentWaitSecs && dynamicContentWaitSecs > 0) {
            await page.waitForTimeout(dynamicContentWaitSecs * 1000);
          } else {
            await page.waitForTimeout(2000);
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
          await page.waitForTimeout(1000);
        }
      }

      if (lastError) {
        throw lastError;
      }

      const html = await page.content();
      const $ = load(html);

      const data = await handleContent($, html, url, contentScraperSettings, 200, 'OK');

      if (searchResults && searchResults[i]) {
        data.searchResult = searchResults[i];
      }

      results.push(createOutputItem(url, data, contentScraperSettings));
    } catch (err) {
      if (log.error) {
        await log.error(`Failed to scrape ${url}: ${err.message}`);
      }
      results.push({
        url,
        error: err.message,
        status: 'failed',
      });
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {}
      }
      if (localBrowser) {
        try {
          await localBrowser.close();
        } catch {}
      }
    }
  }

  if (browser) {
    try {
      await browser.close();
    } catch {}
  }

  return results;
}

async function scrapeWithHttp(urls, inputData, log) {
  const results = [];
  const { contentScraperSettings, searchResults, requestTimeoutSecs, maxRequestRetries } = inputData;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
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
        }
      }

      if (lastError) {
        throw lastError;
      }

      const $ = load(html);

      const data = await handleContent($, html, url, contentScraperSettings, statusCode, statusMessage);

      if (searchResults && searchResults[i]) {
        data.searchResult = searchResults[i];
      }

      results.push(createOutputItem(url, data, contentScraperSettings));
    } catch (err) {
      if (log.error) {
        await log.error(`Failed to scrape ${url}: ${err.message}`);
      }
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

  validated.outputFormat = validated.outputFormat || 'markdown';
  if (!['text', 'markdown', 'html'].includes(validated.outputFormat)) {
    throw new Error('The `outputFormat` parameter must be either `text`, `markdown`, or `html`.');
  }

  validated.outputFormats = [validated.outputFormat];

  if (!validated.scrapingTool) {
    validated.scrapingTool = 'raw-http';
  } else if (validated.scrapingTool !== 'browser-playwright' && validated.scrapingTool !== 'raw-http') {
    throw new Error('The `scrapingTool` parameter must be either `browser-playwright` or `raw-http`.');
  }

  if (!validated.removeElementsCssSelector) {
    validated.removeElementsCssSelector = DEFAULT_REMOVE_ELEMENTS;
  }

  if (!validated.maxRequestRetries && validated.maxRequestRetries !== 0) {
    validated.maxRequestRetries = 1;
  }

  if (!validated.dynamicContentWaitSecs && validated.dynamicContentWaitSecs !== 0) {
    validated.dynamicContentWaitSecs = 10;
  }

  if (validated.removeCookieWarnings === undefined) {
    validated.removeCookieWarnings = true;
  }

  if (!validated.htmlTransformer) {
    validated.htmlTransformer = 'none';
  }

  if (!validated.readableTextCharThreshold) {
    validated.readableTextCharThreshold = 0;
  }

  if (!validated.serpMaxRetries && validated.serpMaxRetries !== 0) {
    validated.serpMaxRetries = 2;
  }

  return validated;
}

async function runRAGWebBrowser(inputData, cafesdk) {
  const log = getLogger(cafesdk);
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
  } else if (query) {
    try {
      searchResults = await runGoogleSearch(query, maxResults, serpMaxRetries, log);
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

  if (scrapingTool === 'browser-playwright') {
    return scrapeWithBrowser(urlsToScrape, runtimeSettings, log);
  }

  return scrapeWithHttp(urlsToScrape, runtimeSettings, log);
}

module.exports = { runRAGWebBrowser };
