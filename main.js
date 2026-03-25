#!/usr/bin/env node
'use strict'

const cafesdk = require('./sdk')

async function run() {
    try {
        const inputJson = await cafesdk.parameter.getInputJSONObject()
        await cafesdk.log.debug(`Input parameters: ${JSON.stringify(inputJson)}`)

        // Extract query - supports both 'query' (string) and legacy 'url' (array) formats
        let query = ''
        if (inputJson?.query && typeof inputJson.query === 'string') {
            // New format: query string (search keywords or URL)
            query = inputJson.query.trim()
        } else if (Array.isArray(inputJson?.url)) {
            // Legacy format: url array
            query = inputJson.url[0]?.url || inputJson.url[0] || ''
        } else if (typeof inputJson?.url === 'string') {
            // Legacy format: url string
            query = inputJson.url.trim()
        }

        // Parse all input parameters with defaults
        const maxResults = inputJson?.maxResults || 3
        const outputFormat = inputJson?.outputFormat || 'markdown'
        const scrapingTool = inputJson?.scrapingTool || 'raw-http'
        const requestTimeoutSecs = inputJson?.requestTimeoutSecs || 40
        const maxRequestRetries = inputJson?.maxRequestRetries || 1
        const desiredConcurrency = inputJson?.desiredConcurrency || 3
        const removeCookieWarnings = inputJson?.removeCookieWarnings !== false
        const debugMode = inputJson?.debugMode === true

        if (!query) {
            await cafesdk.log.error('Missing required parameter: query')
            const headers = [
                { label: 'Error', key: 'error', format: 'text' }
            ]
            await cafesdk.result.setTableHeader(headers)
            await cafesdk.result.pushData({ error: 'Missing query parameter. Please enter a URL or search keywords.' })
            return
        }

        await cafesdk.log.info(`Starting RAG Web Browser with query: ${query}`)
        await cafesdk.log.info(`Max results: ${maxResults}, Output format: ${outputFormat}, Scraping tool: ${scrapingTool}`)

        const { runRAGWebBrowser } = require('./src/worker-main.js')

        const results = await runRAGWebBrowser({
            query,
            maxResults,
            outputFormat,
            outputFormats: [outputFormat],
            scrapingTool,
            requestTimeoutSecs,
            maxRequestRetries,
            desiredConcurrency,
            removeCookieWarnings,
            debugMode,
        }, cafesdk)

        const contentLabel = outputFormat === 'html' ? 'HTML' : outputFormat === 'text' ? 'Text' : 'Markdown'
        const headers = [
            { label: 'Query', key: 'query', format: 'text' },
            { label: 'URL', key: 'url', format: 'text' },
            { label: 'Title', key: 'title', format: 'text' },
            { label: 'Description', key: 'description', format: 'text' },
            { label: contentLabel, key: 'content', format: 'text' },
            { label: 'Status Code', key: 'status_code', format: 'integer' },
            { label: 'Error', key: 'error', format: 'text' },
        ]

        await cafesdk.result.setTableHeader(headers)

        if (Array.isArray(results) && results.length > 0) {
            for (const item of results) {
                // Content is in different fields depending on outputFormat:
                // worker-main.js createOutputItem puts it in item.markdown / item.html / item.text
                const content = item.markdown || item.html || item.text || ''
                await cafesdk.result.pushData({
                    query: query,
                    url: item.url || item.metadata?.url || '',
                    title: item.title || item.metadata?.title || '',
                    description: item.description || item.metadata?.description || '',
                    content: content,
                    status_code: item.crawl?.httpStatusCode || 200,
                    error: item.error || '',
                })
            }
            await cafesdk.log.info(`Completed with ${results.length} results`)
        } else {
            await cafesdk.result.pushData({
                query: query,
                error: 'No results found',
            })
            await cafesdk.log.warn('No results found')
        }

        await cafesdk.log.info('Script execution completed')
    } catch (err) {
        await cafesdk.log.error(`Script execution error: ${err.message}`)

        const errorResult = {
            error: err.message,
            error_code: '500',
            status: 'failed'
        }

        await cafesdk.result.pushData(errorResult)
    }
}

run()
