import type { Plugin } from 'vite';
import type { CompileOptions } from '../@types/compiler';

import { fileURLToPath } from 'url';
import { compileComponent } from '../compiler/index.js';

const ASTRO_RENDERERS = 'astro_internal:renderers'; // can be anything; just ensure no conflicts with other namespaces

/** Allow Vite to load .astro files */
export default function astro(compileOptions: CompileOptions): Plugin {
  return {
    name: '@astrojs/plugin-vite',
    async transform(src, id) {
      if (id.endsWith('.astro') || id.endsWith('.md')) {
        const result = await compileComponent(src, {
          compileOptions,
          filename: id,
          projectRoot: fileURLToPath(compileOptions.astroConfig.projectRoot),
        });
        return {
          code: result.contents,
          map: undefined, // TODO: add sourcemap
        };
      }
      if (id.endsWith('__astro_component.js')) {
        const code = `import rendererInstances from '${ASTRO_RENDERERS}';
        ${src}`;
        return {
          code,
          map: undefined,
        };
      }
    },
    resolveId(id) {
      if (id === ASTRO_RENDERERS) return id;
      return null;
    },
    async load(id) {
      if (id === ASTRO_RENDERERS) {
        let code: string[] = [];
        let renderers = compileOptions.astroConfig.renderers || [];
        await Promise.all(
          renderers.map(async (name, n) => {
            const { default: raw } = await import(name);
            code.push(`import __renderer_${n} from '${name}${raw.server.replace(/^\./, '')}';`); // note: even if import statements are written out-of-order, "n" will still be in array order
          })
        );
        code.push(`const renderers = [`);
        renderers.forEach((moduleName, n) => {
          let viteName = moduleName.replace('@astrojs/', '@astrojs_') + '_client.js';
          code.push(`  { source: '/node_modules/.vite/${viteName}', renderer: __renderer_${n}, polyfills: [], hydrationPolyfills: [] },`);
        });
        code.push(`];`);
        code.push(`export default renderers;`);
        return code.join('\n') + '\n';
      }
      return null;
    },
  };
}
