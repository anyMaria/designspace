import { useEffect, useRef, type PointerEvent } from 'react';
import { paintWheel, wheelHueSat, wheelPoint } from './colorWheelMath';

const SIZE = 120;
const KNOB_RADIUS = 6;

/** An exact HSV colour disc: angle is hue, distance from the centre is saturation, at the given
 * value. Dragging reports live (`onChange`) and then once on release (`onCommit`). */
export function ColorWheel({
  h,
  s,
  v,
  onChange,
  onCommit,
}: {
  h: number;
  s: number;
  v: number;
  onChange: (h: number, s: number) => void;
  onCommit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paintWheel(ctx, SIZE, v);
  }, [v]);

  function report(e: PointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const { h: nh, s: ns } = wheelHueSat(e.clientX - rect.left, e.clientY - rect.top, SIZE);
    onChange(nh, ns);
  }

  const knob = wheelPoint(h, s, SIZE);
  return (
    <div
      role="slider"
      aria-label="Hue and saturation"
      aria-valuetext={`Hue ${Math.round(h)}°, saturation ${Math.round(s * 100)}%`}
      aria-valuenow={Math.round(h)}
      tabIndex={0}
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        touchAction: 'none',
        cursor: 'crosshair',
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        report(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) report(e);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit();
      }}
    >
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: knob.x - KNOB_RADIUS,
          top: knob.y - KNOB_RADIUS,
          width: KNOB_RADIUS * 2,
          height: KNOB_RADIUS * 2,
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
