export function WidgetApercu() {
  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <p className="text-[#9E9E9E] text-sm uppercase tracking-widest">Aperçu widget 4×1</p>

        {/* Widget */}
        <div
          style={{
            background: '#121212',
            borderRadius: 14,
            padding: '6px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            width: 680,
            border: '1px solid #2a2a3a',
          }}
        >
          {/* Row 1: infos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
            {/* Cercle jour (orange) — taille réduite */}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                background: '#FF9800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>10</span>
            </div>

            {/* Travail */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 12 }}>💼</span>
              <span style={{ color: '#9E9E9E', fontSize: 12, fontWeight: 700 }}>Repos</span>
            </div>

            {/* Tasks */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginRight: 6 }}>
              <span style={{ fontSize: 11 }}>📋</span>
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>13</span>
            </div>

            {/* Appt */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 11 }}>📅</span>
              <span style={{ color: '#FFC107', fontSize: 11 }}>Médecin Anna</span>
            </div>
          </div>

          {/* Row 2: boutons */}
          <div style={{ display: 'flex', gap: 5, height: 36 }}>
            {/* Naviguer vers */}
            <Btn label="↗" title="Naviguer vers" flex={1.4} />
            {/* Maison */}
            <Btn label="🏠" title="Maison" flex={1} accent />
            {/* Play */}
            <Btn label="▶" title="Play" flex={1} />
            {/* Essence */}
            <Btn label="⛽" title="Essence" flex={1} />
            {/* Refresh */}
            <Btn label="↺" title="Refresh" flex={1} />
          </div>
        </div>

        {/* Légende boutons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { icon: '↗', label: 'Naviguer vers' },
            { icon: '🏠', label: 'Maison' },
            { icon: '▶', label: 'Play/Pause' },
            { icon: '⛽', label: 'Essence' },
            { icon: '↺', label: 'Refresh' },
          ].map(({ icon, label }) => (
            <div
              key={label}
              style={{
                background: '#202020',
                borderRadius: 8,
                padding: '4px 10px',
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span style={{ color: '#9E9E9E', fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Btn({
  label,
  title,
  flex = 1,
  accent = false,
}: {
  label: string;
  title: string;
  flex?: number;
  accent?: boolean;
}) {
  return (
    <div
      title={title}
      style={{
        flex,
        background: accent ? '#1A2A00' : '#202020',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: accent ? '1px solid #4CAF50' : '1px solid transparent',
        cursor: 'default',
      }}
    >
      <span style={{ color: '#FFC107', fontSize: 16 }}>{label}</span>
    </div>
  );
}
