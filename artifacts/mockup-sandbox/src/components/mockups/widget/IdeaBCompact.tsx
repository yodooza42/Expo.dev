import React from 'react';

const BG = '#121212';
const CARD = '#202020';
const TEXT = '#FFFFFF';
const MUTED = '#9E9E9E';
const PRIMARY = '#FFC107';
const GREEN = '#4CAF50';
const ORANGE = '#FF9800';

export function IdeaBCompact() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
      }}
    >
      {/* Widget container simulating 4×2 cell phone widget */}
      <div
        style={{
          width: 380,
          height: 200,
          background: BG,
          borderRadius: 16,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {/* ── Row 1: Info bar ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 6px',
          }}
        >
          {/* Day circle */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: '#2196F3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 'bold',
              color: '#FFF',
              flexShrink: 0,
            }}
          >
            9
          </div>

          {/* Work info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <span style={{ fontSize: 14 }}>💼</span>
            <span style={{ fontSize: 13, color: PRIMARY, fontWeight: 600 }}>
              17h00 – 01h00
            </span>
          </div>

          {/* Tasks count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14 }}>📋</span>
            <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>14</span>
          </div>

          {/* Next appt */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14 }}>📅</span>
            <span style={{ fontSize: 11, color: PRIMARY }}>Médecin</span>
          </div>
        </div>

        {/* ── Row 2: Nav buttons ── */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            flex: 1,
          }}
        >
          <NavButton emoji="🧭" label="Naviguer vers" wide />
          <NavButton emoji="▶" label="Départ" accent />
          <NavButton emoji="⛽" label="Essence" />
          <NavButton emoji="🔄" label="" small />
        </div>
      </div>
    </div>
  );
}

function NavButton({
  emoji,
  label,
  accent = false,
  small = false,
  wide = false,
}: {
  emoji: string;
  label: string;
  accent?: boolean;
  small?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      style={{
        flex: small ? 0.6 : wide ? 1.5 : 1,
        height: '100%',
        background: accent ? '#1A2A00' : CARD,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontSize: 22,
          color: accent ? GREEN : TEXT,
        }}
      >
        {emoji}
      </span>
      {label && (
        <span
          style={{
            fontSize: 10,
            color: accent ? GREEN : MUTED,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
