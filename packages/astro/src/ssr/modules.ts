/**
 * Hack to get Vite loading CJS and ESM properly, at least until this makes more progress: https://github.com/vitejs/vite/issues/4231
 */
import { builtinModules } from 'module';

// modules with require()
export const CJS_MODULES = new Set([
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
]);

// modules with import …
export const ES_MODULES = new Set([
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
]);

// Astro dependencies that need to be optimized by Vite, that it has a hard time picking up on (renderers, etc)
export const ASTRO_RUNTIME_DEPS = new Set([
  '@astrojs/markdown-support',
  '@astrojs/renderer-react/client',
  '@astrojs/renderer-preact/client',
  '@astrojs/renderer-vue/client',
  '@astrojs/renderer-svelte/client',
  'react',
  'react-dom',
  'vue',
  'svelte',
]);
