'use client';

import { useEffect, useRef, useState } from 'react';

interface DealerAvatarProps {
  phase: string;
  hasWinners: boolean;
}

type DealerMood = 'idle' | 'active' | 'excited' | 'sleepy';

function moodFromPhase(phase: string, hasWinners: boolean): DealerMood {
  if (hasWinners) return 'excited';
  if (phase === 'waiting') return 'sleepy';
  if (phase === 'preflop' || phase === 'flop') return 'active';
  if (phase === 'showdown') return 'excited';
  return 'idle';
}

// Fixed sparkle trajectories (avoids Math.random in CSS)
const SPARKLES = [
  { top: 15, left: 8,  dx: -22, dy: -38, dur: 0.7, delay: 0   },
  { top: 22, left: 75, dx:  18, dy: -42, dur: 0.8, delay: 80  },
  { top: 8,  left: 45, dx:  -8, dy: -50, dur: 0.65,delay: 160 },
  { top: 30, left: 20, dx: -30, dy: -30, dur: 0.9, delay: 40  },
  { top: 18, left: 60, dx:  25, dy: -35, dur: 0.75,delay: 120 },
  { top: 35, left: 85, dx:  14, dy: -44, dur: 0.6, delay: 200 },
  { top: 12, left: 30, dx: -15, dy: -55, dur: 0.85,delay: 60  },
  { top: 25, left: 50, dx:  30, dy: -28, dur: 0.7, delay: 140 },
  { top: 40, left: 10, dx: -20, dy: -40, dur: 0.9, delay: 20  },
  { top: 10, left: 90, dx:  10, dy: -48, dur: 0.65,delay: 180 },
  { top: 28, left: 38, dx: -28, dy: -32, dur: 0.8, delay: 100 },
  { top: 20, left: 68, dx:  22, dy: -52, dur: 0.75,delay: 240 },
];

const ZZZ_ITEMS = [
  { size: 28, right: 10,  top: 30, delay: 0    },
  { size: 38, right: -5,  top: 12, delay: 700  },
  { size: 50, right: 5,   top: -8, delay: 1400 },
];

