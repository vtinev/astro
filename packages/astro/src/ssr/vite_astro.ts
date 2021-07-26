import type { SourceDescription } from 'rollup';
import type { Plugin } from 'vite';
import type { CompileOptions } from '../@types/compiler';

import fs from 'fs';
import slash from 'slash';
import { fileURLToPath } from 'url';
import { compileComponent } from '../compiler/index.js';

const ASTRO_CSS = 'astro_internal:css';
const ASTRO_RENDERERS = 'astro_internal:renderers'; // can be anything; just ensure no conflicts with other namespaces

const cssCache = new Map<string, SourceDescription>();

/** Allow Vite to load .astro files */
export default function astro(compileOptions: CompileOptions): Plugin {
  // note: we can’t access the Vite instance because this plugin is required to create it!
  let viteOptimizerMetaLoc = new URL('./node_modules/.vite/_metadata.json', compileOptions.astroConfig.projectRoot); // will be overwritten in configResolved()

  return {
    name: '@astrojs/plugin-vite',
    configResolved(resolvedConfig) {
      if (resolvedConfig.cacheDir) {
        viteOptimizerMetaLoc = new URL('./_metadata.json', `file://${slash(resolvedConfig.cacheDir)}/`); // update metadata loc
      }
    },
    async transform(src, id) {
      if (id.endsWith('.astro') || id.endsWith('.md')) {
        const result = await compileComponent(src, {
          compileOptions,
          filename: id,
          projectRoot: fileURLToPath(compileOptions.astroConfig.projectRoot),
        });
        let code = result.contents;
        if (result.css) {
          const cssID = slash(id).replace(compileOptions.astroConfig.projectRoot.pathname, '') + '.css';
          code = `import '${ASTRO_CSS}/${cssID}';\n` + code;
          cssCache.set(cssID, result.css);
        }
        return {
          code,
          map: undefined, // TODO: add sourcemap
        };
      }
      if (id.endsWith('__astro_component.js')) {
        const code = `import rendererInstances from '${ASTRO_RENDERERS}';
        ${src}`;
        return {
          code,
          map: undefined, // TODO
        };
      }
    },
    resolveId(id) {
      if (id === ASTRO_RENDERERS || id.startsWith(ASTRO_CSS)) return id;
      return null;
    },
    async load(id) {
      if (id === ASTRO_RENDERERS) {
        let code: string[] = [];
        let renderers = compileOptions.astroConfig.renderers || [];
        let browserHash = '';
        if (fs.existsSync(viteOptimizerMetaLoc)) {
          const viteOptimizerMeta = JSON.parse(await fs.promises.readFile(viteOptimizerMetaLoc, 'utf8'));
          browserHash = `?v=${viteOptimizerMeta.browserHash}`;
        }

        await Promise.all(
          renderers.map(async (name, n) => {
            const { default: raw } = await import(name);
            code.push(`import __renderer_${n} from '${name}${raw.server.replace(/^\./, '')}';`); // note: even if import statements are written out-of-order, "n" will still be in array order
          })
        );
        code.push(`const renderers = [`);
        renderers.forEach((moduleName, n) => {
          let viteName = moduleName.replace('@astrojs/', '@astrojs_') + '_client.js';
          code.push(`  { source: '/node_modules/.vite/${viteName}${browserHash}', renderer: __renderer_${n}, polyfills: [], hydrationPolyfills: [] },`);
        });
        code.push(`];`);
        code.push(`export default renderers;`);
        return code.join('\n') + '\n';
      }
      if (id.startsWith(ASTRO_CSS)) {
        const cssID = id.replace(`${ASTRO_CSS}/`, '');
        const css = cssCache.get(cssID);
        if (css) return css.code;
      }
      return null;
    },
  };
}
