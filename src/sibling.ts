/** A module next to `base` with the caller's own extension: `.ts` from source, `.js` once compiled. */
export function sibling(name: string, base: string): URL {
  return new URL(`./${name}${new URL(base).pathname.endsWith('.ts') ? '.ts' : '.js'}`, base);
}
