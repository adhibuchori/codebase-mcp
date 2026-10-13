/** Which runtime is running: the only place that asks, so everything else stays runtime-agnostic. */
export function isBun(): boolean {
  return typeof Bun !== 'undefined';
}

/** "bun 1.3.12" or "node 22.23.2". */
export function runtimeLabel(): string {
  return isBun() ? `bun ${Bun.version}` : `node ${process.versions.node}`;
}
