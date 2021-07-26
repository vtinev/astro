import type { ViteDevServer } from 'vite';
import type { AstroConfig, RuntimeMode } from '../@types/astro';
import type { LogOptions } from '../logger';

import cheerio from 'cheerio';
import { fdir } from 'fdir';
import esModuleLexer from 'es-module-lexer';
import path from 'path';
import { fileURLToPath } from 'url';
import loadCollection from './collections.js';
import { canonicalURL, URLMap } from './util.js';

interface SSROptions {
  config: AstroConfig;
  logging: LogOptions;
  mode: RuntimeMode;
  origin: string;
  reqURL: string;
  urlMap: URLMap;
  viteServer: ViteDevServer;
}

/** Convert node_modules import to Vite Dev Server URL */
function resolveViteNPMModule(spec: string, browserHash?: string): string {
  return `/node_modules/.vite/${spec.replace(/\//g, '_').replace(/\./g, '_')}.js${browserHash ? `?v=${browserHash}` : ''}`;
}

let TODO_REMOVE_IS_COLD_START = true; // use to add missing CSS on first load

/** Use Vite to SSR URL */
export default async function ssr({ config, logging, reqURL, mode, urlMap, origin, viteServer }: SSROptions): Promise<string> {
  // locate file on disk
  const buildCache = new URL('./.astro-cache', config.projectRoot);
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
  let html: string = await mod.__renderPage({
    request: {
      // params should go here when implemented
      url: fullURL,
      canonicalURL: canonicalURL(fullURL.pathname, fullURL.origin),
    },
    children: [],
    props: pageProps,
    css: mod.css || [],
  });

  // extract inline scripts (Vite has a problem with these because .astro generates dyanmic HTML and there’s nothing on-disk)
  let devInlineJS: string[] = [];
  const $ = cheerio.load(html);
  const scripts = $('script[type="module"]');
  for (const script of scripts) {
    let code = $(script).html() as string;
    const isInlineScript = !$(script).attr('src') && code;
    if (!isInlineScript) continue; // if this isn’t inline, skip

    const scriptTag = (js: string) =>
      `<script ${Object.entries(script.attribs || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')}>${js}</script>`;

    // production: npm modules are fine, but need to resolve local files
    if (mode === 'production') {
      // find absolute imports and convert to relative. repeat until none left.
      const scan = () => esModuleLexer.parse(code)[0].filter(({ n }) => n && n[0] === '/');
      let specs = scan();
      while (specs.length) {
        const next = specs[0];
        const relPath = path.posix.relative(fileURLToPath(new URL(`.${reqURL}`, buildCache)), fileURLToPath(new URL(`.${next.n}`, config.projectRoot)));
        const spec = next.d === -1 ? relPath : `'${relPath}'`;
        code = code.substring(0, next.s) + spec + code.substring(next.e);
        specs = scan(); // scan again
      }
      $(script).replaceWith($(scriptTag(code)));
      html = $.html();
    }
    // development: local files are fine, but need to resolve npm files
    else {
      let browserHash: string | undefined;
      if ((viteServer as any)._optimizeDepsMetadata) browserHash = (viteServer as any)._optimizeDepsMetadata.browserHash as string;
      const scan = () => esModuleLexer.parse(code)[0].filter(({ n }) => n && n[0] !== '.' && n[0] !== '/');
      let specs = scan();
      while (specs.length) {
        const next = specs[0];
        const npmPath = resolveViteNPMModule(`${next.n}`, browserHash);
        const spec = next.d === -1 ? npmPath : `'${npmPath}'`;
        code = code.substring(0, next.s) + spec + code.substring(next.e);
        specs = scan();
      }

      devInlineJS.push(scriptTag(code));
      $(script).remove();
      html = $.html();
    }
  }

  // add CSS
  const modMeta = await viteServer.moduleGraph.getModuleByUrl(fileURLToPath(modURL));
  const deepImports = new Set<string>();
  /** Get module deps */
  async function collectDeepImports(modUrl: string) {
    if (deepImports.has(modUrl)) {
      return;
    }
    deepImports.add(modUrl);
    const depMeta = await viteServer.moduleGraph.getModuleByUrl(modUrl);
    depMeta?.ssrTransformResult?.deps?.forEach(collectDeepImports);
  }
  await Promise.all(modMeta?.ssrTransformResult?.deps?.map(collectDeepImports) || []);
  const deepCssImports = [...deepImports].filter((d) => d.endsWith('.css'));
  // TODO: remove this (adds a hack to scan cache on cold startup)
  if (TODO_REMOVE_IS_COLD_START) {
    const cssCacheDir = new URL('./.astro-cache/css/', config.projectRoot);
    const cachedCSS = (await new fdir().withFullPaths().crawl(fileURLToPath(cssCacheDir)).withPromise()) as string[];
    cachedCSS.forEach((url) => {
      deepCssImports.push(url.replace(config.projectRoot.pathname, '/'));
    });
  }
  // production: optimize CSS as files
  if (mode === 'production') {
    const pagesURL = new URL(`.${reqURL}`, config.pages);
    const buildCacheURL = new URL(`.${reqURL}`, buildCache);
    // resolve <link> tags
    $('link[href]').each((_, el) => {
      const href = el.attribs.href as string;
      if (href.startsWith('http://') || href.startsWith('https://') || href[0] === '/') return; // ignore absolute/static URLs
      const originalURL = new URL(href, pagesURL);
      let relPath = path.posix.relative(fileURLToPath(pagesURL), fileURLToPath(originalURL));
      if (relPath[0] !== '.') relPath = `./${relPath}`;
      $(el).attr('href', relPath);
    });
    html = $.html();

    // add deep imports
    html = html.replace(
      '</head>',
      `  ${deepCssImports
        .map((projectURL) => {
          let url = projectURL;
          if (projectURL[0] === '/') {
            const cssURL = fileURLToPath(new URL(`.${projectURL}`, config.projectRoot));
            url = path.posix.relative(fileURLToPath(buildCacheURL), cssURL);
            if (url[0] !== '.') url = `./${url}`; // Vite needs module-like imports
          }
          return `<link rel="stylesheet" type="text/css" href="${url}" />`;
        })
        .join('\n  ')}</head>`
    );
  }
  // development: load CSS as JS modules to take advantage of HMR
  else {
    html = html.replace('</head>', `  ${deepCssImports.map((url) => `<script type="module" src="${url}"></script>`).join('\n  ')}</head>`);
  }

  // inject Vite HMR code (skip for production)
  if (mode === 'development') {
    html = await viteServer.transformIndexHtml(reqURL, html);
  }

  // development: add JS
  if (mode === 'development') {
    html = html.replace('</body>', `${devInlineJS.join('\n')}</body>`);
  }

  TODO_REMOVE_IS_COLD_START = false;

  // finish
  return html;
}
