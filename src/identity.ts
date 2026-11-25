import { readFileSync } from 'node:fs';

const {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {version: string};
export const LIBRARY = 'Ambient Context';
export const LIBRARY_AGENT = `ambient-context/${version} (+https://github.com/YusukeIt0/ambient-context)`;

/** MET Norway requires each application to identify itself; the library never supplies a generic default. */
export function applicationAgent(userAgent: unknown): string {
  if (typeof userAgent !== 'string' || !/^[\x21-\x7e][\x20-\x7e]{2,199}$/.test(userAgent.trim()) || userAgent.trim() !== userAgent)
    throw new TypeError('MET Norway requires an identifying User-Agent: your application name and a contact, e.g. "MyApp/1.0 (+https://example.com)".');
  return `${userAgent} ${LIBRARY_AGENT}`;
}
