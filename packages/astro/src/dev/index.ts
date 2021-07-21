import type { AstroConfig, DevOptions } from '../@types/astro';

import fs from 'fs';
import http from 'http';
import getPort from 'get-port';
import mime from 'mime';
import { fileURLToPath } from 'url';
import vite from 'vite';
import { ASTRO_RUNTIME_DEPS, CJS_MODULES, ES_MODULES } from '../ssr/modules.js';
import ssr from '../ssr/index.js';
import { buildURLMap } from '../ssr/util.js';
import astroPlugin from '../ssr/vite_astro.js';

interface DevServer {
  hostname: string;
  port: number;
  stop(): Promise<void>;
}

/** `astro dev` */
export default async function dev(config: AstroConfig, options: DevOptions): Promise<DevServer> {
  const port = config.devOptions.port;
  let origin = config.buildOptions.site ? new URL(config.buildOptions.site).origin : `http://localhost:${port}`;
  const hostname = config.devOptions.hostname || 'localhost';
  const VITE_CLIENT_PORT = await getPort({ port: getPort.makeRange(11000, 12000) });

  const viteConfig: vite.InlineConfig & { ssr?: { external?: string[]; noExternal?: string[] } } = {
    mode: 'development',
    logLevel: 'error',
    optimizeDeps: {
      entries: ['**/*'],
      include: [...ASTRO_RUNTIME_DEPS],
    },
    plugins: [
      astroPlugin({
        astroConfig: config,
        logging: options.logging,
        mode: 'development',
      }),
    ],
    publicDir: fileURLToPath(config.public),
    root: fileURLToPath(config.projectRoot),
    server: {
      force: true,
      host: hostname,
      port: VITE_CLIENT_PORT,
      strictPort: true,
    },
    ssr: {
      external: [...CJS_MODULES],
      noExternal: [...ES_MODULES],
    },
  };
  const viteServer = await vite.createServer(viteConfig);

  let urlMap = await buildURLMap(config.pages);

  /** Primary router */
  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      let reqURL = req.url || '/'; // original request

      /** Proxy to Vite */
      function proxyToVite(viteURL: string) {
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
      }

      /** Proxy to fs */
      function proxyToFS(fsURL: string, rootDir: URL) {
        const filePath = new URL(fsURL, rootDir);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.write(`Not found: ${reqURL}`);
          res.end();
          return;
        }
        const readStream = fs.createReadStream(filePath);
        readStream.on('open', () => {
          res.writeHead(200, { 'Content-Type': mime.getType(fsURL) || 'text/plain' });
          readStream.pipe(res, { end: true });
        });
        readStream.on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(err);
        });
      }

      // static pages
      if (urlMap.staticPages.has(reqURL)) {
        const html = await ssr({ logging: options.logging, reqURL, origin, urlMap, viteServer });
        res.writeHead(200, {
          'Content-Type': mime.getType('.html') as string,
        });
        res.write(html);
        res.end();
        return;
      }

      // collections
      else {
        for (const [k] of urlMap.collections.entries()) {
          if (reqURL.startsWith(k)) {
            const html = await ssr({ logging: options.logging, reqURL, origin, urlMap, viteServer });
            res.writeHead(200, {
              'Content-Type': mime.getType('.html') as string,
            });
            res.write(html);
            res.end();
            break;
          }
        }
      }

      // /_astro
      if (reqURL.startsWith('/_astro/')) {
        return proxyToVite(reqURL.replace(/^\/_astro\//, '/'));
      }

      // /_astro_frontend
      if (reqURL.startsWith('/_astro_frontend/')) {
        const rootDir = new URL('../frontend/', import.meta.url);
        return proxyToFS(reqURL.replace(/^\/_astro_frontend\//, ''), rootDir);
      }

      // assets, and everything else:
      return proxyToVite(reqURL);
    } catch (err) {
      viteServer.ssrFixStacktrace(err);
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.write(err.message);
      res.end();
      return;
    }
  }

  const server = http.createServer(handleRequest);

  // start server
  viteServer.listen(VITE_CLIENT_PORT);
  server.listen(port, hostname);
  console.log(`Server started at http://localhost:${config.devOptions.port}`);

  return {
    hostname,
    port,
    async stop() {
      await viteServer.close();
    },
  };
}
