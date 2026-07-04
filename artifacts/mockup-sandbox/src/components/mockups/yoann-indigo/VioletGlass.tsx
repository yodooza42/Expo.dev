import React from "react";

export function VioletGlass() {
  const containerStyle: React.CSSProperties = {
    width: "390px",
    minHeight: "844px",
    backgroundColor: "#0C0B2A",
    position: "relative",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#F6F2E7",
  };

  const orb1Style: React.CSSProperties = {
    width: "280px",
    height: "280px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(107,99,181,0.18) 0%, transparent 70%)",
    top: "60px",
    left: "-80px",
    position: "absolute",
    pointerEvents: "none",
  };

  const orb2Style: React.CSSProperties = {
    width: "200px",
    height: "200px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(224,164,0,0.1) 0%, transparent 70%)",
    top: "100px",
    right: "-40px",
    position: "absolute",
    pointerEvents: "none",
  };

  const glassCardStyle: React.CSSProperties = {
    background: "rgba(109, 99, 181, 0.12)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(109, 99, 181, 0.25)",
    borderRadius: "18px",
    boxShadow: "0 4px 24px rgba(12, 11, 42, 0.4), inset 0 1px 0 rgba(246,242,231,0.06)",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  };

  const statCardStyle: React.CSSProperties = {
    ...glassCardStyle,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 12px",
  };

  const contentStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    height: "100%",
    boxSizing: "border-box",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "20px",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "22px",
    fontWeight: 500,
    color: "#F6F2E7",
    margin: 0,
  };

  const chipStyle: React.CSSProperties = {
    background: "rgba(109,99,181,0.2)",
    border: "1px solid rgba(109,99,181,0.4)",
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 500,
  };

  const statsContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: "12px",
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: "28px",
    fontWeight: 700,
    color: "#E0A400",
    lineHeight: 1.2,
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: "10px",
    color: "rgba(246,242,231,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginTop: "4px",
  };

  const tripListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    paddingBottom: "100px", // space for bottom nav
  };

  const locationStyle: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 500,
    color: "#F6F2E7",
  };

  const timeStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "rgba(246,242,231,0.5)",
  };

  const amountStyle: React.CSSProperties = {
    fontSize: "18px",
    fontWeight: 700,
    color: "#F4C93E",
    textShadow: "0 0 8px rgba(244,201,62,0.4)",
  };

  const kmStyle: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 500,
    color: "#E0A400",
  };

  const bottomNavStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "80px",
    background: "rgba(29,27,75,0.8)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    padding: "0 20px",
    paddingBottom: "20px", // iPhone home indicator area
    borderTop: "1px solid rgba(109, 99, 181, 0.2)",
    zIndex: 10,
  };

  const tabItemStyle = (isActive: boolean): React.CSSProperties => ({
    width: "48px",
    height: "48px",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: isActive ? "#E0A400" : "transparent",
    color: isActive ? "#0C0B2A" : "rgba(246,242,231,0.5)",
  });

  return (
    <div style={containerStyle}>
      <div style={orb1Style} />
      <div style={orb2Style} />
      
      <div style={contentStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Trajets</h1>
          <div style={chipStyle}>Peugeot 308</div>
        </div>

        <div style={statsContainerStyle}>
          <div style={statCardStyle}>
            <div style={statValueStyle}>3 428</div>
            <div style={statLabelStyle}>kilomètres</div>
          </div>
          <div style={statCardStyle}>
            <div style={statValueStyle}>514</div>
            <div style={statLabelStyle}>euros (€)</div>
          </div>
        </div>

        <div style={tripListStyle}>
          <div style={glassCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={locationStyle}>Paris → Lyon</div>
              <div style={timeStyle}>Aujourd'hui, 08:30</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "4px" }}>
              <div style={kmStyle}>460 km</div>
              <div style={amountStyle}>69,00 €</div>
            </div>
          </div>

          <div style={glassCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={locationStyle}>Lyon → Marseille</div>
              <div style={timeStyle}>Hier, 14:15</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "4px" }}>
              <div style={kmStyle}>315 km</div>
              <div style={amountStyle}>47,25 €</div>
            </div>
          </div>
          
          <div style={glassCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={locationStyle}>Marseille → Nice</div>
              <div style={timeStyle}>12 Juin, 09:00</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "4px" }}>
              <div style={kmStyle}>205 km</div>
              <div style={amountStyle}>30,75 €</div>
            </div>
          </div>
        </div>
      </div>

      <div style={bottomNavStyle}>
        <div style={tabItemStyle(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>
        <div style={tabItemStyle(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        </div>
        <div style={tabItemStyle(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </div>
        <div style={tabItemStyle(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </div>
      </div>
    </div>
  );
}

export default VioletGlass;
