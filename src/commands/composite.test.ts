import { describe, expect, it } from 'vitest';
import { createCompositeCommand } from './composite';
import type { Command } from './types';

describe('createCompositeCommand', () => {
  it('does in order and undoes in reverse', async () => {
    const log: string[] = [];
    const part = (n: string): Command => ({
      label: n,
      do: () => void log.push(`do ${n}`),
      undo: () => void log.push(`undo ${n}`),
    });
    const command = createCompositeCommand('Both', [part('a'), part('b')]);
    expect(command.label).toBe('Both');
    await command.do();
    await command.undo();
    expect(log).toEqual(['do a', 'do b', 'undo b', 'undo a']);
  });
});
