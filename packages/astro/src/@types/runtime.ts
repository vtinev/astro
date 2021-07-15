import type { CompileError } from '@astrojs/parser';
import type { ServeResult } from 'esbuild';
import type { ViteDevServer } from 'vite';
import type { AstroConfig, CollectionRSS } from './astro';
import type { LogOptions } from './logger';

export interface AstroRuntime {
  runtimeConfig: RuntimeConfig;
  load: (rawPathname: string | undefined) => Promise<LoadResult>;
  shutdown: () => Promise<void>;
}

export interface RuntimeConfig {
  astroConfig: AstroConfig;
  logging: LogOptions;
  mode: RuntimeMode;
  viteClient?: ViteDevServer;
  viteServer: ViteDevServer;
}

export interface RuntimeCollection {
  additionalURLs: Set<string>;
  rss?: { data: any[] & CollectionRSS };
}

export type RuntimeMode = 'development' | 'production';

export interface RuntimeOptions {
  mode: RuntimeMode;
  logging: LogOptions;
}

export type LoadResultSuccess = {
  statusCode: 200;
  contents: string | Buffer;
  contentType?: string | false;
};
export type LoadResultNotFound = { statusCode: 404; error: Error; collectionInfo?: RuntimeCollection };
export type LoadResultRedirect = { statusCode: 301 | 302; location: string; collectionInfo?: RuntimeCollection };
export type LoadResultError = { statusCode: 500 } & (
  | { type: 'parse-error'; error: CompileError }
  | { type: 'ssr'; error: Error }
  | { type: 'not-found'; error: CompileError }
  | { type: 'unknown'; error: Error }
);

export type LoadResult = (LoadResultSuccess | LoadResultNotFound | LoadResultRedirect | LoadResultError) & { collectionInfo?: RuntimeCollection };
