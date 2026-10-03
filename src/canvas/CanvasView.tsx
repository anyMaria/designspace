import { useEffect, useRef, useState } from 'react';
import { Engine } from './Engine';
import { DotGrid } from './DotGrid';
import { generateBenchRects } from '@/platform/seed/bench';
import type { Tool, WheelMode } from './input';

export interface CanvasViewProps {
  tool: Tool;
  wheelMode: WheelMode;
  /** `?bench=N` from the URL — spike S1 (§4.13). Renders N flat rects instead of real items. */
  benchCount?: number | null;
  onEngineReady?: (engine: Engine) => void;
}

/** Mounts the canvas engine once and never re-renders it from React — §4.6. */
export function CanvasView({ tool, wheelMode, benchCount, onEngineReady }: CanvasViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const toolRef = useRef(tool);
  const wheelModeRef = useRef(wheelMode);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    wheelModeRef.current = wheelMode;
  }, [wheelMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const eng = new Engine();
    engineRef.current = eng;
    let cancelled = false;

    void eng
      .mount(container, {
        getTool: () => toolRef.current,
        getWheelMode: () => wheelModeRef.current,
      })
      .then(() => {
        if (cancelled) return;
        setEngine(eng);
        onEngineReady?.(eng);
      });

    return () => {
      cancelled = true;
      eng.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; tool/wheelMode read via refs
  }, []);

  useEffect(() => {
    if (!engine) return;
    if (benchCount && benchCount > 0) {
      engine.setBenchRects(generateBenchRects(benchCount));
    } else {
      engine.clearScene();
    }
  }, [engine, benchCount]);

  return (
    // `zIndex: 0` gives this its own stacking context, so the Pixi canvas's z-index (set above
    // the DotGrid inside Engine.mount) stays scoped here instead of competing with the Shell's
    // UI overlays, which sit in a later sibling and must always hit-test above the canvas.
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', touchAction: 'none' }}
    >
      {engine && <DotGrid engine={engine} />}
    </div>
  );
}
