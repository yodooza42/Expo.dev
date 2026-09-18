import React from 'react';

export function NeonBureau() {
  const styles = {
    container: {
      width: '390px',
      minHeight: '844px',
      backgroundColor: '#070711',
      color: '#FFFFFF',
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative' as const,
      overflow: 'hidden',
    },
    header: {
      position: 'sticky' as const,
      top: 0,
      zIndex: 10,
      padding: '24px 20px 16px',
      background: 'linear-gradient(to bottom, rgba(7,7,17,0.95) 40%, rgba(7,7,17,0) 100%)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: '20px',
      fontWeight: 600,
      letterSpacing: '-0.5px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    chip: {
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '100px',
      padding: '6px 12px',
      fontSize: '12px',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    iconButton: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mainContent: {
      padding: '0 20px 100px',
      position: 'relative' as const,
      zIndex: 2,
    },
    statsContainer: {
      display: 'flex',
      gap: '12px',
      marginBottom: '32px',
      marginTop: '8px',
      position: 'relative' as const,
    },
    orbCyan: {
      position: 'absolute' as const,
      top: '-20px',
      left: '-40px',
      width: '200px',
      height: '200px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
      pointerEvents: 'none' as const,
      zIndex: -1,
    },
    orbMustard: {
      position: 'absolute' as const,
      top: '-20px',
      right: '-40px',
      width: '200px',
      height: '200px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(229,169,53,0.08) 0%, transparent 70%)',
      pointerEvents: 'none' as const,
      zIndex: -1,
    },
    statBox: {
      flex: 1,
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '20px 16px',
      position: 'relative' as const,
      overflow: 'hidden',
    },
    statLabel: {
      fontSize: '10px',
      textTransform: 'uppercase' as const,
      letterSpacing: '2px',
      opacity: 0.5,
      marginBottom: '8px',
    },
    statValue: {
      fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif',
      fontWeight: 700,
      fontSize: '38px',
      textTransform: 'uppercase' as const,
      lineHeight: 1,
    },
    statValueCyan: {
      color: '#FFFFFF',
      textShadow: '0 0 20px rgba(0,212,255,0.3)',
    },
    statValueMustard: {
      color: '#FFFFFF',
      textShadow: '0 0 20px rgba(229,169,53,0.3)',
    },
    tripList: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    tripCard: {
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    tripLeft: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    tripRoute: {
      fontSize: '14px',
      fontWeight: 500,
      color: '#FFFFFF',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    tripMeta: {
      fontSize: '12px',
      color: 'rgba(255,255,255,0.45)',
      display: 'flex',
      gap: '10px',
    },
    tripAmount: {
      fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif',
      fontWeight: 700,
      fontSize: '28px',
      color: '#E5A935',
      textShadow: '0 0 15px rgba(229,169,53,0.25)',
    },
    bottomNav: {
      position: 'absolute' as const,
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '100px',
      padding: '6px',
      display: 'flex',
      gap: '4px',
      zIndex: 10,
    },
    navItem: {
      padding: '10px 20px',
      borderRadius: '100px',
      fontSize: '13px',
      fontWeight: 600,
      color: 'rgba(255,255,255,0.45)',
      cursor: 'pointer',
    },
    navItemActive: {
      background: '#00D4FF',
      color: '#000000',
      boxShadow: '0 0 15px rgba(0,212,255,0.3)',
    }
  };

  const trips = [
    { id: 1, from: 'Paris', to: 'Lyon', date: 'Aujourd\'hui', dist: '460 km', amount: '69.00' },
    { id: 2, from: 'Lyon', to: 'Marseille', date: 'Hier', dist: '315 km', amount: '47.25' },
    { id: 3, from: 'Marseille', to: 'Nice', date: 'Lun 12', dist: '198 km', amount: '29.70' },
    { id: 4, from: 'Nice', to: 'Monaco', date: 'Dim 11', dist: '21 km', amount: '3.15' },
    { id: 5, from: 'Monaco', to: 'Gênes', date: 'Ven 09', dist: '35 km', amount: '5.25' },
  ];

  return (
    <div style={styles.container}>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;500;600&display=swap');
        
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
      `}} />

      <div style={styles.header}>
        <div style={styles.headerTitle}>
          Trajets
          <div style={styles.chip}>Doblo 🚐</div>
        </div>
        <div style={styles.iconButton}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
        </div>
      </div>

      <div style={styles.mainContent}>
        <div style={styles.statsContainer}>
          <div style={styles.orbCyan} />
          <div style={styles.orbMustard} />
          
          <div style={styles.statBox}>
            <div style={styles.statLabel}>Distance</div>
            <div style={{...styles.statValue, ...styles.statValueCyan}}>3 428<span style={{fontSize: '20px', marginLeft: '4px'}}>KM</span></div>
          </div>
          
          <div style={styles.statBox}>
            <div style={styles.statLabel}>Revenus</div>
            <div style={{...styles.statValue, ...styles.statValueMustard}}>514<span style={{fontSize: '20px', marginLeft: '4px'}}>€</span></div>
          </div>
        </div>

        <div style={styles.tripList}>
          {trips.map(trip => (
            <div key={trip.id} style={styles.tripCard}>
              <div style={styles.tripLeft}>
                <div style={styles.tripRoute}>
                  {trip.from} 
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                  {trip.to}
                </div>
                <div style={styles.tripMeta}>
                  <span>{trip.date}</span>
                  <span>•</span>
                  <span>{trip.dist}</span>
                </div>
              </div>
              <div style={styles.tripAmount}>
                {trip.amount}€
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.bottomNav}>
        <div style={{...styles.navItem, ...styles.navItemActive}}>Trajets</div>
        <div style={styles.navItem}>Stats</div>
        <div style={styles.navItem}>Notes</div>
        <div style={styles.navItem}>Plus</div>
      </div>
    </div>
  );
}

export default NeonBureau;
