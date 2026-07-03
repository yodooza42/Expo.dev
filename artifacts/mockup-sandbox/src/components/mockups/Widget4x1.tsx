/* Widget 4×1 — NavigationWidget redesign mockup
   Variant A : emoji + label (9px)
   Variant B : emoji only (extra compact)
*/

const BG      = '#1A1A1A';
const SURFACE = '#202020';
const PRIMARY = '#FFC107';
const TEXT    = '#FFFFFF';
const MUTED   = '#9E9E9E';
const BORDER  = '#2A2A2A';

// Realistic 4×1 dimensions at 2× (screen is ~360dp wide, 4-col widget ≈ 320dp × 74dp)
const W = 640;   // 320dp × 2
const H = 148;   // 74dp  × 2

interface SlotData {
  emoji: string;
  label: string;
  active: boolean;
}

const SLOTS: SlotData[] = [
  { emoji: '🦬', label: 'Doblo', active: true },
  { emoji: '🏠', label: 'Maison', active: true },
  { emoji: '📅', label: 'RDV', active: false },
  { emoji: '⛽', label: 'Carbu', active: true },
];

function WidgetShell({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          color: MUTED,
          fontSize: 11,
          fontFamily: 'system-ui',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      {/* Widget frame */}
      <div
        style={{
          width: W,
          height: H,
          background: BG,
          borderRadius: 24,
          border: `1px solid ${BORDER}`,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          padding: 14,
          gap: 10,
          boxShadow: '0 4px 24px #0006',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Btn({
  slot,
  showLabel,
}: {
  slot: SlotData;
  showLabel: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: SURFACE,
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        cursor: 'pointer',
        border: `1px solid ${BORDER}`,
      }}
    >
      <span style={{ fontSize: showLabel ? 30 : 36, lineHeight: 1 }}>{slot.emoji}</span>
      {showLabel && (
        <span
          style={{
            fontSize: 18,
            color: slot.active ? TEXT : MUTED,
            fontFamily: 'system-ui',
            fontWeight: 500,
            lineHeight: 1,
            maxWidth: '90%',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {slot.label}
        </span>
      )}
    </div>
  );
}

export default function Widget4x1() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0D0D0D',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        padding: 40,
      }}
    >
      {/* Title */}
      <div
        style={{
          color: PRIMARY,
          fontFamily: 'system-ui',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: 1,
        }}
      >
        WIDGET 4×1 — NavigationWidget
      </div>

      {/* Variant A: with labels */}
      <WidgetShell label="Variante A — emoji + label">
        {SLOTS.map(s => (
          <Btn key={s.label} slot={s} showLabel />
        ))}
      </WidgetShell>

      {/* Variant B: emoji only */}
      <WidgetShell label="Variante B — emoji seul">
        {SLOTS.map(s => (
          <Btn key={s.label} slot={s} showLabel={false} />
        ))}
      </WidgetShell>

      {/* Dimension note */}
      <div
        style={{
          color: '#555',
          fontFamily: 'monospace',
          fontSize: 12,
          textAlign: 'center',
          lineHeight: 1.8,
        }}
      >
        Dimensions réelles : 320dp × 74dp (4 cells × 1 cell Android)
        <br />
        3 raccourcis Waze + bouton Carburant
      </div>
    </div>
  );
}
