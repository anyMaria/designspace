import type { Command } from './types';

/** Several commands as one undo step (Patch 2 · E2): `do` runs them in order, `undo` in reverse. */
export function createCompositeCommand(label: string, commands: Command[]): Command {
  return {
    label,
    do: async () => {
      for (const c of commands) await c.do();
    },
    undo: async () => {
      for (const c of [...commands].reverse()) await c.undo();
    },
  };
}
