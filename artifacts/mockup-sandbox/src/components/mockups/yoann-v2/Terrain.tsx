import React from "react";

export function Terrain() {
  const styles = {
    container: {
      width: "390px",
      minHeight: "844px",
      backgroundColor: "#111A10",
      color: "#EAF0E7",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column" as const,
      position: "relative" as const,
      overflow: "hidden",
    },
    header: {
      padding: "50px 24px 20px",
      backgroundColor: "#1F2B1D",
      borderBottom: "1px solid #2D3D2A",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 10,
    },
    headerTitle: {
      fontSize: "22px",
      fontWeight: 700,
      margin: 0,
    },
    headerActions: {
      display: "flex",
      gap: "12px",
      alignItems: "center",
    },
    vehiclePill: {
      backgroundColor: "#192218",
      border: "1px solid #2D3D2A",
      borderRadius: "100px",
      padding: "6px 14px",
      fontSize: "13px",
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },
    filterBtn: {
      width: "36px",
      height: "36px",
      borderRadius: "100px",
      backgroundColor: "#192218",
      border: "1px solid #2D3D2A",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    },
    content: {
      flex: 1,
      padding: "24px",
      overflowY: "auto" as const,
      paddingBottom: "100px",
    },
    statsContainer: {
      display: "flex",
      gap: "12px",
      marginBottom: "32px",
    },
    statPill: {
      flex: 1,
      backgroundColor: "#192218",
      border: "1px solid #2D3D2A",
      borderRadius: "20px",
      padding: "16px",
      display: "flex",
      flexDirection: "column" as const,
      gap: "4px",
    },
    statLabel: {
      fontSize: "10px",
      textTransform: "uppercase" as const,
      letterSpacing: "2px",
      color: "#6B7F67",
      fontWeight: 600,
    },
    statValue: {
      fontSize: "28px",
      fontWeight: 700,
      color: "#E5A935",
      margin: 0,
    },
    sectionTitle: {
      fontSize: "10px",
      textTransform: "uppercase" as const,
      letterSpacing: "2px",
      color: "#6B7F67",
      fontWeight: 600,
      marginBottom: "16px",
    },
    cardsList: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "16px",
    },
    card: {
      backgroundColor: "#192218",
      border: "1px solid #2D3D2A",
      borderRadius: "20px",
      boxShadow: "0 4px 12px rgba(127,176,105,0.08)",
      position: "relative" as const,
      overflow: "hidden",
    },
    cardInnerBorder: {
      position: "absolute" as const,
      top: "1px",
      left: "1px",
      right: "1px",
      bottom: "1px",
      border: "1px solid rgba(107, 127, 103, 0.15)",
      borderRadius: "19px",
      pointerEvents: "none" as const,
      zIndex: 1,
    },
    cardContent: {
      padding: "20px",
      position: "relative" as const,
      zIndex: 2,
    },
    miniBarContainer: {
      position: "absolute" as const,
      top: 0,
      left: "24px",
      right: "24px",
      height: "3px",
      backgroundColor: "rgba(45, 61, 42, 0.5)",
      borderRadius: "0 0 4px 4px",
    },
    miniBarFill: (percent: number) => ({
      height: "100%",
      width: `${percent}%`,
      backgroundColor: "#E5A935",
      borderRadius: "0 0 4px 4px",
    }),
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "20px",
      marginTop: "4px",
    },
    dateBadge: {
      fontSize: "13px",
      color: "#6B7F67",
      fontWeight: 500,
    },
    distanceBadge: {
      fontSize: "16px",
      fontWeight: 700,
      color: "#E5A935",
    },
    routeContainer: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "16px",
      position: "relative" as const,
    },
    routeLine: {
      position: "absolute" as const,
      left: "6px",
      top: "14px",
      bottom: "14px",
      width: "2px",
      borderLeft: "2px dashed #7FB069",
      opacity: 0.5,
      zIndex: -1,
    },
    point: {
      display: "flex",
      gap: "16px",
      alignItems: "flex-start",
    },
    pointDot: (isEnd: boolean) => ({
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      backgroundColor: isEnd ? "#192218" : "#7FB069",
      border: `3px solid ${isEnd ? "#7FB069" : "#192218"}`,
      marginTop: "2px",
      boxShadow: isEnd ? "" : "0 0 0 2px #7FB069",
      zIndex: 2,
    }),
    pointText: {
      flex: 1,
    },
    pointTime: {
      fontSize: "12px",
      color: "#6B7F67",
      marginBottom: "2px",
      fontWeight: 600,
    },
    pointName: {
      fontSize: "14px",
      fontWeight: 500,
      lineHeight: 1.4,
    },
    cardFooter: {
      marginTop: "20px",
      paddingTop: "16px",
      borderTop: "1px solid rgba(45, 61, 42, 0.5)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    tag: {
      fontSize: "12px",
      color: "#7FB069",
      backgroundColor: "rgba(127, 176, 105, 0.1)",
      padding: "4px 10px",
      borderRadius: "6px",
      fontWeight: 500,
    },
    price: {
      fontSize: "15px",
      fontWeight: 600,
      color: "#EAF0E7",
    },
    bottomTabs: {
      position: "absolute" as const,
      bottom: "20px",
      left: "24px",
      right: "24px",
      height: "64px",
      backgroundColor: "#1F2B1D",
      borderRadius: "100px",
      border: "1px solid #2D3D2A",
      display: "flex",
      padding: "8px",
      justifyContent: "space-between",
      boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
      zIndex: 20,
    },
    tabItem: (isActive: boolean) => ({
      flex: 1,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      borderRadius: "100px",
      backgroundColor: isActive ? "#7FB069" : "transparent",
      color: isActive ? "#111A10" : "#6B7F67",
      cursor: "pointer",
    }),
  };

  const trips = [
    {
      id: 1,
      date: "Aujourd'hui",
      distance: "42 km",
      distancePercent: 60,
      start: { time: "07:30", location: "Domicile - Lyon" },
      end: { time: "08:15", location: "Chantier Croix-Rousse" },
      tag: "Pro",
      price: "12,50 €",
    },
    {
      id: 2,
      date: "Hier",
      distance: "18 km",
      distancePercent: 25,
      start: { time: "16:45", location: "Chantier Croix-Rousse" },
      end: { time: "17:20", location: "Fournisseur Point P" },
      tag: "Pro",
      price: "5,40 €",
    },
    {
      id: 3,
      date: "Lun. 12 Oct",
      distance: "86 km",
      distancePercent: 90,
      start: { time: "06:15", location: "Domicile - Lyon" },
      end: { time: "07:40", location: "Chantier Villefranche" },
      tag: "Pro",
      price: "25,80 €",
    },
    {
      id: 4,
      date: "Dim. 11 Oct",
      distance: "12 km",
      distancePercent: 15,
      start: { time: "10:00", location: "Domicile - Lyon" },
      end: { time: "10:20", location: "Parc de la Tête d'Or" },
      tag: "Perso",
      price: "0,00 €",
    },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Trajets</h1>
        <div style={styles.headerActions}>
          <div style={styles.vehiclePill}>
            <span>Doblo</span>
            <span>🚐</span>
          </div>
          <div style={styles.filterBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EAF0E7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </div>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.statsContainer}>
          <div style={styles.statPill}>
            <span style={styles.statLabel}>Ce mois</span>
            <h2 style={styles.statValue}>3 428 <span style={{fontSize: "18px", color: "#6B7F67"}}>km</span></h2>
          </div>
          <div style={styles.statPill}>
            <span style={styles.statLabel}>Frais estimés</span>
            <h2 style={styles.statValue}>514 <span style={{fontSize: "18px", color: "#6B7F67"}}>€</span></h2>
          </div>
        </div>

        <h3 style={styles.sectionTitle}>Derniers trajets</h3>

        <div style={styles.cardsList}>
          {trips.map((trip) => (
            <div key={trip.id} style={styles.card}>
              {/* Topographic Background SVG */}
              <div style={{ position: "absolute", bottom: "-20px", right: "-20px", opacity: 0.4, zIndex: 0, pointerEvents: "none" }}>
                <svg width="150" height="150" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 10 100 Q 30 70 80 40 T 150 20" stroke="#2D3D2A" strokeWidth="1" fill="none" />
                  <path d="M 30 110 Q 50 80 100 50 T 170 30" stroke="#2D3D2A" strokeWidth="1" fill="none" />
                  <path d="M 50 120 Q 70 90 120 60 T 190 40" stroke="#2D3D2A" strokeWidth="1" fill="none" />
                  <path d="M 70 130 Q 90 100 140 70 T 210 50" stroke="#2D3D2A" strokeWidth="1" fill="none" />
                </svg>
              </div>

              <div style={styles.cardInnerBorder}></div>
              
              <div style={styles.miniBarContainer}>
                <div style={styles.miniBarFill(trip.distancePercent)}></div>
              </div>

              <div style={styles.cardContent}>
                <div style={styles.cardHeader}>
                  <span style={styles.dateBadge}>{trip.date}</span>
                  <span style={styles.distanceBadge}>{trip.distance}</span>
                </div>

                <div style={styles.routeContainer}>
                  <div style={styles.routeLine}></div>
                  
                  <div style={styles.point}>
                    <div style={styles.pointDot(false)}></div>
                    <div style={styles.pointText}>
                      <div style={styles.pointTime}>{trip.start.time}</div>
                      <div style={styles.pointName}>{trip.start.location}</div>
                    </div>
                  </div>
                  
                  <div style={styles.point}>
                    <div style={styles.pointDot(true)}></div>
                    <div style={styles.pointText}>
                      <div style={styles.pointTime}>{trip.end.time}</div>
                      <div style={styles.pointName}>{trip.end.location}</div>
                    </div>
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  <div style={styles.tag}>{trip.tag}</div>
                  <div style={styles.price}>{trip.price}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.bottomTabs}>
        <div style={styles.tabItem(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
        <div style={styles.tabItem(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
        </div>
        <div style={styles.tabItem(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <div style={styles.tabItem(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default Terrain;
