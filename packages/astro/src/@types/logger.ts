import type { Writable } from 'stream';

export type LoggerLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'; // same as Pino
export type LoggerEvent = 'debug' | 'info' | 'warn' | 'error';

export interface LogMessage {
  type: string | null;
  level: LoggerLevel;
  message: string;
  args: Array<any>;
}

export interface LogOptions {
  dest: LogWritable<LogMessage>;
  level: LoggerLevel;
}

export interface LogWritable<T> extends Writable {
  write: (chunk: T) => boolean;
}
