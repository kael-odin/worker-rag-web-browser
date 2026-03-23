/**
 * Test proxy connection locally
 */
const http = require('http');
const https = require('https');

async function fetchWithProxy(url, timeout = 30000) {
  const proxyAuth = process.env.PROXY_AUTH;
  const proxyHost = 'proxy-inner.cafescraper.com';
  const proxyPort = 6000;

  console.log(`Proxy auth present: ${!!proxyAuth}`);
  console.log(`Fetching: ${url}`);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    if (proxyAuth) {
      console.log('Using proxy...');
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
          console.log(`Proxy CONNECT status: ${res.statusCode}`);
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
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,*/*',
            },
            socket: res.socket,
          };

          const request = protocol.request(requestOptions, (response) => {
            clearTimeout(timeoutId);
            let data = '';
            response.on('data', (chunk) => {
              data += chunk;
            });
            response.on('end', () => {
              resolve({
                html: data,
                statusCode: response.statusCode,
                statusMessage: response.statusMessage,
              });
            });
          });
          request.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
          request.end();
        }
      );

      req.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
      req.end();
    } else {
      console.log('No proxy, using direct connection...');
      const protocol = url.startsWith('https:') ? https : http;
      const req = protocol.get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,*/*',
          },
          timeout: timeout,
        },
        (response) => {
          clearTimeout(timeoutId);
          let data = '';
          response.on('data', (chunk) => {
            data += chunk;
          });
          response.on('end', () => {
            resolve({
              html: data,
              statusCode: response.statusCode,
              statusMessage: response.statusMessage,
            });
          });
        }
      );
      req.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    }
  });
}

async function test() {
  try {
    console.log('Testing fetch...\n');
    const result = await fetchWithProxy('https://example.com', 10000);
    console.log(`\nStatus: ${result.statusCode}`);
    console.log(`HTML length: ${result.html.length}`);
    console.log(`Preview: ${result.html.substring(0, 200)}...`);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
  }
}

test();
