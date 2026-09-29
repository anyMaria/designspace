import { create } from 'zustand';
import type { Command } from './types';
import { useToastStore } from '@/state/toastStore';
import { logger } from '@/lib/logger';

const MAX_HISTORY = 200;

interface HistoryState {
  past: Command[];
  future: Command[];
  execute: (command: Command) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** The undo/redo stack — §4.11. Keeps the last 200 steps; a failed command's `do()`/`undo()` is
 * expected to roll back its own optimistic store change and rethrow, so it never lands on the
 * stack and the owner sees an error toast instead of silently-wrong state. */
export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],

  execute: async (command) => {
    try {
      await command.do();
    } catch (err) {
      logger.error(`Command "${command.label}" failed`, err);
      useToastStore.getState().show(`Couldn't ${command.label.toLowerCase()}`);
      return;
    }
    set((s) => ({
      past: [...s.past, command].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  undo: async () => {
    const { past } = get();
    if (past.length === 0) return;
    const command = past[past.length - 1];
    try {
      await command.undo();
    } catch (err) {
      logger.error(`Undo of "${command.label}" failed`, err);
      useToastStore.getState().show(`Couldn't undo ${command.label.toLowerCase()}`);
      return;
    }
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [command, ...s.future],
    }));
  },

  redo: async () => {
    const { future } = get();
    if (future.length === 0) return;
    const command = future[0];
    try {
      await command.do();
    } catch (err) {
      logger.error(`Redo of "${command.label}" failed`, err);
      useToastStore.getState().show(`Couldn't redo ${command.label.toLowerCase()}`);
      return;
    }
    set((s) => ({
      past: [...s.past, command].slice(-MAX_HISTORY),
      future: s.future.slice(1),
    }));
  },
}));
