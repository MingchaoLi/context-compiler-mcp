interface WarningFilterLeaseState {
  readonly original: typeof process.emitWarning;
  readonly filtered: typeof process.emitWarning;
  readonly activeTokens: Set<symbol>;
}

let warningFilterLeaseState: WarningFilterLeaseState | undefined;

/**
 * Suppress only Node's exact node:sqlite platform warning while preserving
 * every unrelated warning and cooperating with overlapping in-process users.
 */
export function acquireSqliteExperimentalWarningFilter(): () => void {
  let state = warningFilterLeaseState;
  if (state === undefined) {
    const original = process.emitWarning;
    const activeTokens = new Set<symbol>();
    const created = {} as WarningFilterLeaseState;
    const filtered = (function (
      warning: string | Error,
      ...arguments_: unknown[]
    ): void {
      const message = typeof warning === "string" ? warning : warning.message;
      const options = arguments_[0];
      const type = warning instanceof Error
        ? warning.name
        : typeof options === "string"
          ? options
          : typeof options === "object" && options !== null && "type" in options
            ? (options as { type?: unknown }).type
            : undefined;
      if (
        message === "SQLite is an experimental feature and might change at any time" &&
        type === "ExperimentalWarning"
      ) return;
      Reflect.apply(created.original, process, [warning, ...arguments_]);
    }) as typeof process.emitWarning;
    Object.assign(created, {
      original,
      filtered,
      activeTokens,
    });
    state = created;
    warningFilterLeaseState = state;
    process.emitWarning = state.filtered;
  }

  const token = Symbol("sqlite-warning-filter-lease");
  state.activeTokens.add(token);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.activeTokens.delete(token);
    if (state.activeTokens.size !== 0) return;
    if (process.emitWarning === state.filtered) {
      process.emitWarning = state.original;
    }
    if (warningFilterLeaseState === state) warningFilterLeaseState = undefined;
  };
}
