import React, { useState } from 'react';
import { 
  Map, 
  Navigation as NavIcon, 
  ListTodo, 
  Wallet, 
  Settings, 
  Building, 
  Home, 
  MapPin, 
  Star,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

export default function Navigation() {
  const [gpsActive, setGpsActive] = useState(true);
  const [refreshRate, setRefreshRate] = useState(1); // 0: 30s, 1: 1min, 2: 2min

  const colors = {
    bg: '#0B0B14',
    surface: '#1C1C3A',
    elevation: '#141428',
    border: '#2A2A52',
    indigo: '#6366F1',
    mustard: '#E5A935',
    textMain: '#F5F5FF',
    textSec: '#6B6B8A',
    green: '#4ADE80'
  };

  return (
    <div style={{
      width: '390px',
      minHeight: '844px',
      backgroundColor: colors.bg,
      color: colors.textMain,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ padding: '48px 24px 20px', backgroundColor: colors.elevation }}>
        <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', fontWeight: 600, color: '#FFFFFF' }}>Y aller</h1>
        <div style={{ color: colors.textSec, fontSize: '15px', fontWeight: 500 }}>Véhicule : Doblo 🚐</div>
      </div>
      
      {/* Gradient Line */}
      <div style={{
        height: '2px',
        width: '100%',
        background: `linear-gradient(90deg, ${colors.indigo} 0%, ${colors.mustard} 100%)`
      }} />

      <div style={{ flex: 1, padding: '24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '36px' }}>
        
        {/* Raccourcis */}
        <section>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: colors.textSec, 
            letterSpacing: '1.5px', 
            textTransform: 'uppercase',
            marginBottom: '16px'
          }}>
            Raccourcis
          </div>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', margin: '0 -20px', paddingLeft: '20px', paddingRight: '20px' }}>
            <ShortcutCard 
              icon={<Building size={20} color={colors.textMain} />}
              name="Bâtiment B"
              distance="3.2 km"
              badge="Via A86"
              colors={colors}
            />
            <ShortcutCard 
              icon={<Home size={20} color={colors.textMain} />}
              name="Maison"
              distance="18 km"
              badge="Autoroute"
              colors={colors}
            />
            <ShortcutCard 
              icon={<MapPin size={20} color={colors.textMain} />}
              name="Client Paris"
              distance="87 km"
              badge="Péage"
              colors={colors}
            />
          </div>
        </section>

        {/* Lieux Connus */}
        <section>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: colors.textSec, 
            letterSpacing: '1.5px', 
            textTransform: 'uppercase',
            marginBottom: '16px'
          }}>
            Lieux connus
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <PlaceRow icon={<Home size={20} />} name="Maison" address="12 Rue des Lilas, Lyon" colors={colors} />
            <PlaceRow icon={<Building size={20} />} name="Siège Social" address="45 Av. Jean Jaurès, Paris" colors={colors} />
            <PlaceRow icon={<Star size={20} color={colors.mustard} />} name="Fournisseur Pro" address="Zone Ind. Est, Villeurbanne" colors={colors} />
          </div>
        </section>

        {/* Localisation GPS */}
        <section>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: colors.textSec, 
            letterSpacing: '1.5px', 
            textTransform: 'uppercase',
            marginBottom: '16px'
          }}>
            Localisation GPS
          </div>
          <div style={{ 
            backgroundColor: colors.surface, 
            border: `1px solid ${colors.border}`,
            borderRadius: '14px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontWeight: 500, fontSize: '15px' }}>Rafraîchissement actif</span>
              <div onClick={() => setGpsActive(!gpsActive)} style={{ cursor: 'pointer' }}>
                {gpsActive ? (
                  <ToggleRight size={36} color={colors.indigo} />
                ) : (
                  <ToggleLeft size={36} color={colors.textSec} />
                )}
              </div>
            </div>
            
            <div style={{ opacity: gpsActive ? 1 : 0.4, pointerEvents: gpsActive ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', color: colors.textSec }}>
                <span>Fréquence</span>
                <span style={{ color: colors.mustard, fontWeight: 700, fontSize: '15px' }}>{refreshRate === 0 ? '30s' : refreshRate === 1 ? '1 min' : '2 min'}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="2" 
                value={refreshRate} 
                onChange={(e) => setRefreshRate(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: colors.indigo, height: '4px', borderRadius: '2px', outline: 'none' }} 
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: colors.textSec, marginTop: '12px', fontWeight: 500 }}>
                <span>Précis (Batterie -)</span>
                <span>Éco (Batterie +)</span>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 20px',
        backgroundColor: colors.elevation,
        borderTop: `1px solid ${colors.border}`,
        paddingBottom: '32px' // SafeArea padding
      }}>
        <Tab icon={<Map size={22} />} label="Trajets" colors={colors} />
        <Tab icon={<NavIcon size={22} />} label="Y aller" active colors={colors} />
        <Tab icon={<ListTodo size={22} />} label="Kanban" colors={colors} />
        <Tab icon={<Wallet size={22} />} label="Dépenses" colors={colors} />
        <Tab icon={<Settings size={22} />} label="Réglages" colors={colors} />
      </div>
    </div>
  );
}

function ShortcutCard({ icon, name, distance, badge, colors }: any) {
  return (
    <div style={{
      minWidth: '140px',
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: '14px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      cursor: 'pointer'
    }}>
      <div style={{ 
        width: '40px', 
        height: '40px', 
        borderRadius: '10px', 
        backgroundColor: colors.elevation, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        border: `1px solid ${colors.border}`
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>{name}</div>
        <div style={{ color: colors.mustard, fontWeight: 700, fontSize: '20px' }}>{distance}</div>
      </div>
      <div style={{
        backgroundColor: 'rgba(229, 169, 53, 0.15)',
        color: colors.mustard,
        fontSize: '11px',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '6px',
        alignSelf: 'flex-start',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {badge}
      </div>
    </div>
  );
}

function PlaceRow({ icon, name, address, colors }: any) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: '14px',
      padding: '16px',
      cursor: 'pointer'
    }}>
      <div style={{ 
        width: '48px', 
        height: '48px', 
        borderRadius: '12px', 
        backgroundColor: colors.elevation, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: colors.textMain,
        border: `1px solid ${colors.border}`
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>{name}</div>
        <div style={{ color: colors.textSec, fontSize: '13px', fontWeight: 500 }}>{address}</div>
      </div>
    </div>
  );
}

function Tab({ icon, label, active, colors }: any) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      color: active ? colors.textMain : colors.textSec,
      cursor: 'pointer',
      width: '64px'
    }}>
      <div style={{
        padding: '8px 16px',
        borderRadius: '20px',
        backgroundColor: active ? colors.indigo : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {icon}
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600 }}>{label}</span>
    </div>
  );
}
