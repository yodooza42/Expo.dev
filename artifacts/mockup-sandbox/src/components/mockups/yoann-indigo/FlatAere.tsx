import React from 'react';

export const FlatAere = () => {
  return (
    <div style={{
      width: '390px',
      minHeight: '844px',
      backgroundColor: '#0C0B2A',
      color: '#F6F2E7',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '60px 20px 20px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 300, letterSpacing: '0', color: '#F6F2E7' }}>Trajets</h1>
          <div style={{
            backgroundColor: '#1D1B4B',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '12px',
            color: '#F6F2E7'
          }}>
            Doblo 🚐
          </div>
        </div>
        <div style={{ color: '#F6F2E7', opacity: 0.8 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '10px 20px 30px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2.5px', color: 'rgba(246,242,231,0.4)', marginBottom: '8px' }}>CE MOIS</div>
          <div style={{ fontSize: '32px', fontWeight: 600, color: '#E0A400', lineHeight: 1.1 }}>
            3 428 <span style={{ fontSize: '20px', fontWeight: 400 }}>km</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 500, color: '#F4C93E', marginTop: '6px' }}>
            514 <span style={{ fontSize: '16px', fontWeight: 400 }}>€</span>
          </div>
        </div>
      </div>

      {/* Trajets List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {[
          { date: "Aujourd'hui", time: '14:30', dep: 'Bureau', arr: 'Chantier A', km: '14.2', eur: '8.50' },
          { date: "Aujourd'hui", time: '08:15', dep: 'Maison', arr: 'Bureau', km: '22.4', eur: '12.20' },
          { date: 'Hier', time: '18:45', dep: 'Chantier B', arr: 'Maison', km: '31.0', eur: '16.80' },
          { date: 'Hier', time: '09:00', dep: 'Maison', arr: 'Chantier B', km: '31.0', eur: '16.80' },
          { date: '13 oct.', time: '16:20', dep: 'Fournisseur', arr: 'Bureau', km: '8.5', eur: '4.50' },
          { date: '13 oct.', time: '11:10', dep: 'Bureau', arr: 'Fournisseur', km: '8.5', eur: '4.50' },
        ].map((t, i) => (
          <React.Fragment key={i}>
            <div style={{ height: '0.5px', backgroundColor: 'rgba(109,99,181,0.2)', margin: '0 20px' }}></div>
            <div style={{
              padding: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', color: 'rgba(246,242,231,0.45)' }}>{t.date} • {t.time}</div>
                <div style={{ fontSize: '15px', fontWeight: 400, color: '#F6F2E7' }}>
                  {t.dep} <span style={{ color: 'rgba(246,242,231,0.3)', margin: '0 4px' }}>→</span> {t.arr}
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#E0A400' }}>
                  {t.km} <span style={{ fontSize: '12px', fontWeight: 400 }}>km</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#6B63B5' }}>
                  {t.eur} <span style={{ fontSize: '11px', fontWeight: 400 }}>€</span>
                </div>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        height: '84px',
        display: 'flex',
        borderTop: '0.5px solid rgba(109,99,181,0.2)',
        paddingBottom: '20px'
      }}>
        {[
          { label: 'Trajets', active: true, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> },
          { label: 'Stats', active: false, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> },
          { label: 'Profil', active: false, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> }
        ].map((tab, i) => (
          <div key={i} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            color: tab.active ? '#E0A400' : 'rgba(246,242,231,0.4)',
            position: 'relative'
          }}>
            {tab.icon}
            {tab.active && (
              <div style={{
                position: 'absolute',
                bottom: '-2px',
                left: '30%',
                right: '30%',
                height: '2px',
                backgroundColor: '#E0A400',
                borderRadius: '2px 2px 0 0'
              }}></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
