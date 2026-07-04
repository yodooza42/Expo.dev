import React from "react";

export function Tarmac() {
  const colors = {
    bg: "#0D0D0D",
    surface: "#171717",
    elevation: "#1F1F1F",
    border: "#2E2E2E",
    accent: "#E5A935",
    danger: "#C0392B",
    textWhite: "#F0F0F0",
    textSec: "#666666",
    sep: "#252525",
  };

  const fonts = {
    mono: "'Courier New', Courier, monospace",
    sans: "Inter, system-ui, sans-serif",
  };

  const Odometer = ({ value, color = colors.accent, size = 32 }: { value: string | number, color?: string, size?: number }) => {
    const chars = String(value).split("");
    return (
      <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
        {chars.map((char, i) => (
          <div
            key={i}
            style={{
              backgroundColor: colors.elevation,
              border: `1px solid ${colors.border}`,
              color: color,
              fontFamily: fonts.mono,
              fontWeight: "bold",
              fontSize: `${size}px`,
              padding: "2px 6px",
              minWidth: char === "." || char === "," ? "10px" : `${size * 0.7}px`,
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1.1,
            }}
          >
            {char}
          </div>
        ))}
      </div>
    );
  };

  const trips = [
    { date: "15 OCT", time: "08:30", from: "LYON CENTRE", to: "ENTREPÔT NORD", km: 42.5, eur: 12.5, danger: false },
    { date: "15 OCT", time: "11:15", from: "ENTREPÔT NORD", to: "CHANTIER A43", km: 18.2, eur: 5.4, danger: false },
    { date: "14 OCT", time: "07:45", from: "DOMICILE", to: "GARAGE PARTENAIRE", km: 5.4, eur: 0, danger: true },
    { date: "13 OCT", time: "14:20", from: "LYON SUD", to: "GRENOBLE ZI", km: 112.8, eur: 35.6, danger: false },
    { date: "13 OCT", time: "18:10", from: "GRENOBLE ZI", to: "DOMICILE", km: 108.0, eur: 32.4, danger: false },
  ];

  return (
    <div
      style={{
        width: "390px",
        minHeight: "844px",
        backgroundColor: colors.bg,
        color: colors.textWhite,
        fontFamily: fonts.sans,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 16px 16px",
          borderBottom: `3px solid ${colors.accent}`,
          backgroundColor: colors.bg,
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "14px",
              letterSpacing: "3px",
              color: colors.textWhite,
              fontWeight: "600",
            }}
          >
            Trajets
          </h1>
          <div
            style={{
              backgroundColor: colors.elevation,
              border: `1px solid ${colors.border}`,
              padding: "4px 8px",
              fontSize: "10px",
              letterSpacing: "1px",
              color: colors.textWhite,
            }}
          >
            DOBLO 🚐
          </div>
        </div>
        <div style={{ color: colors.textSec, cursor: "pointer" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </div>
      </header>

      {/* STAT TOTAL */}
      <section
        style={{
          padding: "32px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
        }}
      >
        <div
          style={{
            fontSize: "10px",
            color: colors.textSec,
            letterSpacing: "3px",
            textTransform: "uppercase",
            marginBottom: "12px",
          }}
        >
          Total du mois
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
          <Odometer value="3428" size={40} />
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: "20px",
              color: colors.textSec,
              paddingBottom: "4px",
              fontWeight: "bold",
            }}
          >
            KM
          </span>
        </div>
        <div
          style={{
            marginTop: "16px",
            fontFamily: fonts.mono,
            fontSize: "16px",
            color: colors.textWhite,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ color: colors.textSec }}>•</span>
          514,00 €
          <span style={{ color: colors.textSec }}>•</span>
        </div>
      </section>

      {/* LISTE DES TRAJETS */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "80px" }}>
        {trips.map((trip, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              borderBottom: `1px solid ${colors.sep}`,
              backgroundColor: trip.danger ? "transparent" : colors.bg,
              position: "relative",
            }}
          >
            {/* Ligne accent active */}
            {idx === 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "2px",
                  backgroundColor: colors.accent,
                }}
              />
            )}

            {/* LED Status */}
            <div
              style={{
                width: "4px",
                height: "4px",
                backgroundColor: trip.danger ? colors.danger : "#2ECC71",
                position: "absolute",
                left: "12px",
                top: "16px",
              }}
            />

            <div style={{ padding: "12px 16px 12px 24px", width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "12px", fontSize: "10px", color: colors.textSec, letterSpacing: "2px" }}>
                  <span>{trip.date}</span>
                  <span>{trip.time}</span>
                </div>
                <div style={{ fontFamily: fonts.mono, fontSize: "12px", color: colors.textWhite }}>
                  {trip.eur > 0 ? `${trip.eur.toFixed(1)}€` : "-"}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ fontSize: "14px", color: colors.textWhite }}>{trip.from}</div>
                  <div style={{ fontSize: "14px", color: colors.textSec }}>↓ {trip.to}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Odometer value={trip.km.toFixed(1)} size={16} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BOTTOM NAV */}
      <nav
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "64px",
          backgroundColor: colors.elevation,
          borderTop: `1px solid ${colors.border}`,
          display: "flex",
        }}
      >
        {[
          { icon: "📍", label: "TRAJETS", active: true },
          { icon: "📊", label: "STATS", active: false },
          { icon: "🔧", label: "VÉHICULE", active: false },
          { icon: "⚙️", label: "CONFIG", active: false },
        ].map((tab, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              backgroundColor: tab.active ? colors.accent : "transparent",
              color: tab.active ? "#000" : colors.textSec,
              cursor: "pointer",
              borderRight: i < 3 ? `1px solid ${colors.border}` : "none",
            }}
          >
            <div style={{ fontSize: "16px" }}>{tab.icon}</div>
            <div
              style={{
                fontSize: "9px",
                letterSpacing: "2px",
                fontWeight: tab.active ? "bold" : "normal",
              }}
            >
              {tab.label}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

export default Tarmac;
