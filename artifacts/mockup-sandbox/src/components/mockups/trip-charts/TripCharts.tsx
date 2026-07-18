import { useState, useCallback, useMemo } from "react";

// ── Simulated trip data ─────────────────────────────────────────────────────

const TRIP_COLOR = "#FF6B00";
const ALT_COLOR = "#AAAAAA";

// Generate realistic moto trip data (col de montagne, ~28km)
function generateTripData() {
  const points: Array<{ km: number; speed: number; alt: number }> = [];
  const n = 80;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const km = t * 27.4;
    // Speed: starts slow, climbs, peaks on descent
    const baseSpeed =
      t < 0.1 ? t * 10 * 40 :
      t < 0.45 ? 40 + Math.sin(t * Math.PI) * 35 :
      t < 0.5 ? 45 + (t - 0.45) * 2 * 30 :
      t < 0.7 ? 70 + Math.sin((t - 0.5) * Math.PI * 3) * 20 :
      75 - (t - 0.7) * 3 * 50;
    const speed = Math.max(0, Math.min(115, baseSpeed + (Math.random() - 0.5) * 15));
    // Altitude: starts at 520m, climbs to 1240m, descends to 680m
    const baseAlt =
      t < 0.5 ? 520 + t * 2 * 720 :
      520 + (1 - t) * 2 * 360 + 320;
    const alt = Math.round(Math.max(400, Math.min(1280, baseAlt + (Math.random() - 0.5) * 30)));
    points.push({ km: parseFloat(km.toFixed(2)), speed: Math.round(speed), alt });
  }
  return points;
}

const TRIP_DATA = generateTripData();
const TOTAL_KM = TRIP_DATA[TRIP_DATA.length - 1]!.km;
const MAX_SPEED = Math.max(...TRIP_DATA.map(d => d.speed));
const AVG_SPEED = Math.round(TRIP_DATA.reduce((s, d) => s + d.speed, 0) / TRIP_DATA.length);
const MIN_ALT = Math.min(...TRIP_DATA.map(d => d.alt));
const MAX_ALT = Math.max(...TRIP_DATA.map(d => d.alt));
let GAIN_M = 0;
for (let i = 1; i < TRIP_DATA.length; i++) {
  const d = TRIP_DATA[i]!.alt - TRIP_DATA[i - 1]!.alt;
  if (d > 0) GAIN_M += d;
}
GAIN_M = Math.round(GAIN_M);

// ── Mini SVG Chart ──────────────────────────────────────────────────────────

