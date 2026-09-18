import React from 'react';

const BG = '#121212';
const CARD = '#202020';
const TEXT = '#FFFFFF';
const MUTED = '#9E9E9E';
const PRIMARY = '#FFC107';

const addresses = [
  { name: 'Travail', address: 'Bertranneau, 17270 Cercoux', color: '#FF9800' },
  { name: 'Maison', address: '3 all\u00e9e Gambetta, 17360 Saint-Aigulin', color: '#FFC107' },
  { name: 'Parents', address: '15 rue des Lilas, Bordeaux', color: '#4CAF50' },
  { name: 'Garage auto', address: 'ZI Est, 17270 Cercoux', color: '#9E9E9E' },
  { name: 'Mairie', address: 'Place de la Mairie, Montguyon', color: '#9E9E9E' },
];

export function AddressesPage() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        background: '#000',
        padding: 12,
      }}
    >
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18, color: PRIMARY }}>🧭</span>
          <span style={{ fontSize: 16, color: TEXT, fontWeight: 600 }}>Naviguer vers</span>
        </div>

        {/* Address list */}
        {addresses.map((a) => (
          <div
            key={a.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: CARD,
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            {/* Icon circle */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: a.color + '33',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 16 }}>📍</span>
            </div>

            {/* Info */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{a.name}</span>
              <span style={{ fontSize: 11, color: MUTED }}>{a.address}</span>
            </div>

            {/* Waze arrow button */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#1A2A1A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 16, color: '#4CAF50' }}>↗</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
