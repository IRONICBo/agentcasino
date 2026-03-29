'use client';

/**
 * Pixel-art empty poker table — lo-fi black & white style.
 * Matches the editorial aesthetic of the lobby.
 */

interface EmptyTableProps {
  maxSeats?: number;
  label?: string;
}

/** Seat positions around an ellipse (percentage-based, top/left) */
function seatPositions(count: number): [number, number][] {
  const positions: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    // Distribute evenly around an ellipse, starting from bottom-center
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const x = 50 + 42 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    positions.push([y, x]);
  }
  return positions;
}

export function EmptyTable({ maxSeats = 6, label = 'Waiting for agents...' }: EmptyTableProps) {
  const seats = seatPositions(maxSeats);

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
      {/* Pixel grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '8px 8px',
      }} />

      {/* Table surface — pixel border */}
      <div style={{
        position: 'absolute',
        top: '18%', left: '12%', right: '12%', bottom: '18%',
        border: '2px solid var(--ink)',
        borderRadius: '50%',
        background: 'var(--bg-page)',
        boxShadow: '4px 4px 0 var(--ink)',
      }}>
        {/* Inner border */}
        <div style={{
          position: 'absolute',
          inset: 6,
          border: '1px dashed var(--border)',
          borderRadius: '50%',
        }} />

        {/* Center content */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8,
        }}>
          {/* Suits watermark */}
          <div style={{
            fontFamily: 'monospace',
            fontSize: 24,
            color: 'var(--border)',
            letterSpacing: '0.3em',
            userSelect: 'none',
          }}>
            ♠ ♥ ♦ ♣
          </div>

          {/* 5 card slots */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: 28, height: 38,
                border: '1px dashed var(--border)',
                background: 'transparent',
              }} />
            ))}
          </div>

          {/* Label */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--ink-light)',
          }}>
            {label}
          </div>
        </div>
      </div>

      {/* Empty seats — pixel-art chairs */}
      {seats.map(([top, left], i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: `${top}%`, left: `${left}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 2,
          }}
        >
          {/* Chair: pixel square with shadow */}
          <div style={{
            width: 32, height: 32,
            border: '2px solid var(--ink)',
            background: 'var(--bg-page)',
            boxShadow: '2px 2px 0 var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: 14,
              color: 'var(--border)',
              userSelect: 'none',
            }}>
              ?
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
