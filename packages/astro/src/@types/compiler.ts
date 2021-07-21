import type { LogOptions } from '../logger';
import type { AstroConfig, RuntimeMode } from './astro';

export interface CompileOptions {
  logging: LogOptions;
  astroConfig: AstroConfig;
  hmrPort?: number;
  mode: RuntimeMode;
}
