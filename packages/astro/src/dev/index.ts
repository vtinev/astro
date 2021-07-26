import type { AstroConfig, DevOptions } from '../@types/astro';

import chokidar from 'chokidar';
import del from 'del';
import http from 'http';
import path from 'path';
import getPort from 'get-port';
import mime from 'mime';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import vite from 'vite';
import ssr from '../ssr/index.js';
import { error, info } from '../logger.js';
import { buildURLMap } from '../ssr/util.js';
import { loadViteConfig } from '../ssr/vite_config.js';
import { errorTemplate } from './error_page.js';
import * as msg from './messages.js';

interface DevServer {
  hostname: string;
  port: number;
  stop(): Promise<void>;
}

// config
const VITE_CACHE_DIR = './node_modules/.vite';
const VITE_CACHE_PATH = path.resolve(VITE_CACHE_DIR);

/** `astro dev` */
export default async function dev(config: AstroConfig, options: DevOptions): Promise<DevServer> {
  const port = config.devOptions.port;
  let origin = config.buildOptions.site ? new URL(config.buildOptions.site).origin : `http://localhost:${port}`;
  const hostname = config.devOptions.hostname || 'localhost';
  let vitePort = 11000;
  const { logging } = options;

  // create timer
  const devStart = performance.now();

  // clear old cache before starting server (will cause flickering/errors which is annoying for users)
  del.sync(VITE_CACHE_PATH);

  // generate urlMap
  let urlMap = buildURLMap(config.pages);

  // create Vite dev server
  const viteConfig = await loadViteConfig(
    {
      cacheDir: VITE_CACHE_DIR,
      mode: 'development',
      server: {
        hmr: {
          clientPort: port,
        },
        host: hostname,
        port: vitePort,
        strictPort: true,
      },
    },
    { astroConfig: config, logging }
  );
  const viteServer = await vite.createServer(viteConfig);

  // rebuild urlMap on local change
  const watcher = chokidar.watch(`${fileURLToPath(config.pages)}/**/*`);
  watcher.on('add', () => {
    urlMap = buildURLMap(config.pages);
  });
  watcher.on('unlink', () => {
    urlMap = buildURLMap(config.pages);
  });

  /** Primary router */
  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    let reqURL = req.url || '/'; // original request
    const reqStart = performance.now();

    if (reqURL === '/404') return notFoundPage();

    /** Proxy to Vite */
    function proxyToVite(viteURL: string) {
      const viteReq = http.request(
        {
          headers: req.headers,
          hostname,
          method: req.method,
          path: viteURL,
          port: vitePort,
        },
        (viteRes) => {
          const statusCode = viteRes.statusCode || 500;
          if (statusCode === 404) return notFoundPage();
          res.writeHead(statusCode, viteRes.headers);
          viteRes.pipe(res, { end: true });
        }
      );
      req.pipe(viteReq, { end: true });
    }

    /** Show 404 page */
    async function notFoundPage() {
      let html = '';
      const statusCode = 404;
      try {
        // attempt to load user-given page
        html = await ssr({ config, logging, mode: 'development', reqURL, origin, urlMap, viteServer });
      } catch (err) {
        // if not found, fall back to default template
        html = errorTemplate({ statusCode, title: 'Not found', tabTitle: '404: Not Found', message: reqURL });
      }
      info(logging, 'astro', msg.req({ url: reqURL, statusCode, reqTime: performance.now() - reqStart }));
      res.writeHead(statusCode, {
        'Content-Type': mime.getType('.html') as string,
        'Content-Length': Buffer.byteLength(html, 'utf8'),
      });
      res.write(html);
      res.end();
    }

    try {
      // static pages
      if (urlMap.staticPages.has(reqURL)) {
        const html = await ssr({ config, logging, mode: 'development', reqURL, origin, urlMap, viteServer });
        info(logging, 'astro', msg.req({ url: reqURL, statusCode: 200, reqTime: performance.now() - reqStart }));
        res.writeHead(200, {
          'Content-Type': mime.getType('.html') as string,
          'Content-Length': Buffer.byteLength(html, 'utf8'),
        });
        res.write(html);
        res.end();
        return;
      }

      // collections
      else {
        for (const [k] of urlMap.collections.entries()) {
          if (reqURL.startsWith(k)) {
            const html = await ssr({ config, logging, mode: 'development', reqURL, origin, urlMap, viteServer });
            info(logging, 'astro', msg.req({ url: reqURL, statusCode: 200, reqTime: performance.now() - reqStart }));
            res.writeHead(200, {
              'Content-Type': mime.getType('.html') as string,
              'Content-Length': Buffer.byteLength(html, 'utf8'),
            });
            res.write(html);
            res.end();
            break;
          }
        }
      }

      // assets, and everything else:
      return proxyToVite(reqURL);
    } catch (err) {
      viteServer.ssrFixStacktrace(err);
      console.error(err);
      const statusCode = 500;
      const html = errorTemplate({ statusCode, title: 'Internal Error', tabTitle: '500: Error', message: err.toString() });
      info(logging, 'astro', msg.req({ url: reqURL, statusCode: 500, reqTime: performance.now() - reqStart }));
      res.writeHead(statusCode, {
        'Content-Type': mime.getType('.html') as string,
        'Content-Length': Buffer.byteLength(html, 'utf8'),
      });
      res.write(html);
      res.end();
      return;
    }
  }

  const server = http.createServer(handleRequest);

  /** Shutdown */
  async function stop() {
    del.sync(VITE_CACHE_PATH);
    await viteServer.close();
  }
  process.on('SIGTERM', () => stop()); // attempt shutdown (as much as possible) on exit

  viteServer.listen(vitePort);
  server
    .listen(port, hostname, async () => {
      info(logging, 'astro', msg.devStart({ startupTime: performance.now() - devStart }));
      info(logging, 'astro', msg.devHost({ host: `http://${hostname}:${config.devOptions.port}` }));
    })
    .on('error', (err: NodeJS.ErrnoException) => {
      if (err.code && err.code === 'EADDRINUSE') {
        error(logging, 'dev server', `Address ${hostname}:${port} already in use. Try changing devOptions.port in your config file`);
      } else {
        error(logging, 'dev server', err.stack);
      }
      process.exit(1);
    });

  // finish
  return {
    hostname,
    port,
    stop,
  };
}
