import { log } from 'crawlee';
import * as plugin from 'joplin-turndown-plugin-gfm';
import TurndownService from 'turndown';
const turndownSettings = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
};
const githubFlavouredHtmlToMarkdownProcessor = new TurndownService(turndownSettings);
const htmlToMarkdownProcessor = new TurndownService(turndownSettings);
githubFlavouredHtmlToMarkdownProcessor.use(plugin.gfm);
export const htmlToMarkdown = (html) => {
    try {
        if (!html?.length)
            return null;
        if (html.length <= 100000) {
            return githubFlavouredHtmlToMarkdownProcessor.turndown(html);
        }
        return htmlToMarkdownProcessor.turndown(html);
    }
    catch (err) {
        if (err instanceof Error) {
            log.exception(err, `Error while extracting markdown from HTML: ${err.message}`);
        }
        else {
            log.exception(new Error('Unknown error'), 'Error while extracting markdown from HTML');
        }
        return null;
    }
};
