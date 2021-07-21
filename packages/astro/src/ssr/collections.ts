import type { CreateCollectionResult, CollectionRSS, PaginatedCollectionResult, PaginateFunction } from '../@types/astro';
import type { LogOptions } from '../logger';

import { compile as compilePathToRegexp, match as matchPathToRegexp } from 'path-to-regexp';
import { debug } from '../logger.js';

export interface CollectionInfo {
  additionalURLs: Set<string>;
  rss?: { data: any[] & CollectionRSS };
}

interface LoadCollectionOptions {
  filePath: URL;
  logging: LogOptions;
  reqURL: string;
}

/** Given a loaded SSR Astro file,  */
export default async function loadCollection(
  mod: any,
  { logging, filePath, reqURL }: LoadCollectionOptions
): Promise<{ collectionInfo: CollectionInfo; pageProps: Record<string, any> }> {
  // 1. validate source code
  validateCollectionModule(mod, filePath.href);

  // 2. load data
  const pageCollection: CreateCollectionResult = await mod.createCollection();

  // 3. validate loaded data
  validateCollectionResult(pageCollection, filePath.href);

  let collectionInfo: CollectionInfo = { additionalURLs: new Set<string>() };
  let pageProps: Record<string, any> = {};

  // 4. parse & paginate data
  const { route, paths: getPaths = () => [{ params: {} }], props: getProps, paginate: isPaginated, rss: createRSS } = pageCollection;
  debug(logging, 'collection', `use route "${route}" to match request "${reqURL}"`);
  const reqToParams = matchPathToRegexp<any>(route);
  const toPath = compilePathToRegexp(route);
  const reqParams = reqToParams(reqURL);
  if (!reqParams) {
    throw new Error(`[createCollection] route pattern does not match request: "${route}". (${filePath.href})`);
  }
  if (isPaginated && reqParams.params.page === '1') {
    throw new Error(`[createCollection] The first page of a paginated collection has no page number in the URL. (${filePath.href})`);
  }
  const pageNum = parseInt(reqParams.params.page || 1);
  const allPaths = getPaths();
  const matchedPathObject = allPaths.find((p) => toPath({ ...p.params, page: reqParams.params.page }) === reqURL);
  debug(logging, 'collection', `matched path: ${JSON.stringify(matchedPathObject)}`);
  if (!matchedPathObject) {
    throw new Error(`[createCollection] no matching path found: "${route}". (${filePath.href})`);
  }
  const matchedParams = matchedPathObject.params;
  if (matchedParams.page) {
    throw new Error(`[createCollection] "page" param is reserved for pagination and handled for you by Astro. It cannot be returned by "paths()". (${filePath.href})`);
  }
  let paginateUtility: PaginateFunction = () => {
    throw new Error(`[createCollection] paginate() function was called but "paginate: true" was not set. (${filePath.href})`);
  };
  let lastPage: number | undefined;
  let paginateCallCount: number | undefined;
  if (isPaginated) {
    paginateCallCount = 0;
    paginateUtility = (data, args = {}) => {
      paginateCallCount!++;
      let { pageSize } = args;
      if (!pageSize) {
        pageSize = 10;
      }
      const start = pageSize === Infinity ? 0 : (pageNum - 1) * pageSize; // currentPage is 1-indexed
      const end = Math.min(start + pageSize, data.length);
      lastPage = Math.max(1, Math.ceil(data.length / pageSize));
      // The first page of any collection should generate a collectionInfo
      // metadata object. Important for the final build.
      if (pageNum === 1) {
        collectionInfo = {
          additionalURLs: new Set<string>(),
          rss: undefined,
        };
        if (createRSS) {
          collectionInfo.rss = {
            ...createRSS,
            data: [...data] as any,
          };
        }
        for (const page of [...Array(lastPage - 1).keys()]) {
          collectionInfo.additionalURLs.add(toPath({ ...matchedParams, page: page + 2 }));
        }
      }
      return {
        data: data.slice(start, end),
        start,
        end: end - 1,
        total: data.length,
        page: {
          size: pageSize,
          current: pageNum,
          last: lastPage,
        },
        url: {
          current: reqURL,
          next: pageNum === lastPage ? undefined : toPath({ ...matchedParams, page: pageNum + 1 }),
          prev: pageNum === 1 ? undefined : toPath({ ...matchedParams, page: pageNum - 1 === 1 ? undefined : pageNum - 1 }),
        },
      } as PaginatedCollectionResult;
    };
  }

  // 5. set page props for SSR
  pageProps = await getProps({ params: matchedParams, paginate: paginateUtility });
  debug(logging, 'collection', `page props: ${JSON.stringify(pageProps)}`);
  if (paginateCallCount !== undefined && paginateCallCount !== 1) {
    throw new Error(`[createCollection] paginate() function must be called 1 time when "paginate: true". Called ${paginateCallCount} times instead. (${filePath.href})`);
  }
  if (lastPage !== undefined && pageNum > lastPage) {
    throw new Error(`[createCollection] page ${pageNum} does not exist. Available pages: 1-${lastPage} (${filePath.href})`);
  }

  // 6. finish
  return { collectionInfo, pageProps };
}

/** Friendly error message before loading collection data */
export function validateCollectionModule(mod: any, filename: string) {
  if (!mod.exports.createCollection) {
    throw new Error(`No "createCollection()" export found. Add one or remove the "$" from the filename. ("${filename}")`);
  }
}

/** Friendly error message after loading collection data */
export function validateCollectionResult(result: CreateCollectionResult, filename: string) {
  const LEGACY_KEYS = new Set(['permalink', 'data', 'routes']);
  for (const key of Object.keys(result)) {
    if (LEGACY_KEYS.has(key)) {
      throw new Error(`[deprecated] it looks like you're using the legacy createCollection() API. (key "${key}". (${filename})`);
    }
  }
  const VALID_KEYS = new Set(['route', 'paths', 'props', 'paginate', 'rss']);
  for (const key of Object.keys(result)) {
    if (!VALID_KEYS.has(key)) {
      throw new Error(`[createCollection] unknown option: "${key}". (${filename})`);
    }
  }
  const REQUIRED_KEYS = new Set(['route', 'props']);
  for (const key of REQUIRED_KEYS) {
    if (!(result as any)[key]) {
      throw new Error(`[createCollection] missing required option: "${key}". (${filename})`);
    }
  }
  if (result.paginate && !result.route.includes(':page?')) {
    throw new Error(`[createCollection] when "paginate: true" route must include a "/:page?" param. (${filename})`);
  }
}
