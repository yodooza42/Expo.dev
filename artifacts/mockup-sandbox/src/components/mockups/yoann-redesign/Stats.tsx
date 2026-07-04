import React from 'react';

export function Stats() {
  return (
    <div style={{
      width: '390px',
      minHeight: '844px',
      backgroundColor: '#0B0B14',
      color: '#F5F5FF',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Signature gradient */}
      <div style={{ width: '100%', height: '2px', background: 'linear-gradient(to right, #6366F1, #E5A935)' }} />

      {/* Header */}
      <div style={{ padding: '24px 20px 16px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 600, margin: '0 0 4px', color: '#F5F5FF' }}>Doblo 🚐</h1>
        <p style={{ fontSize: '14px', fontWeight: 500, margin: 0, color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Renault Trafic</p>
      </div>

      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingBottom: '100px' }}>
        
        {/* Odometer Card */}
        <div style={{ backgroundColor: '#1C1C3A', border: '1px solid #2A2A52', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '36px', fontWeight: 700, color: '#E5A935', margin: '0 0 8px' }}>87 432 <span style={{fontSize: '24px', color: '#F5F5FF'}}>km</span></div>
          <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '1px' }}>Odomètre estimé</div>
        </div>

        {/* 3 Stats Row */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1, backgroundColor: '#1C1C3A', border: '1px solid #2A2A52', borderRadius: '14px', padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#F5F5FF', marginBottom: '4px', whiteSpace: 'nowrap' }}>0.47 €</div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '8px' }}>/ km</div>
            <div style={{ backgroundColor: '#141428', color: '#E5A935', fontSize: '10px', padding: '4px 8px', borderRadius: '8px', fontWeight: 600 }}>Auto 🔧</div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#1C1C3A', border: '1px solid #2A2A52', borderRadius: '14px', padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#F5F5FF', marginBottom: '4px', whiteSpace: 'nowrap' }}>3 428</div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '8px' }}>km (mois)</div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#1C1C3A', border: '1px solid #2A2A52', borderRadius: '14px', padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#F5F5FF', marginBottom: '4px', whiteSpace: 'nowrap' }}>€1 611</div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '8px' }}>coût total</div>
          </div>
        </div>

        {/* Entretien */}
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Entretien</div>
          
          <div style={{ backgroundColor: '#1C1C3A', border: '1px solid #2A2A52', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Vidange */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Vidange</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#F87171' }}>800 km</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#141428', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: '90%', height: '100%', backgroundColor: '#F87171', borderRadius: '3px' }} />
              </div>
            </div>

            {/* Pneus */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Pneus</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#FB923C' }}>4 500 km</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#141428', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: '75%', height: '100%', backgroundColor: '#FB923C', borderRadius: '3px' }} />
              </div>
            </div>

            {/* CT */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Contrôle Technique</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#4ADE80' }}>12 000 km</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#141428', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: '30%', height: '100%', backgroundColor: '#4ADE80', borderRadius: '3px' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Android Widget Preview */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Widget Android (4×1)</div>
          <div style={{ backgroundColor: '#141428', border: '1px solid #2A2A52', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '12px', color: '#6B6B8A', textTransform: 'uppercase', fontWeight: 500 }}>Prochain</div>
                <div style={{ fontSize: '15px', color: '#F5F5FF', fontWeight: 600 }}>Client Roissy — 22 km</div>
              </div>
              <div style={{ backgroundColor: '#E5A935', color: '#0B0B14', padding: '8px 16px', borderRadius: '20px', fontWeight: 600, fontSize: '14px', flexShrink: 0 }}>
                Naviguer
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#6B6B8A', fontWeight: 500 }}>
              Doblo • <span style={{ color: '#F5F5FF' }}>87 432 km</span> • 0.47€/km
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Tabs */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', backgroundColor: '#0B0B14', borderTop: '1px solid #2A2A52', display: 'flex', padding: '0 8px', alignItems: 'center', justifyContent: 'space-around', zIndex: 10 }}>
        {['Trajets', 'Y aller', 'Kanban', 'Dépenses', 'Réglages'].map((tab) => {
          const isActive = tab === 'Réglages';
          return (
            <div key={tab} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '6px',
              padding: '8px 10px',
              backgroundColor: isActive ? '#6366F1' : 'transparent',
              borderRadius: '12px',
              minWidth: '60px'
            }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                backgroundColor: isActive ? '#F5F5FF' : '#6B6B8A', 
                borderRadius: '4px',
                opacity: isActive ? 1 : 0.5
              }} />
              <div style={{ 
                fontSize: '10px', 
                fontWeight: 600, 
                color: isActive ? '#F5F5FF' : '#6B6B8A' 
              }}>
                {tab}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Stats;
