import type { ViteDevServer } from 'vite';
import type { LogOptions } from '../logger';

import { fileURLToPath } from 'url';
import loadCollection from './collections.js';
import { canonicalURL, URLMap } from './util.js';

interface SSROptions {
  logging: LogOptions;
  origin: string;
  reqURL: string;
  urlMap: URLMap;
  viteServer: ViteDevServer;
}

/** Use Vite to SSR URL */
export default async function ssr({ logging, reqURL, urlMap, origin, viteServer }: SSROptions): Promise<string> {
  // locate file on disk
  const fullURL = new URL(reqURL, origin);
  const modURL = urlMap.staticPages.get(reqURL) as URL;
  const mod = await viteServer.ssrLoadModule(fileURLToPath(modURL));

  let pageProps = {} as Record<string, any>;

  // load collection, if applicable
  if (mod.collection) {
    const collectionResult = await loadCollection(mod, { logging, reqURL, filePath: modURL });
    pageProps = collectionResult.pageProps;
  }

  // SSR HTML
  let html = await mod.__renderPage({
    request: {
      // params should go here when implemented
      url: fullURL,
      canonicalURL: canonicalURL(fullURL.pathname, fullURL.origin),
    },
    children: [],
    props: pageProps,
    css: mod.css || [],
  });

  // inject Vite client
  // note: vite.transformIndexHtml(…) will strip hydration scripts
  html = html.replace(/<head>/, `<head><script type="module" src="/@vite/client"></script>`);

  // finish
  return html;
}
