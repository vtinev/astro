import type { AstroConfig } from './astro';
import type { LogOptions } from './logger';
import type { RuntimeMode } from './runtime';

export interface CompileOptions {
  logging: LogOptions;
  astroConfig: AstroConfig;
  hmrPort?: number;
  mode: RuntimeMode;
}