function SpeedChart({ onScrub }: { onScrub: (idx: number | null) => void }) {
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  const W = 388;
  const H = 84;
  const PL = 32; const PR = 8; const PT = 8; const PB = 16;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const maxS = Math.max(MAX_SPEED, 1);

  const mx = (km: number) => PL + (km / TOTAL_KM) * cW;
  const my = (spd: number) => PT + (1 - spd / maxS) * cH;
  const avgY = my(AVG_SPEED);

  const pts = TRIP_DATA.map(d => `${mx(d.km).toFixed(1)},${my(d.speed).toFixed(1)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `${linePath} L ${mx(TOTAL_KM).toFixed(1)},${(PT + cH).toFixed(1)} L ${PL},${(PT + cH).toFixed(1)} Z`;

  const nearest = scrubIdx !== null ? TRIP_DATA[scrubIdx] : null;

  const handleMouse = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, (x - PL) / cW));
    const targetKm = frac * TOTAL_KM;
    let bestIdx = 0;
    let bestD = Math.abs(TRIP_DATA[0]!.km - targetKm);
    for (let i = 1; i < TRIP_DATA.length; i++) {
      const dd = Math.abs(TRIP_DATA[i]!.km - targetKm);
      if (dd < bestD) { bestIdx = i; bestD = dd; }
    }
    setScrubIdx(bestIdx);
    onScrub(bestIdx);
  }, [onScrub]);

  const handleLeave = useCallback(() => {
    setScrubIdx(null);
    onScrub(null);
  }, [onScrub]);

  return (
    <div>
      <svg
        width={W} height={H}
        style={{ cursor: "crosshair", display: "block" }}
        onMouseMove={handleMouse}
        onMouseLeave={handleLeave}
      >
        <defs>
          <linearGradient id="spd_grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={TRIP_COLOR} stopOpacity="0.55" />
            <stop offset="1" stopColor={TRIP_COLOR} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* avg line */}
        <line x1={PL} y1={avgY} x2={W - PR} y2={avgY}
          stroke="#FFFFFF22" strokeWidth={1} strokeDasharray="4 3" />
        <path d={areaPath} fill="url(#spd_grad)" />
        <path d={linePath} stroke={TRIP_COLOR} strokeWidth={2} fill="none" strokeLinejoin="round" />
        {nearest !== null && scrubIdx !== null && (
          <>
            <line x1={mx(nearest.km)} y1={PT} x2={mx(nearest.km)} y2={PT + cH}
              stroke="#FFFFFFCC" strokeWidth={1.5} />
            <circle cx={mx(nearest.km)} cy={my(nearest.speed)} r={5}
              fill="#FFFFFF" stroke={TRIP_COLOR} strokeWidth={2} />
          </>
        )}
        <text x={PL - 3} y={PT + 6} textAnchor="end" fontSize={8} fill="#666">{maxS}</text>
        <text x={PL - 3} y={PT + cH + 1} textAnchor="end" fontSize={8} fill="#666">0</text>
        <text x={PL + 1} y={H - 2} textAnchor="start" fontSize={8} fill="#666">0</text>
        <text x={W - PR} y={H - 2} textAnchor="end" fontSize={8} fill="#666">{TOTAL_KM.toFixed(1)} km</text>
      </svg>

      {nearest ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "2px 2px 0" }}>
          <span style={{ color: TRIP_COLOR, fontWeight: 700, fontSize: 20, lineHeight: 1 }}>
            {nearest.speed} km/h
          </span>
          <span style={{ color: "#555", fontSize: 12 }}>·</span>
          <span style={{ color: "#888", fontSize: 12 }}>{nearest.km.toFixed(2)} km</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 20, padding: "2px 2px 0" }}>
          {[
            ["MOY", `${AVG_SPEED} km/h`],
            ["MAX", `${MAX_SPEED} km/h`],
            ["DURÉE", "38 min"],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "sans-serif" }}>{label}</div>
              <div style={{ color: "#E0E0E0", fontSize: 14, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AltChart({ onScrub }: { onScrub: (idx: number | null) => void }) {
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  const W = 388;
  const H = 84;
  const PL = 36; const PR = 8; const PT = 8; const PB = 16;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const span = Math.max(MAX_ALT - MIN_ALT, 1);

  const mx = (km: number) => PL + (km / TOTAL_KM) * cW;
  const my = (alt: number) => PT + (1 - (alt - MIN_ALT) / span) * cH;

  const pts = TRIP_DATA.map(d => `${mx(d.km).toFixed(1)},${my(d.alt).toFixed(1)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `${linePath} L ${mx(TOTAL_KM).toFixed(1)},${(PT + cH).toFixed(1)} L ${PL},${(PT + cH).toFixed(1)} Z`;

  const nearest = scrubIdx !== null ? TRIP_DATA[scrubIdx] : null;

  const handleMouse = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, (x - PL) / cW));
    const targetKm = frac * TOTAL_KM;
    let bestIdx = 0;
    let bestD = Math.abs(TRIP_DATA[0]!.km - targetKm);
    for (let i = 1; i < TRIP_DATA.length; i++) {
      const dd = Math.abs(TRIP_DATA[i]!.km - targetKm);
      if (dd < bestD) { bestIdx = i; bestD = dd; }
    }
    setScrubIdx(bestIdx);
    onScrub(bestIdx);
  }, [onScrub]);

  const handleLeave = useCallback(() => {
    setScrubIdx(null);
    onScrub(null);
  }, [onScrub]);

  return (
    <div style={{ borderTop: "1px solid #2A2A2A", paddingTop: 6 }}>
      <svg
        width={W} height={H}
        style={{ cursor: "crosshair", display: "block" }}
        onMouseMove={handleMouse}
        onMouseLeave={handleLeave}
      >
        <defs>
          <linearGradient id="alt_grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ALT_COLOR} stopOpacity="0.45" />
            <stop offset="1" stopColor={ALT_COLOR} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#alt_grad)" />
        <path d={linePath} stroke={ALT_COLOR} strokeWidth={2} fill="none" strokeLinejoin="round" />
        {nearest !== null && scrubIdx !== null && (
          <>
            <line x1={mx(nearest.km)} y1={PT} x2={mx(nearest.km)} y2={PT + cH}
              stroke="#FFFFFFCC" strokeWidth={1.5} />
            <circle cx={mx(nearest.km)} cy={my(nearest.alt)} r={5}
              fill="#FFFFFF" stroke={ALT_COLOR} strokeWidth={2} />
          </>
        )}
        <text x={PL - 3} y={PT + 6} textAnchor="end" fontSize={8} fill="#666">{MAX_ALT} m</text>
        <text x={PL - 3} y={PT + cH + 1} textAnchor="end" fontSize={8} fill="#666">{MIN_ALT} m</text>
        <text x={PL + 1} y={H - 2} textAnchor="start" fontSize={8} fill="#666">0</text>
        <text x={W - PR} y={H - 2} textAnchor="end" fontSize={8} fill="#666">{TOTAL_KM.toFixed(1)} km</text>
      </svg>

      {nearest ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "2px 2px 0" }}>
          <span style={{ color: "#CCCCCC", fontWeight: 700, fontSize: 20, lineHeight: 1 }}>
            {nearest.alt} m
          </span>
          <span style={{ color: "#555", fontSize: 12 }}>·</span>
          <span style={{ color: "#888", fontSize: 12 }}>{nearest.km.toFixed(2)} km</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 20, padding: "2px 2px 0" }}>
          {[
            ["MIN", `${MIN_ALT} m`],
            ["MAX", `${MAX_ALT} m`],
            ["DÉNIVELÉ +", `+${GAIN_M} m`],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "sans-serif" }}>{label}</div>
              <div style={{ color: "#E0E0E0", fontSize: 14, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main mockup ─────────────────────────────────────────────────────────────

export function TripCharts() {
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 5 | 10>(1);
  const [_scrubIdx, setScrubIdx] = useState<number | null>(null);

  const speeds = [1, 2, 5, 10] as const;

  return (
    <div style={{
      background: "#121212",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── Map placeholder ── */}
        <div style={{
          width: "100%",
          height: 240,
          borderRadius: "16px 16px 0 0",
          background: "#1E2A1E",
          position: "relative",
          overflow: "hidden",
          border: "1px solid #2A2A2A",
          borderBottom: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {/* fake map tiles */}
          <svg width="420" height="240" style={{ position: "absolute", inset: 0 }}>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1A2A1A" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="420" height="240" fill="#182218" />
            <rect width="420" height="240" fill="url(#grid)" />
            {/* fake roads */}
            <path d="M 30,200 Q 120,180 180,140 Q 240,100 300,80 Q 360,60 400,40"
              stroke="#2A3A2A" strokeWidth="8" fill="none" strokeLinecap="round"/>
            <path d="M 30,200 Q 120,180 180,140 Q 240,100 300,80 Q 360,60 400,40"
              stroke="#FF6B00" strokeWidth="3" fill="none" strokeLinecap="round"
              strokeDasharray="none" opacity="0.9"/>
            {/* start dot */}
            <circle cx="30" cy="200" r="6" fill="#4CAF50" />
            {/* end dot */}
            <circle cx="400" cy="40" r="6" fill="#F44336" />
          </svg>
          <div style={{ color: "#555", fontSize: 12, position: "relative", zIndex: 1 }}>
            carte
          </div>
        </div>

        {/* ── Bottom panel ── */}
        <div style={{
          background: "#1A1A1A",
          border: "1px solid #2A2A2A",
          borderRadius: "0 0 16px 16px",
          padding: "12px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>

          {/* Trip chip */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {["08:14 – 09:02", "10:30 – 11:05"].map((label, i) => (
              <div key={i} style={{
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingInline: 12,
                paddingBlock: 6,
                borderRadius: 10,
                background: i === 0 ? "#FF6B0022" : "#2A2A2A",
                border: `1.5px solid ${i === 0 ? TRIP_COLOR : "#3A3A3A"}`,
                cursor: "pointer",
              }}>
                <span style={{ fontSize: 10, color: i === 0 ? TRIP_COLOR : "#888", fontWeight: 700, letterSpacing: "0.5px" }}>
                  🏍 {label}
                </span>
                <span style={{ fontSize: 9, color: "#555", marginTop: 1 }}>
                  {i === 0 ? "27.4 km · 38 min" : "14.2 km · 21 min"}
                </span>
              </div>
            ))}
          </div>

          {/* Speed chart */}
          <div style={{ borderTop: "1px solid #2A2A2A", paddingTop: 8 }}>
            <div style={{ color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
              VITESSE
            </div>
            <SpeedChart onScrub={setScrubIdx} />
          </div>

          {/* Altitude chart */}
          <div style={{ paddingTop: 2 }}>
            <div style={{ color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4, borderTop: "1px solid #2A2A2A", paddingTop: 8 }}>
              ALTITUDE
            </div>
            <AltChart onScrub={setScrubIdx} />
          </div>

          {/* Replay bar */}
          <div style={{
            borderTop: "1px solid #2A2A2A",
            paddingTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            {speeds.map(s => (
              <button
                key={s}
                onClick={() => setReplaySpeed(s)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: `1px solid ${replaySpeed === s ? TRIP_COLOR : "#333"}`,
                  background: replaySpeed === s ? "#FF6B0018" : "#242424",
                  color: replaySpeed === s ? TRIP_COLOR : "#888",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.3px",
                }}
              >
                ×{s}
              </button>
            ))}
            <button style={{
              marginLeft: "auto",
              padding: "5px 16px",
              borderRadius: 10,
              border: `1px solid ${TRIP_COLOR}`,
              background: TRIP_COLOR,
              color: "#000",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.3px",
            }}>
              ▶ Replay
            </button>
          </div>
        </div>

        {/* Legend */}
        <p style={{ color: "#444", fontSize: 11, textAlign: "center", marginTop: 12 }}>
          Glisse sur les graphiques → curseur + marqueur sur la carte
        </p>
      </div>
    </div>
  );
}
