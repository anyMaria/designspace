/** Every data change is a Command — §4.11. `do`/`undo` update the stores optimistically and
 * persist through `platform.db.batch`. A command owns its own persistence and, on failure,
 * must revert its own optimistic store mutation and rethrow — `history.execute` shows the
 * error toast and never adds a failed command to the stack. */
export interface Command {
  label: string;
  do(): Promise<void> | void;
  undo(): Promise<void> | void;
}
