/**
 * Structured logger.
 *
 * Every plugin receives a logger pre-bound to its id, so log lines carry the
 * plugin namespace without the plugin doing anything. The kernel's own lines use
 * the `kernel` namespace. This replaces the codebase's ad-hoc `console.error`
 * calls and the hardcoded audit matcher in `api/utils/logMiddleware.ts`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface LogFields {
  [key: string]: unknown;
}

export interface LogRecord {
  time: string;
  level: Exclude<LogLevel, 'silent'>;
  namespace: string;
  message: string;
  fields?: LogFields;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Derive a logger whose namespace is nested under this one. */
  child(suffix: string): Logger;
}

const defaultSink: LogSink = (record) => {
  const suffix = record.fields && Object.keys(record.fields).length > 0 ? ` ${JSON.stringify(record.fields)}` : '';
  const line = `${record.time} ${record.level.toUpperCase().padEnd(5)} [${record.namespace}] ${record.message}${suffix}`;
  if (record.level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
};

export interface CreateLoggerOptions {
  level?: LogLevel;
  sink?: LogSink;
}

export function createLogger(namespace: string, options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const sink = options.sink ?? defaultSink;
  const threshold = LEVEL_ORDER[level] ?? LEVEL_ORDER.info;

  const emit = (recordLevel: Exclude<LogLevel, 'silent'>, message: string, fields?: LogFields) => {
    if (LEVEL_ORDER[recordLevel] < threshold) return;
    sink({ time: new Date().toISOString(), level: recordLevel, namespace, message, fields });
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (suffix) => createLogger(`${namespace}:${suffix}`, { level, sink }),
  };
}

/** A logger that discards everything; useful in tests. */
export function createNullLogger(): Logger {
  return createLogger('null', { level: 'silent' });
}
