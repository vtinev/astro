import { fdir } from 'fdir';
import path from 'path';
import slash from 'slash';
import { fileURLToPath } from 'url';

/** Normalize URL to its canonical form */
export function canonicalURL(url: string, base?: string): URL {
  let pathname = url.replace(/\/index.html$/, ''); // index.html is not canonical
  pathname = pathname.replace(/\/1\/?$/, ''); // neither is a trailing /1/ (impl. detail of collections)
  if (!path.extname(pathname)) pathname = pathname.replace(/(\/+)?$/, '/'); // add trailing slash if there’s no extension
  pathname = pathname.replace(/\/+/g, '/'); // remove duplicate slashes (URL() won’t)
  return new URL(pathname, base);
}

export interface URLMap {
  staticPages: Map<string, URL>;
  collections: Map<string, URL>;
}

/** Generate Map of url -> Astro page */
export async function buildURLMap(root: URL): Promise<URLMap> {
  const urlMap: URLMap = { staticPages: new Map<string, URL>(), collections: new Map<string, URL>() };

  // scan dir (must be re-scanned on every file change)
  const files = (await new fdir().glob('**/*.(astro|md)').withBasePath().crawl(fileURLToPath(root)).withPromise()) as string[];

  // for each file…
  for (const file of files) {
    const filePath = new URL(`file://${slash(file)}`);
    const urlBase = filePath.pathname.replace(root.pathname, '/');

    const isCollectionPage = /\/\$[^\.]+\.astro$/.test(filePath.pathname);
    if (isCollectionPage) {
      // handle collections
      const collectionBase = urlBase.replace(/\/\$/, '/').replace(/\.(astro|md)$/, '');
      if (urlMap.collections.has(collectionBase)) throw new Error(`Collections URL conflict: ${collectionBase}`);
      urlMap.collections.set(collectionBase, filePath);
    } else {
      // handle static pages
      const url = urlBase.replace(/(index)?\.(astro|md)$/, '');
      const urls = [url.replace(/\/$/, ''), url.replace(/\/?$/, '/'), url.replace(/\/?$/, '/index.html')].filter((k) => !!k);
      for (const k of urls) {
        if (urlMap.staticPages.has(k)) throw new Error(`Static URL conflict: ${k}`);
        urlMap.staticPages.set(k, filePath);
      }
    }
  }
  return urlMap;
}
