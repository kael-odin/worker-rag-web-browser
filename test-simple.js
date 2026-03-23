/**
 * Simple test to verify HTTP request works
 */
const http = require('http');
const https = require('https');

// Allow insecure HTTPS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testRequest(url, timeout = 10000) {
  console.log(`\nTesting: ${url}`);
  console.log(`Time: ${new Date().toISOString()}`);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${timeout}ms`));
    }, timeout);

    const protocol = url.startsWith('https:') ? https : http;
    const req = protocol.get(url, { timeout }, (res) => {
      clearTimeout(timeoutId);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Length: ${data.length}`);
        resolve({ status: res.statusCode, length: data.length });
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeoutId);
      console.error(`Error: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function main() {
  const tests = [
    'http://example.com',
    'https://example.com',
    'https://www.thordata.com',
  ];

  for (const url of tests) {
    try {
      await testRequest(url, 5000);
    } catch (err) {
      console.error(`Failed: ${err.message}`);
    }
  }
}

main();
