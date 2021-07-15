import type { LogOptions } from './@types/logger';

import { defaultLogDestination, defaultLogLevel, info } from './logger.js';

const logging: LogOptions = {
  level: defaultLogLevel,
  dest: defaultLogDestination,
};

export async function reload() {
  try {
    info(logging, 'reload', `Clearing the cache...`);
    return 0;
  } catch {
    return 1;
  }
}
