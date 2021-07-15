/**
 * A helper class for "Not Found" errors, storing data about what file lookups were attempted.
 */
export class NotFoundError extends Error {
  constructor(url: string, lookups?: string[]) {
    if (!lookups) {
      super(`Not Found (${url})`);
    } else {
      super(`Not Found (${url}):\n${lookups.map((loc) => '  ✘ ' + loc).join('\n')}`);
    }
  }
}
