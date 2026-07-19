import { readFileSync } from 'fs';

/**
 * Docker/Swarm/K8s secrets convention: for any `FOO_FILE=/run/secrets/foo`,
 * load the file's contents into `process.env.FOO` (unless `FOO` is already set,
 * which always wins). Lets production run with secrets mounted as files instead
 * of plaintext in a `.env` on disk. Call ONCE, before config validation.
 *
 * A single trailing newline is stripped (files usually end with one); anything
 * else in the file is preserved verbatim.
 */
export function hydrateFileSecrets(
  logger: Pick<Console, 'warn'> = console,
): string[] {
  const loaded: string[] = [];
  for (const key of Object.keys(process.env)) {
    if (!key.endsWith('_FILE')) continue;
    const base = key.slice(0, -'_FILE'.length);
    if (!base) continue;
    const filePath = process.env[key];
    if (!filePath) continue;
    if (process.env[base]) continue; // explicit env var wins
    try {
      process.env[base] = readFileSync(filePath, 'utf8').replace(/\r?\n$/, '');
      loaded.push(base);
    } catch {
      logger.warn(
        `[secrets] ${key} is set but ${filePath} could not be read — ${base} left unset`,
      );
    }
  }
  return loaded;
}
