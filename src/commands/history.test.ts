import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoryStore } from './history';
import { useToastStore } from '@/state/toastStore';
import type { Command } from './types';

function makeCommand(label: string, log: string[]): Command {
  return {
    label,
    do: () => {
      log.push(`do:${label}`);
    },
    undo: () => {
      log.push(`undo:${label}`);
    },
  };
}

beforeEach(() => {
  useHistoryStore.setState({ past: [], future: [] });
  useToastStore.setState({ toasts: [] });
});

describe('history store', () => {
  it('runs do() and pushes onto past', async () => {
    const log: string[] = [];
    await useHistoryStore.getState().execute(makeCommand('Add', log));
    expect(log).toEqual(['do:Add']);
    expect(useHistoryStore.getState().past).toHaveLength(1);
  });

  it('undo runs undo() and moves the command to future', async () => {
    const log: string[] = [];
    await useHistoryStore.getState().execute(makeCommand('Move', log));
    await useHistoryStore.getState().undo();
    expect(log).toEqual(['do:Move', 'undo:Move']);
    expect(useHistoryStore.getState().past).toHaveLength(0);
    expect(useHistoryStore.getState().future).toHaveLength(1);
  });

  it('redo runs do() again and moves the command back to past', async () => {
    const log: string[] = [];
    await useHistoryStore.getState().execute(makeCommand('Resize', log));
    await useHistoryStore.getState().undo();
    await useHistoryStore.getState().redo();
    expect(log).toEqual(['do:Resize', 'undo:Resize', 'do:Resize']);
    expect(useHistoryStore.getState().past).toHaveLength(1);
    expect(useHistoryStore.getState().future).toHaveLength(0);
  });

  it('executing a new command after undo clears future (no redo of stale commands)', async () => {
    const log: string[] = [];
    await useHistoryStore.getState().execute(makeCommand('A', log));
    await useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().future).toHaveLength(1);
    await useHistoryStore.getState().execute(makeCommand('B', log));
    expect(useHistoryStore.getState().future).toHaveLength(0);
  });

  it('undo/redo on an empty stack is a no-op', async () => {
    await expect(useHistoryStore.getState().undo()).resolves.toBeUndefined();
    await expect(useHistoryStore.getState().redo()).resolves.toBeUndefined();
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it('caps history at 200 steps', async () => {
    for (let i = 0; i < 205; i++) {
      await useHistoryStore.getState().execute(makeCommand(`cmd-${i}`, []));
    }
    expect(useHistoryStore.getState().past).toHaveLength(200);
    expect(useHistoryStore.getState().past[0].label).toBe('cmd-5');
  });

  it('a failing do() is not pushed onto history and shows a toast', async () => {
    const command: Command = {
      label: 'Broken',
      do: () => {
        throw new Error('db write failed');
      },
      undo: vi.fn(),
    };
    await useHistoryStore.getState().execute(command);
    expect(useHistoryStore.getState().past).toHaveLength(0);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('a failing undo() leaves the command on past and shows a toast', async () => {
    const log: string[] = [];
    const command: Command = {
      label: 'Half-broken',
      do: () => {
        log.push('do');
      },
      undo: () => {
        throw new Error('rollback failed');
      },
    };
    await useHistoryStore.getState().execute(command);
    await useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().past).toHaveLength(1);
    expect(useHistoryStore.getState().future).toHaveLength(0);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('do/undo run over a random sequence and always return to the exact prior state', async () => {
    let counter = 0;
    const values: number[] = [counter];
    function makeCounterCommand(delta: number): Command {
      return {
        label: `+${delta}`,
        do: () => {
          counter += delta;
          values.push(counter);
        },
        undo: () => {
          counter -= delta;
          values.pop();
        },
      };
    }

    const deltas = [1, -2, 5, 3, -1, 7, -4, 2];
    for (const d of deltas) {
      await useHistoryStore.getState().execute(makeCounterCommand(d));
    }
    const expectedFinal = deltas.reduce((a, b) => a + b, 0);
    expect(counter).toBe(expectedFinal);

    for (let i = 0; i < deltas.length; i++) {
      await useHistoryStore.getState().undo();
    }
    expect(counter).toBe(0);

    for (let i = 0; i < deltas.length; i++) {
      await useHistoryStore.getState().redo();
    }
    expect(counter).toBe(expectedFinal);
  });
});
