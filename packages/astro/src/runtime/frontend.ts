import type { LoadResult, LoadResultNotFound } from '../@types/runtime';

import fs from 'fs';
import mime from 'mime';
import path from 'path';

export const ASTRO_FRONTEND = '/_astro_frontend/'; // prefix that marks loading an internal file (must be browser-safe)
const INTERNAL = new URL(`../frontend/`, import.meta.url);

/** Load an internal file */
export async function loadFrontendFile(url: string): Promise<LoadResult> {
  const NOT_FOUND: LoadResultNotFound = {
    statusCode: 404,
    error: new Error(`Not found: ${url}`),
  };

  let filePath = new URL(url.replace(new RegExp(`^${ASTRO_FRONTEND}`), ''), INTERNAL);

  // 404
  if (!url.startsWith(ASTRO_FRONTEND)) return NOT_FOUND;
  if (!fs.existsSync(filePath)) return NOT_FOUND;

  // 200
  return {
    statusCode: 200,
    contents: await fs.promises.readFile(filePath),
    contentType: mime.getType(path.basename(url)) || false,
  };
}
