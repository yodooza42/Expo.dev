import React from 'react';

const c = {
  bg: '#0B0B14', surface: '#1C1C3A', elevation: '#141428', border: '#2A2A52',
  primary: '#6366F1', mustard: '#E5A935', textMain: '#F5F5FF', textSec: '#6B6B8A',
};

const trips = [
  { id: 1, date: 'LUN 30 JUIN', time: '08:30 – 09:15', start: 'Domicile', end: 'Chantier Dupont', km: '42', cost: '6.30', auto: true },
  { id: 2, date: 'LUN 30 JUIN', time: '17:00 – 18:10', start: 'Chantier Dupont', end: 'Fournisseur Point.P', km: '15', cost: '2.25', auto: true },
  { id: 3, date: 'VEN 27 JUIN', time: '09:00 – 10:30', start: 'Domicile', end: 'Client Martin', km: '85', cost: '12.75', auto: false },
  { id: 4, date: 'JEU 26 JUIN', time: '14:00 – 14:45', start: 'Client Martin', end: 'Agence', km: '32', cost: '4.80', auto: true },
  { id: 5, date: 'MAR 24 JUIN', time: '07:30 – 08:00', start: 'Domicile', end: 'Garage', km: '12', cost: '1.80', auto: false },
];

const tabs = [
  { label: 'Trajets', active: true, icon: '🗺' },
  { label: 'Y aller', active: false, icon: '🧭' },
  { label: 'Kanban', active: false, icon: '📋' },
  { label: 'Dépenses', active: false, icon: '🧾' },
  { label: 'Réglages', active: false, icon: '⚙️' },
];

export function Trajets() {
  return (
    <div style={{
      width: 390, minHeight: 844, backgroundColor: c.bg, color: c.textMain,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex', flexDirection: 'column', position: 'relative', margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ padding: '48px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Trajets</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 20, padding: '5px 12px', fontSize: 13, fontWeight: 500,
          }}>Doblo 🚐</div>
          <div style={{ fontSize: 18, color: c.textSec, cursor: 'pointer' }}>⊟</div>
        </div>
      </div>

      {/* Gradient signature */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${c.primary}, ${c.mustard})` }} />

      {/* Total mois */}
      <div style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: c.textSec, letterSpacing: 1.5, marginBottom: 6 }}>TOTAL JUIN</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 12, fontSize: 30, fontWeight: 700 }}>
          <span>3 428 <span style={{ fontSize: 16, color: c.textSec, fontWeight: 500 }}>km</span></span>
          <span style={{ color: c.border, fontSize: 18 }}>•</span>
          <span style={{ color: c.mustard }}>514 €</span>
        </div>
      </div>

      {/* Trips */}
      <div style={{ flex: 1, padding: '0 12px 100px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {trips.map(t => (
          <div key={t.id} style={{
            background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, padding: 14,
          }}>
            {/* Row 1: date + badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.textSec, letterSpacing: 0.5 }}>{t.date}</span>
                <span style={{ color: c.border }}>·</span>
                <span style={{ fontSize: 12, color: c.textMain }}>{t.time}</span>
              </div>
              <span style={{
                background: t.auto ? `${c.primary}22` : `${c.textSec}18`,
                color: t.auto ? c.primary : c.textSec,
                padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              }}>{t.auto ? 'AUTO' : 'MANUEL'}</span>
            </div>

            {/* Route */}
            <div style={{ background: c.bg, borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${c.primary}` }} />
                <div style={{ width: 1.5, height: 14, background: c.border }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.mustard }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{t.start}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.end}</div>
              </div>
            </div>

            {/* Distance + cost */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: c.textSec }}>{t.cost} €</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: c.mustard }}>{t.km} <span style={{ fontSize: 13 }}>km</span></span>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Tabs */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: c.elevation, borderTop: `1px solid ${c.border}`,
        display: 'flex', justifyContent: 'space-around', padding: '10px 8px 20px',
      }}>
        {tabs.map((tab, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{
              padding: '5px 14px', borderRadius: 20,
              background: tab.active ? c.primary : 'transparent',
              fontSize: 18,
            }}>{tab.icon}</div>
            <span style={{ fontSize: 9, fontWeight: 600, color: tab.active ? c.textMain : c.textSec }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
