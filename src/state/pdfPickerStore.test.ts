import { beforeEach, describe, expect, it } from 'vitest';
import { requestPdfPages, usePdfPickerStore } from './pdfPickerStore';

const req = (name: string) => ({ name, bytes: new ArrayBuffer(1), mode: 'import' as const });

beforeEach(() => usePdfPickerStore.setState({ current: null, queue: [], active: null }));

describe('pdfPickerStore', () => {
  it('asks two requests one after the other and answers each in order', async () => {
    const a = requestPdfPages(req('a.pdf'));
    const b = requestPdfPages(req('b.pdf'));
    expect(usePdfPickerStore.getState().current?.name).toBe('a.pdf');
    usePdfPickerStore.getState().answer({ kind: 'whole' });
    expect(await a).toEqual({ kind: 'whole' });
    expect(usePdfPickerStore.getState().current?.name).toBe('b.pdf');
    usePdfPickerStore.getState().answer({ kind: 'pages', pageIndices: [1], aspects: [0.7] });
    expect(await b).toEqual({ kind: 'pages', pageIndices: [1], aspects: [0.7] });
    expect(usePdfPickerStore.getState().current).toBeNull();
  });
  it('cancel resolves null', async () => {
    const a = requestPdfPages(req('a.pdf'));
    usePdfPickerStore.getState().answer(null);
    expect(await a).toBeNull();
  });
});
