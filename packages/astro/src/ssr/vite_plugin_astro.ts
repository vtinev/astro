import type { Plugin } from 'vite';
import type { CompileOptions } from '../@types/compiler';

import fs from 'fs';
import path from 'path';
import slash from 'slash';
import { fileURLToPath } from 'url';
import { compileComponent } from '../compiler/index.js';

/** Allow Vite to load .astro files */
export default function astro(compileOptions: CompileOptions): Plugin {
  const buildCache = new URL('./.astro-cache/', compileOptions.astroConfig.projectRoot);
  const buildCSSCache = new URL('./css/', buildCache);

  // start loading renderers on init
  let rendererInstancesPromise = Promise.all((compileOptions.astroConfig.renderers || []).map((name) => import(name).then((m) => m.default)));

  // css cache
  const cssCache = new Map<string, string>();

  return {
    name: '@astrojs/vite-plugin-astro',
    enforce: 'pre', // we want to load .astro files before anything else can!
    async load(id) {
      if (id.endsWith('__astro_component.js')) {
        let code = '';
        let rendererInstances = await rendererInstancesPromise;
        let contentsPromise = fs.promises.readFile(id, 'utf8');
        rendererInstances.forEach((renderer, n) => {
          code += `import __renderer_${n} from '${renderer.name}${renderer.server.replace(/^\./, '')}';`;
        });
        code += `\nconst rendererInstances = [`;
        rendererInstances.forEach((renderer, n) => {
          code += `\n  { source: '${renderer.name}${renderer.client.replace(/^\./, '')}', renderer: __renderer_${n}, polyfills: [], hydrationPolyfills: [] },`;
        });
        code += `\n];`;
        code += '\n';
        code += await contentsPromise;
        return code;
      }
      if (id.endsWith('.astro') || id.endsWith('.md')) {
        const src = await fs.promises.readFile(id, 'utf8');
        const result = await compileComponent(src, {
          compileOptions,
          filename: id,
          projectRoot: fileURLToPath(compileOptions.astroConfig.projectRoot),
        });
        let code = result.contents;

        // handle styles
        const cssID = `${slash(id).replace(compileOptions.astroConfig.projectRoot.pathname, '/')}.css`;
        const cssFilePath = new URL(`.${cssID}`, buildCSSCache);
        if (result.css && result.css.code) {
          // determine ID unique to component
          const relPath = path.posix.relative(slash(path.dirname(id)), fileURLToPath(buildCSSCache));

          // check cache; only write to disk on update (dev)
          if (cssCache.get(cssID) !== result.css.code) {
            // create file handler (fh)
            if (!fs.existsSync(path.dirname(fileURLToPath(cssFilePath)))) fs.mkdirSync(new URL('./', cssFilePath), { recursive: true });
            fs.writeFileSync(cssFilePath, result.css.code, 'utf8');
            if (result.css.map) fs.writeFileSync(cssFilePath + '.map', result.css.map.toString(), 'utf8');
            cssCache.set(cssID, result.css.code);
          }

          code = `import '${relPath}${cssID}';\n` + code;
        } else {
          // if there’s no css, clean up cache (if any)
          if (cssCache.has(cssID)) {
            if (fs.existsSync(cssFilePath) && fs.statSync(cssFilePath).isFile()) fs.rmSync(cssFilePath);
            cssCache.delete(cssID);
          }
        }
        return code;
      }
      return null;
    },
  };
}
