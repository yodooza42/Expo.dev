import React from "react";

export const BoldEditorial: React.FC = () => {
  return (
    <div
      style={{
        width: "390px",
        minHeight: "844px",
        backgroundColor: "#0C0B2A",
        color: "#F6F2E7",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "24px 20px 16px" }}>
        <div
          style={{
            fontSize: "13px",
            textTransform: "uppercase",
            letterSpacing: "4px",
            color: "rgba(246,242,231,0.5)",
            marginBottom: "8px",
          }}
        >
          Trajets
        </div>
        <div
          style={{
            backgroundColor: "#1D1B4B",
            display: "inline-block",
            padding: "6px 12px",
            borderRadius: "16px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Doblo 🚐
        </div>
      </div>

      {/* Hero Block */}
      <div style={{ padding: "0 20px", marginBottom: "24px" }}>
        <div
          style={{
            backgroundColor: "#1D1B4B",
            borderRadius: "16px",
            padding: "24px",
            position: "relative",
            height: "140px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              fontSize: "52px",
              fontWeight: 900,
              color: "#E0A400",
              lineHeight: 1,
            }}
          >
            3 428
          </div>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "2px",
              color: "rgba(246,242,231,0.4)",
              marginTop: "4px",
            }}
          >
            KM CE MOIS
          </div>
          <div
            style={{
              position: "absolute",
              right: "24px",
              top: "24px",
              fontSize: "32px",
              fontWeight: 700,
              color: "#F4C93E",
            }}
          >
            514 €
          </div>
        </div>
      </div>

      {/* Separator Line */}
      <div
        style={{
          height: "1px",
          backgroundColor: "#E0A400",
          opacity: 0.3,
          margin: "0 20px 24px",
        }}
      />

      {/* Trip List */}
      <div style={{ flex: 1, paddingBottom: "100px", overflowY: "auto" }}>
        {[
          { from: "Lyon", to: "Annecy", dist: "104", date: "Aujourd'hui, 08:30" },
          { from: "Annecy", to: "Genève", dist: "42", date: "Aujourd'hui, 11:15" },
          { from: "Genève", to: "Chambéry", dist: "88", date: "Hier, 16:45" },
          { from: "Chambéry", to: "Grenoble", dist: "55", date: "Hier, 09:20" },
          { from: "Grenoble", to: "Lyon", dist: "112", date: "Mar. 14, 18:10" },
        ].map((trip, i) => (
          <div
            key={i}
            style={{
              backgroundColor: "#1D1B4B",
              borderRadius: "12px",
              borderLeft: "4px solid #E0A400",
              padding: "16px",
              margin: "0 20px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#F6F2E7",
                  marginBottom: "4px",
                }}
              >
                {trip.from} → {trip.to}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  color: "rgba(246,242,231,0.4)",
                }}
              >
                {trip.date}
              </div>
            </div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: 800,
                color: "#E0A400",
              }}
            >
              {trip.dist}
              <span style={{ fontSize: "14px", marginLeft: "2px" }}>km</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Tabs */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "#1D1B4B",
          padding: "16px 20px 32px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {["Home", "Trajets", "Frais", "Profil"].map((tab, i) => {
          const isActive = tab === "Trajets";
          return (
            <div
              key={i}
              style={{
                backgroundColor: isActive ? "#E0A400" : "transparent",
                color: isActive ? "#0C0B2A" : "rgba(246,242,231,0.5)",
                padding: "8px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: isActive ? 800 : 600,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              {tab}
            </div>
          );
        })}
      </div>
    </div>
  );
};
