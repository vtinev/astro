/* eslint-disable no-console */
import type { AstroConfig } from '../@types/astro';
import { defaultLogDestination, LogOptions } from '../logger.js';

import * as colors from 'kleur/colors';
import fs from 'fs';
import yargs from 'yargs-parser';
import { loadConfig } from '../config.js';
import build from '../build/index.js';
import devServer from '../dev/index.js';

type Arguments = yargs.Arguments;
type cliCommand = 'help' | 'version' | 'dev' | 'build';
interface CLIState {
  cmd: cliCommand;
  options: {
    projectRoot?: string;
    site?: string;
    sitemap?: boolean;
    hostname?: string;
    port?: number;
    config?: string;
  };
}

/** Determine which action the user requested */
function resolveArgs(flags: Arguments): CLIState {
  const options: CLIState['options'] = {
    projectRoot: typeof flags.projectRoot === 'string' ? flags.projectRoot : undefined,
    site: typeof flags.site === 'string' ? flags.site : undefined,
    sitemap: typeof flags.sitemap === 'boolean' ? flags.sitemap : undefined,
    port: typeof flags.port === 'number' ? flags.port : undefined,
    config: typeof flags.config === 'string' ? flags.config : undefined,
  };

  if (flags.version) {
    return { cmd: 'version', options };
  } else if (flags.help) {
    return { cmd: 'help', options };
  }

  const cmd = flags._[2];
  switch (cmd) {
    case 'dev':
      return { cmd: 'dev', options };
    case 'build':
      return { cmd: 'build', options };
    default:
      return { cmd: 'help', options };
  }
}

/** Display --help flag */
function printHelp() {
  console.error(`  ${colors.bold('astro')} - Futuristic web development tool.

  ${colors.bold('Commands:')}
  astro dev             Run Astro in development mode.
  astro build           Build a pre-compiled production version of your site.

  ${colors.bold('Flags:')}
  --config <path>       Specify the path to the Astro config file.
  --project-root <path> Specify the path to the project root folder.
  --no-sitemap          Disable sitemap generation (build only).
  --verbose             Enable verbose logging
  --silent              Disable logging
  --version             Show the version number and exit.
  --help                Show this help message.
`);
}

/** Display --version flag */
async function printVersion() {
  const pkg = JSON.parse(await fs.promises.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  console.error(pkg.version);
}

/** Merge CLI flags & config options (CLI flags take priority) */
function mergeCLIFlags(astroConfig: AstroConfig, flags: CLIState['options']) {
  if (typeof flags.sitemap === 'boolean') astroConfig.buildOptions.sitemap = flags.sitemap;
  if (typeof flags.site === 'string') astroConfig.buildOptions.site = flags.site;
  if (typeof flags.port === 'number') astroConfig.devOptions.port = flags.port;
  if (typeof flags.hostname === 'string') astroConfig.devOptions.hostname = flags.hostname;
}

/** The primary CLI action */
export async function cli(args: string[]) {
  const flags = yargs(args);
  const state = resolveArgs(flags);
  const options = { ...state.options };
  const projectRoot = options.projectRoot || flags._[3];

  // logLevel
  let logging: LogOptions = {
    dest: defaultLogDestination,
    level: 'info',
  };
  if (flags.verbsoe) logging.level = 'debug';
  if (flags.silent) logging.level = 'silent';

  switch (state.cmd) {
    case 'help': {
      printHelp();
      process.exit(1);
    }
    case 'version': {
      await printVersion();
      process.exit(0);
    }
    case 'dev': {
      try {
        const astroConfig = await loadConfig(projectRoot, options.config);
        mergeCLIFlags(astroConfig, options);
        await devServer(astroConfig, { logging });
        await new Promise(() => {});
      } catch (err) {
        console.error(colors.red(err.toString() || err));
        process.exit(1);
      }
      break;
    }
    case 'build': {
      try {
        const astroConfig = await loadConfig(projectRoot, options.config);
        mergeCLIFlags(astroConfig, options);
        return build(astroConfig, { logging });
      } catch (err) {
        console.error(colors.red(err.toString() || err));
        process.exit(1);
      }
    }
    default: {
      throw new Error(`Error running ${state.cmd}`);
    }
  }
}
