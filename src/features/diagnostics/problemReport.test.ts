import { describe, expect, it, vi } from 'vitest';
import type { Platform } from '@/platform/types';
import { buildProblemReport } from './problemReport';

function fakePlatform(): Platform {
  const select = vi.fn((sql: string) => {
    if (sql.includes('COUNT(*)')) return Promise.resolve([{ kind: 'image', status: 'ok', n: 7 }]);
    return Promise.resolve([{ id: 'item1', file_path: 'media/secret-name.jpg', thumb_v: 1 }]);
  });
  return {
    kind: 'browser',
    db: { select },
    media: { originalUrl: () => '' },
    cache: { url: () => '' },
    app: {
      problemReportInfo: () =>
        Promise.resolve({
          appVersion: '9.9.9',
          os: 'windows',
          arch: 'x86_64',
          webviewVersion: '120',
          libraryId: 'LIB1',
          storedLibraryId: 'LIB1',
          cacheFolderCount: 1,
          cacheFileCount: 3,
          models: [{ name: 'vision_model_quantized.onnx', present: true, bytes: 1024 }],
          logTail: 'last log line',
        }),
    },
  } as unknown as Platform;
}

describe('buildProblemReport', () => {
  it('contains the version, the counts and the log tail, and no item title', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const report = await buildProblemReport(fakePlatform());
    expect(report).toContain('Designspace 9.9.9');
    expect(report).toContain('image, ok: 7');
    expect(report).toContain('last log line');
    expect(report).not.toContain('secret-name');
    vi.unstubAllGlobals();
  });
});