export function DealerAvatar({ phase, hasWinners }: DealerAvatarProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [phaseKey, setPhaseKey] = useState(0);
  const prevPhaseRef = useRef(phase);
  const mood = moodFromPhase(phase, hasWinners);

  // Phase change → entrance burst
  useEffect(() => {
    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase;
      setPhaseKey(k => k + 1);
    }
  }, [phase]);

  // Mouse parallax — exaggerated
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      setTilt({ x: dy * -14, y: dx * 18 });
    };
    window.addEventListener('mousemove', handle, { passive: true });
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  const glowColor = {
    idle:    'rgba(212,175,55,0.35)',
    active:  'rgba(80,180,255,0.45)',
    excited: 'rgba(255,120,40,0.55)',
    sleepy:  'rgba(120,140,220,0.3)',
  }[mood];

  const moodAnim: Record<DealerMood, { name: string; dur: string; dir: string }> = {
    idle:    { name: 'dealer-float',     dur: '3.5s', dir: 'alternate' },
    active:  { name: 'dealer-active',    dur: '1.4s', dir: 'alternate' },
    excited: { name: 'dealer-excited',   dur: '0.35s', dir: 'alternate' },
    sleepy:  { name: 'dealer-sleepy',    dur: '5s',   dir: 'alternate' },
  };
  const ma = moodAnim[mood];

  return (
    <>
      {/* SVG filters */}
      <svg width={0} height={0} style={{ position: 'absolute', overflow: 'hidden' }}>
        <defs>
          {/* Hair/cloth ripple — much more aggressive */}
          <filter id="dealer-wave" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence type="turbulence" baseFrequency="0.02 0.06" numOctaves="3" seed="5" result="noise">
              <animate attributeName="baseFrequency" values="0.02 0.06;0.03 0.04;0.02 0.06" dur="2s" repeatCount="indefinite" />
              <animate attributeName="seed" values="5;8;5" dur="4s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G">
              <animate attributeName="scale" values="8;14;8" dur="2s" repeatCount="indefinite" />
            </feDisplacementMap>
          </filter>

          {/* Glow — color changes per mood */}
          <filter id="dealer-glow-idle"    x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="10" result="b"/>
            <feColorMatrix in="b" type="matrix" values="1.5 0.8 0 0 0  1.0 0.8 0 0 0  0 0.1 0.3 0 0  0 0 0 0.7 0" result="g"/>
            <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="dealer-glow-active"  x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="12" result="b"/>
            <feColorMatrix in="b" type="matrix" values="0.2 0.5 1.5 0 0  0.2 0.7 1.2 0 0  0.1 0.3 1.5 0 0  0 0 0 0.8 0" result="g"/>
            <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="dealer-glow-excited" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="16" result="b"/>
            <feColorMatrix in="b" type="matrix" values="2.0 0.5 0 0 0  0.6 0.4 0 0 0  0 0 0.3 0 0  0 0 0 0.9 0" result="g"/>
            <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="dealer-glow-sleepy"  x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="b"/>
            <feColorMatrix in="b" type="matrix" values="0.3 0.3 1.2 0 0  0.3 0.5 1.0 0 0  0.2 0.3 1.5 0 0  0 0 0 0.5 0" result="g"/>
            <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      </svg>

      <div style={{ position: 'relative', width: 260, perspective: 500, transformStyle: 'preserve-3d' }}>

        {/* Ground shadow */}
        <div style={{
          position: 'absolute',
          bottom: -10, left: '50%',
          transform: 'translateX(-50%)',
          width: 160, height: 20,
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)',
          animation: `dealer-shadow-${mood} ${ma.dur} ease-in-out infinite alternate`,
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Halo — big, color-matched */}
        <div style={{
          position: 'absolute',
          top: '10%', left: '50%',
          transform: 'translateX(-50%)',
          width: 220, height: 220,
          borderRadius: '50%',
          background: `radial-gradient(ellipse, ${glowColor} 0%, transparent 65%)`,
          animation: `dealer-halo 2.5s ease-in-out infinite alternate`,
          pointerEvents: 'none',
          zIndex: 0,
          transition: 'background 0.5s ease',
        }} />

        {/* Secondary halo ring (excited only) */}
        {mood === 'excited' && (
          <div style={{
            position: 'absolute',
            top: '5%', left: '50%',
            transform: 'translateX(-50%)',
            width: 270, height: 270,
            borderRadius: '50%',
            border: '2px solid rgba(255,140,40,0.3)',
            animation: 'dealer-ring-expand 0.8s ease-out infinite',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
        )}

        {/* Main image wrapper — 3D tilt + mood anim */}
        <div
          key={`tilt-${phaseKey}`}
          style={{
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transition: 'transform 0.12s ease-out',
            transformStyle: 'preserve-3d',
            animationName: ma.name,
            animationDuration: ma.dur,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: ma.dir as 'alternate',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Phase-change burst flash */}
          <div
            key={phaseKey}
            style={{
              position: 'absolute', inset: -20,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.25) 0%, transparent 70%)',
              animation: 'dealer-phase-flash 0.6s ease-out both',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />

          {/* Hair wave overlay — upper 40%, high opacity */}
          <img
            src="/dealer.png" alt="" aria-hidden
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%',
              opacity: mood === 'excited' ? 0.6 : 0.45,
              filter: 'url(#dealer-wave)',
              clipPath: 'inset(0 0 60% 0)',
              pointerEvents: 'none',
              transition: 'opacity 0.4s',
            }}
          />

          {/* Main image */}
          <img
            src="/dealer.png" alt="Dealer"
            style={{
              width: 260,
              display: 'block',
              filter: `url(#dealer-glow-${mood}) drop-shadow(0 12px 30px rgba(0,0,0,0.8))`,
              userSelect: 'none',
              transition: 'filter 0.4s ease',
            }}
          />
        </div>

        {/* Sparkles — excited state */}
        {mood === 'excited' && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
            {SPARKLES.map((s, i) => (
              <div key={i} style={{
                position: 'absolute',
                top: `${s.top}%`, left: `${s.left}%`,
                width: 8, height: 8,
                background: i % 3 === 0 ? '#f0c040' : i % 3 === 1 ? '#ff7030' : '#fff',
                borderRadius: '50%',
                animation: `dealer-sparkle-${i % 4} ${s.dur}s ease-out ${s.delay}ms infinite`,
                boxShadow: `0 0 8px 2px ${i % 3 === 0 ? '#f0c040' : i % 3 === 1 ? '#ff7030' : '#fff'}`,
              }} />
            ))}
          </div>
        )}

        {/* ZZZ — sleepy state, cascade */}
        {mood === 'sleepy' && ZZZ_ITEMS.map((z, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: `${z.top}%`,
            right: z.right,
            fontSize: z.size,
            color: 'rgba(160,180,255,0.85)',
            fontWeight: 900,
            fontFamily: 'serif',
            animation: `dealer-zzz 2.4s ease-in-out ${z.delay}ms infinite`,
            pointerEvents: 'none',
            zIndex: 4,
            textShadow: '0 0 8px rgba(120,150,255,0.6)',
          }}>Z</div>
        ))}

        {/* Active state — eye-like glow pulses */}
        {mood === 'active' && (
          <div style={{
            position: 'absolute',
            top: '18%', left: '50%',
            transform: 'translateX(-50%)',
            width: 80, height: 12,
            background: 'rgba(80,200,255,0.35)',
            borderRadius: '50%',
            filter: 'blur(6px)',
            animation: 'dealer-eye-glow 1.4s ease-in-out infinite alternate',
            pointerEvents: 'none',
            zIndex: 4,
          }} />
        )}
      </div>

      <style>{`
        @keyframes dealer-float {
          0%   { transform: translateY(0px) scaleX(1) scaleY(1) rotate(0deg); }
          100% { transform: translateY(-18px) scaleX(0.98) scaleY(1.02) rotate(1.5deg); }
        }
        @keyframes dealer-active {
          0%   { transform: translateY(0px) scaleY(1) scaleX(1) rotate(-1deg); }
          100% { transform: translateY(-12px) scaleY(1.04) scaleX(0.97) rotate(1.5deg); }
        }
        @keyframes dealer-excited {
          0%   { transform: translateY(0px)  rotate(-4deg) scale(1.0); }
          25%  { transform: translateY(-16px) rotate(4deg)  scale(1.06); }
          50%  { transform: translateY(-6px)  rotate(-3deg) scale(1.02); }
          75%  { transform: translateY(-20px) rotate(5deg)  scale(1.07); }
          100% { transform: translateY(-10px) rotate(-2deg) scale(1.04); }
        }
        @keyframes dealer-sleepy {
          0%   { transform: translateY(0px) rotate(0deg) scaleY(1); }
          20%  { transform: translateY(6px) rotate(-4deg) scaleY(0.97); }
          70%  { transform: translateY(10px) rotate(3deg) scaleY(0.95); }
          100% { transform: translateY(8px) rotate(-2deg) scaleY(0.96); }
        }
        @keyframes dealer-halo {
          0%   { transform: translateX(-50%) scale(0.85); opacity: 0.6; }
          100% { transform: translateX(-50%) scale(1.25); opacity: 1; }
        }
        @keyframes dealer-shadow-idle {
          0%   { transform: translateX(-50%) scaleX(1) scaleY(1); opacity: 0.5; }
          100% { transform: translateX(-50%) scaleX(0.8) scaleY(0.7); opacity: 0.25; }
        }
        @keyframes dealer-shadow-active {
          0%   { transform: translateX(-50%) scaleX(1) scaleY(1); opacity: 0.5; }
          100% { transform: translateX(-50%) scaleX(0.85) scaleY(0.75); opacity: 0.3; }
        }
        @keyframes dealer-shadow-excited {
          0%   { transform: translateX(-50%) scaleX(1.1) scaleY(1.1); opacity: 0.55; }
          100% { transform: translateX(-50%) scaleX(0.7) scaleY(0.6); opacity: 0.2; }
        }
        @keyframes dealer-shadow-sleepy {
          0%   { transform: translateX(-50%) scaleX(0.9) scaleY(0.9); opacity: 0.45; }
          100% { transform: translateX(-50%) scaleX(1.1) scaleY(1.1); opacity: 0.6; }
        }
        @keyframes dealer-ring-expand {
          0%   { transform: translateX(-50%) scale(0.8); opacity: 0.7; }
          100% { transform: translateX(-50%) scale(1.4); opacity: 0; }
        }
        @keyframes dealer-phase-flash {
          0%   { opacity: 1; transform: scale(0.8); }
          60%  { opacity: 0.6; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1.3); }
        }
        @keyframes dealer-sparkle-0 {
          0%   { opacity: 1; transform: translate(0,0) scale(1.2); }
          100% { opacity: 0; transform: translate(-22px,-38px) scale(0); }
        }
        @keyframes dealer-sparkle-1 {
          0%   { opacity: 1; transform: translate(0,0) scale(1.0); }
          100% { opacity: 0; transform: translate(18px,-42px) scale(0); }
        }
        @keyframes dealer-sparkle-2 {
          0%   { opacity: 1; transform: translate(0,0) scale(1.4); }
          100% { opacity: 0; transform: translate(-8px,-55px) scale(0); }
        }
        @keyframes dealer-sparkle-3 {
          0%   { opacity: 1; transform: translate(0,0) scale(0.9); }
          100% { opacity: 0; transform: translate(30px,-30px) scale(0); }
        }
        @keyframes dealer-zzz {
          0%   { opacity: 0; transform: translate(0, 0) scale(0.6) rotate(-5deg); }
          30%  { opacity: 1; }
          100% { opacity: 0; transform: translate(16px, -36px) scale(1.2) rotate(10deg); }
        }
        @keyframes dealer-eye-glow {
          0%   { opacity: 0.3; transform: translateX(-50%) scaleX(0.7); }
          100% { opacity: 0.9; transform: translateX(-50%) scaleX(1.3); }
        }
      `}</style>
    </>
  );
}
