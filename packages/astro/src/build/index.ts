import type { AstroConfig, BuildOptions } from '../@types/astro';

import del from 'del';
import fs from 'fs';
import vite from 'vite';
import { fileURLToPath } from 'url';
import { warn } from '../logger.js';
import ssr from '../ssr/index.js';
import { buildURLMap } from '../ssr/util.js';
import { loadViteConfig } from '../ssr/vite_config.js';

type ReturnCode = number;

/** `astro build` */
export default async function build(config: AstroConfig, options: BuildOptions): Promise<ReturnCode> {
  const port = config.devOptions.port;
  if (!config.buildOptions.site) {
    warn(options.logging, 'config', `Set "buildOptions.site" to generate correct canonical URLs and sitemap`);
  }
  let origin = config.buildOptions.site ? new URL(config.buildOptions.site).origin : `http://localhost:${port}`;
  const entries: Record<string, string> = {};

  // clean old cache
  const buildCacheDir = new URL('./.astro-cache/', config.projectRoot);
  del.sync(fileURLToPath(buildCacheDir));

  // generate new URL map
  let urlMap = buildURLMap(config.pages);

  // create Vite SSR server
  const viteConfig = await loadViteConfig(
    {
      mode: 'production',
      server: {
        hmr: { overlay: false },
        middlewareMode: 'ssr',
      },
    },
    { astroConfig: config, logging: options.logging }
  );
  const viteServer = await vite.createServer(viteConfig);

  // write static HTML to disk
  await Promise.all(
    [...urlMap.staticPages.entries()].map(async ([k, v]) => {
      if (!k.endsWith('.html')) return; // urlMap contains many duplicate aliases; only build full paths with file extensions
      const html = await ssr({ config, logging: options.logging, mode: 'production', reqURL: k, origin, urlMap, viteServer });
      const filePath = new URL(k.replace(/^\//, './'), buildCacheDir);
      await fs.promises.mkdir(new URL('./', filePath), { recursive: true });
      await fs.promises.writeFile(filePath, html, 'utf8');
      const entryID = k === '/index.html' ? 'index' : k.replace(/^\//, '').replace(/\/index\.html$/, '');
      entries[entryID] = fileURLToPath(filePath);
    })
  );

  // write collection HTML to disk

  // build
  await vite.build({
    logLevel: 'error',
    mode: 'production',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      minify: 'esbuild',
      rollupOptions: {
        input: entries,
        output: {
          format: 'esm',
        },
      },
      target: 'es2020',
      watch: null,
    },
    root: fileURLToPath(buildCacheDir),
    server: viteConfig.server,
    plugins: viteConfig.plugins,
  });

  return 0;
}
