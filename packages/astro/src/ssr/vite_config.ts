import type { InlineConfig } from 'vite';
import type { AstroConfig } from '../@types/astro';
import type { LogOptions } from '../logger';

import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import deepmerge from 'deepmerge';
import { fileURLToPath } from 'url';
import astro from './vite_plugin_astro.js';
import { getUserDeps } from '../util.js';

// note: ssr is still an experimental API hence the type omission
type ViteConfigWithSSR = InlineConfig & { ssr?: { external?: string[]; noExternal?: string[] } };

/** Return a common starting point for all Vite actions */
export async function loadViteConfig(viteConfig: ViteConfigWithSSR, { astroConfig, logging }: { astroConfig: AstroConfig; logging: LogOptions }): Promise<ViteConfigWithSSR> {
  return deepmerge(
    {
      logLevel: 'error',
      optimizeDeps: {
        /** Try and scan a user’s project (won’t catch everything) */
        entries: ['src/**/*'],
        /** Always include these dependencies for optimization */
        include: [
          '@astrojs/markdown-support',
          'astro/frontend/hydrate/idle.js',
          'astro/frontend/hydrate/load.js',
          'astro/frontend/hydrate/media.js',
          'astro/frontend/hydrate/visible.js',
          ...(astroConfig.renderers || []).map((renderer) => renderer + '/client'), // @astrojs/renderer-* (TODO: fix for custom renderers)
          ...(astroConfig.renderers?.includes('@astrojs/renderer-react') ? ['react', 'react-dom'] : []),
        ],
      },
      plugins: [
        astro({
          astroConfig,
          logging,
          mode: 'production',
        }),
        svelte({
          emitCss: true,
          compilerOptions: { hydratable: true },
        }),
        vue(),
      ],
      publicDir: fileURLToPath(astroConfig.public),
      resolve: {
        dedupe: ['react', 'react-dom', 'svelte', 'svelte-hmr'],
      },
      root: fileURLToPath(astroConfig.projectRoot),
      server: {
        /** prevent serving outside of project root (will become new default soon) */
        fs: { strict: true },
      },
      ssr: {
        /** deps that Vite doesn’t need to scan (i.e. server-side code) */
        external: [
          'esbuild',
          'estree-util-value-to-estree',
          'github-slugger',
          'js-yaml',
          'kind-of',
          'min-indent',
          'node-fetch',
          'prismjs',
          'rehype-expressions',
          'rehype-raw',
          'rehype-stringify',
          'remark',
          'remark-footnotes',
          'remark-gfm',
          'remark-parse',
          'remark-rehype',
          'section-matter',
          'shorthash',
          'strip-bom-string',
          'unified',
        ],
        /** deps that Vite should make sure are included in the final build (assuming they’re used) */
        noExternal: [
          '@astrojs/markdown-support',
          '@astrojs/parser',
          '@astrojs/renderer-preact',
          '@astrojs/renderer-react',
          '@astrojs/renderer-svelte',
          '@astrojs/renderer-vue',
          'astro',
          'micromark-extension-mdx-expression',
          'unist-util-visit',
          'slash',
          'string-width',
          ...(await getUserDeps(astroConfig.projectRoot)), // also include any dependencies a user has
        ],
      },
    },
    viteConfig
  );
}
