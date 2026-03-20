#!/usr/bin/env node
'use strict'

const cafesdk = require('./sdk')

async function run() {
    try {
        const inputJson = await cafesdk.parameter.getInputJSONObject()
        await cafesdk.log.debug(`Input parameters: ${JSON.stringify(inputJson)}`)

        const queryArray = inputJson?.query || []
        const query = queryArray[0]?.url || ''
        const maxResults = inputJson?.maxResults || 3
        const outputFormat = inputJson?.outputFormat || 'markdown'
        const scrapingTool = inputJson?.scrapingTool || 'raw-http'
        const requestTimeoutSecs = inputJson?.requestTimeoutSecs || 40
        const removeCookieWarnings = inputJson?.removeCookieWarnings !== false
        const debugMode = inputJson?.debugMode === true

        if (!query) {
            await cafesdk.log.error('Missing required parameter: query')
            const headers = [
                { label: 'Error', key: 'error', format: 'text' }
            ]
            await cafesdk.result.setTableHeader(headers)
            await cafesdk.result.pushData({ error: 'Missing query parameter' })
            return
        }

        await cafesdk.log.info(`Starting RAG Web Browser with query: ${query}`)
        await cafesdk.log.info(`Max results: ${maxResults}, Output format: ${outputFormat}`)

        const { runRAGWebBrowser } = require('./src/worker-main.js')

        const results = await runRAGWebBrowser({
            query,
            maxResults,
            outputFormat,
            outputFormats: [outputFormat],
            scrapingTool,
            requestTimeoutSecs,
            removeCookieWarnings,
        }, cafesdk)

        const headers = [
            { label: 'Query', key: 'query', format: 'text' },
            { label: 'URL', key: 'url', format: 'text' },
            { label: 'Title', key: 'title', format: 'text' },
            { label: 'Description', key: 'description', format: 'text' },
            { label: 'Markdown', key: 'markdown', format: 'text' },
            { label: 'Status Code', key: 'status_code', format: 'integer' },
            { label: 'Error', key: 'error', format: 'text' },
        ]

        await cafesdk.result.setTableHeader(headers)

        if (Array.isArray(results) && results.length > 0) {
            for (const item of results) {
                await cafesdk.result.pushData({
                    query: query,
                    url: item.url || item.metadata?.url || '',
                    title: item.title || item.metadata?.title || '',
                    description: item.description || item.metadata?.description || '',
                    markdown: item.markdown || '',
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
