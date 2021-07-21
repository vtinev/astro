import type { AstroConfig, BuildOptions } from '../@types/astro';

type ReturnCode = number;

/** `astro build` */
export default async function build(config: AstroConfig, options: BuildOptions): Promise<ReturnCode> {
  return 0;
}
