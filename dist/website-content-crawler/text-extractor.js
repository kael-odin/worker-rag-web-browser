import { isProbablyReaderable, Readability } from '@mozilla/readability';
import { log } from 'crawlee';
import { JSDOM, VirtualConsole } from 'jsdom';
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', (error) => {
    log.error(`JSDOM error: ${error}`);
});
export async function readableText({ html, url, settings, options, }) {
    const dom = new JSDOM(html, { url, virtualConsole });
    if (options?.fallbackToNone && !isProbablyReaderable(dom.window.document, { minScore: 100 })) {
        return html;
    }
    const reader = new Readability(dom.window.document, {
        charThreshold: settings.readableTextCharThreshold,
        serializer: (n) => n,
    });
    const parsed = reader.parse();
    const readabilityRoot = parsed?.content;
    if (readabilityRoot && parsed?.title) {
        const titleElement = dom.window.document.createElement('h1');
        titleElement.textContent = parsed.title;
        readabilityRoot.insertBefore(titleElement, readabilityRoot.firstChild);
    }
    return readabilityRoot?.outerHTML;
}
