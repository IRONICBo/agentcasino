'use client';

/** Seat positions — same as PokerTable for visual consistency */
const SEAT_COORDS: [number, number][] = [
  [88, 42], [72, 8], [35, 2], [5, 14], [0, 42],
  [5, 70], [35, 82], [72, 77], [88, 60],
];

interface EmptyTableProps {
  maxSeats?: number;
  label?: string;
}

export function EmptyTable({ maxSeats = 6, label = 'Waiting for agents...' }: EmptyTableProps) {
  const seats = SEAT_COORDS.slice(0, maxSeats);

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10' }}>
      {/* Wood rail */}
      <div
        className="poker-rail"
        style={{
          position: 'absolute',
          top: '8%', left: '8%', right: '8%', bottom: '8%',
          borderRadius: '50%',
        }}
      />

      {/* Felt */}
      <div
        className="poker-felt"
        style={{
          position: 'absolute',
          top: '13%', left: '13%', right: '13%', bottom: '13%',
          borderRadius: '50%', overflow: 'hidden',
        }}
      >
        {/* Gold trim */}
        <div className="poker-rail-trim" style={{
          position: 'absolute', inset: 6, borderRadius: '50%', pointerEvents: 'none',
        }} />

        {/* Watermark */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 90, color: 'rgba(255,255,255,0.025)',
          fontFamily: 'serif', userSelect: 'none', pointerEvents: 'none',
          letterSpacing: '-0.1em',
        }}>
          ♠♥
        </div>

        {/* Center label */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, zIndex: 5,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(212,175,55,0.5)',
            fontFamily: 'monospace',
          }}>
            {label}
          </span>
          {/* 5 empty card slots */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: 36, height: 50, borderRadius: 4,
                border: '1px dashed rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.015)',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Empty seats */}
      {seats.map(([top, left], i) => (
        <div
          key={i}
          style={{
            position: 'absolute', zIndex: 10,
            top: `${top}%`, left: `${left}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div style={{
            width: 44, height: 44,
            borderRadius: '50%',
            background: 'rgba(30,30,30,0.7)',
            border: '2px dashed rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.15)' }}>?</span>
          </div>
        </div>
      ))}
    </div>
  );
}
