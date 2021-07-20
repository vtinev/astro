import type { AstroConfig } from './@types/astro';
import type { LogOptions } from './@types/logger';

import fs from 'fs';
import { green } from 'kleur/colors';
import http from 'http';
import getPort from 'get-port';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import vite from 'vite';
import { defaultLogDestination, defaultLogLevel, debug, error, info, parseError } from './logger.js';
import { createRuntime } from './runtime/index.js';
import { stopTimer } from './build/util.js';

const hostname = '127.0.0.1';

const logging: LogOptions = {
  level: defaultLogLevel,
  dest: defaultLogDestination,
};

/** The primary dev action */
export default async function dev(astroConfig: AstroConfig) {
  const startServerTime = performance.now();
  const { projectRoot } = astroConfig;
  const timer: Record<string, number> = {};

  timer.runtime = performance.now();
  const runtime = await createRuntime(astroConfig, { mode: 'development', logging });
  debug(logging, 'dev', `runtime created [${stopTimer(timer.runtime)}]`);

  const VITE_CLIENT_PORT = await getPort({ port: getPort.makeRange(11000, 12000) });

  const viteClient = await vite.createServer({
    cacheDir: 'node_modules/.vite-client',
    logLevel: 'error',
    mode: 'development',
    optimizeDeps: {
      entries: ['**/*'],
      include: [
        '@astrojs/renderer-react/client',
        '@astrojs/renderer-preact/client',
        '@astrojs/renderer-vue/client',
        '@astrojs/renderer-svelte/client',
        'react',
        'react-dom',
        'vue',
        'svelte',
      ],
    },
    root: fileURLToPath(astroConfig.projectRoot),
    server: {
      force: true,
      host: hostname,
      port: VITE_CLIENT_PORT,
      strictPort: true,
    },
  });
  viteClient.listen();

  const server = http.createServer(async (req, res) => {
    timer.load = performance.now();

    /** pipe request through to Vite */
    function proxyVite(viteURL: string) {
      const viteReq = http.request(
        {
          headers: req.headers,
          hostname,
          method: req.method,
          path: viteURL,
          port: VITE_CLIENT_PORT,
        },
        (viteRes) => {
          res.writeHead(viteRes.statusCode || 500, viteRes.headers);
          viteRes.pipe(res, { end: true });
        }
      );
      req.pipe(viteReq, { end: true });
      return;
    }

    let { url = '/' } = req;

    // Source file
    if (url.startsWith('/_astro/')) {
      url = url.replace(/^\/_astro\//, '/');
      const possibleURLs = new Set([url]);
      if (url.endsWith('.js')) {
        possibleURLs.add(url.replace(/\.js$/, '.jsx'));
        possibleURLs.add(url.replace(/\.js$/, '.ts'));
        possibleURLs.add(url.replace(/\.js$/, '.tsx'));
        possibleURLs.add(url.replace(/\.js$/, '.svelte'));
        possibleURLs.add(url.replace(/\.js$/, '.vue'));
      }
      for (const possibleURL of possibleURLs) {
        if (fs.existsSync(new URL(`.${possibleURL}`, astroConfig.projectRoot))) return proxyVite(possibleURL);
      }
    }

    // npm package
    if (url.startsWith('/node_modules/')) {
      return proxyVite(url);
    }

    const result = await runtime.load(url);
    debug(logging, 'dev', `loaded ${url} [${stopTimer(timer.load)}]`);

    switch (result.statusCode) {
      case 200: {
        let { contents } = result;
        if (result.contentType) {
          res.setHeader('Content-Type', result.contentType);
        }

        if (result.contentType && result.contentType.includes('text/html')) {
          contents = (contents as string).replace(/<\/body><\/html>$/, `<script type="module" src="http://localhost:${VITE_CLIENT_PORT}/@vite/client"></script></body></html>`);
        }

        res.statusCode = 200;
        res.write(contents);
        res.end();
        break;
      }
      case 301:
      case 302: {
        res.statusCode = result.statusCode;
        res.setHeader('Location', result.location);
        res.end();
        break;
      }
      case 404: {
        const fullurl = new URL(req.url || '/', astroConfig.buildOptions.site || `http://localhost${astroConfig.devOptions.port}`);
        const reqPath = decodeURI(fullurl.pathname);
        error(logging, 'static', 'Not found', reqPath);
        res.statusCode = 404;

        const fourOhFourResult = await runtime.load('/404');
        if (fourOhFourResult.statusCode === 200) {
          if (fourOhFourResult.contentType) {
            res.setHeader('Content-Type', fourOhFourResult.contentType);
          }
          res.write(fourOhFourResult.contents);
        } else {
          res.setHeader('Content-Type', 'text/plain');
          res.write('Not Found');
        }
        res.end();
        break;
      }
      case 500: {
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        switch (result.type) {
          case 'parse-error': {
            const err = result.error;
            if (err.filename) err.filename = path.posix.relative(projectRoot.pathname, err.filename);
            parseError(logging, err);
            break;
          }
          default: {
            error(logging, 'executing astro', result.error);
            break;
          }
        }
        res.statusCode = 500;

        let errorResult = await runtime.load(`/500?error=${encodeURIComponent(result.error.stack || result.error.toString())}`);
        if (errorResult.statusCode === 200) {
          if (errorResult.contentType) {
            res.setHeader('Content-Type', errorResult.contentType);
          }
          res.write(errorResult.contents);
        } else {
          res.write(result.error.toString());
        }
        res.end();
        break;
      }
    }
  });

  const port = astroConfig.devOptions.port;
  server
    .listen(port, hostname, () => {
      const endServerTime = performance.now();
      info(logging, 'dev server', green(`Server started in ${Math.floor(endServerTime - startServerTime)}ms.`));
      info(logging, 'dev server', `${green('Local:')} http://${hostname}:${port}/`);
    })
    .on('error', (err: NodeJS.ErrnoException) => {
      if (err.code && err.code === 'EADDRINUSE') {
        error(logging, 'dev server', `Address ${hostname}:${port} already in use. Try changing devOptions.port in your config file`);
      } else {
        error(logging, 'dev server', err.stack);
      }
      process.exit(1);
    });
}
