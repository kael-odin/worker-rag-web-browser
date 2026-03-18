function isValidUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    if (url.startsWith('/search')) {
        return false;
    }
    try {
        const urlObj = new URL(url, 'http://example.com');
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    }
    catch {
        return false;
    }
}
export const deduplicateResults = (results) => {
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
};
const parseResult = ($, el) => {
    $(el).find('div.action-menu').remove();
    const descriptionSelector = '.VwiC3b';
    const searchResult = {
        title: $(el).find('h3').first().text() || '',
        description: ($(el).find(descriptionSelector).text() || '').trim(),
        url: $(el).find('a').first().attr('href') || '',
    };
    return searchResult;
};
const extractResultsFromSelectors = ($, selectors) => {
    const searchResults = [];
    const selector = selectors.join(', ');
    for (const resultEl of $(selector)) {
        const results = $(resultEl).map((_i, el) => parseResult($, el)).toArray();
        for (const result of results) {
            if (result.title && result.url && isValidUrl(result.url)) {
                searchResults.push(result);
            }
        }
    }
    return searchResults;
};
const areTheResultsSuggestions = ($) => {
    return $('div#topstuff > div.fSp71d').children().length > 0;
};
export const scrapeOrganicResults = ($) => {
    const resultSelectors2023January = [
        '.hlcw0c',
        '.g.Ww4FFb',
        '.MjjYud',
        '.g .tF2Cxc>.yuRUbf',
        '.g [data-header-feature="0"]',
        '.g .rc',
        '.sATSHe',
    ];
    const searchResults = extractResultsFromSelectors($, resultSelectors2023January);
    const deduplicatedResults = deduplicateResults(searchResults);
    let resultType = 'ORGANIC';
    if (areTheResultsSuggestions($)) {
        resultType = 'SUGGESTED';
    }
    return deduplicatedResults.map((result) => ({
        ...result,
        resultType,
    }));
};
