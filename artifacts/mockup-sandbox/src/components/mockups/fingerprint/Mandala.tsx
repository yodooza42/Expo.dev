import { useEffect, useRef } from 'react';

interface UserData {
  activeHours: number;       // 0-24
  tasksCompleted: number;    // 0-100
  projectsCount: number;     // 0-20
  avgSpending: number;       // 0-5000
  consistencyScore: number;  // 0-100
}

const demoData: UserData = {
  activeHours: 14,
  tasksCompleted: 67,
  projectsCount: 8,
  avgSpending: 2400,
  consistencyScore: 73,
};

function hashToAngle(seed: number) {
  return ((seed * 137.5) % 360) * (Math.PI / 180);
}

function hashToRadius(seed: number, max: number) {
  return ((seed * 7.3) % max);
}

export function Mandala() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 500;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const bg = '#121212';
    const gold = '#FFC107';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // Glow from center
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.6);
    glow.addColorStop(0, 'rgba(255, 193, 7, 0.08)');
    glow.addColorStop(1, 'rgba(18, 18, 18, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    const layers = 5;
    for (let layer = 1; layer <= layers; layer++) {
      const radius = 40 + layer * 38;
      const segments = 6 + layer * 3 + Math.floor(demoData.projectsCount / 2);
      const offsetAngle = hashToAngle(demoData.activeHours + layer * 37);

      for (let i = 0; i < segments; i++) {
        const angle = offsetAngle + (i / segments) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;

        // Connection to center
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `rgba(255, 193, 7, ${0.1 + layer * 0.03})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Dot at intersection
        const dotSize = 2 + (demoData.tasksCompleted / 100) * (layer / layers) * 4;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = gold;
        ctx.fill();

        // Arc between adjacent points
        const nextAngle = offsetAngle + ((i + 1) / segments) * Math.PI * 2;
        const nx = cx + Math.cos(nextAngle) * radius;
        const ny = cy + Math.sin(nextAngle) * radius;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(cx, cy, radius, angle, nextAngle);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = `rgba(255, 193, 7, ${0.08 + demoData.consistencyScore / 500})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Inner core — energy nucleus
    const coreRings = 3;
    for (let r = 0; r < coreRings; r++) {
      const cr = 8 + r * 12;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 193, 7, ${0.3 - r * 0.08})`;
      ctx.lineWidth = 1.5 - r * 0.3;
      ctx.stroke();
    }

    // Golden phoenix-like rays
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const len = 80 + (demoData.activeHours / 24) * 40;
      const x1 = cx + Math.cos(angle) * 30;
      const y1 = cy + Math.sin(angle) * 30;
      const x2 = cx + Math.cos(angle) * len;
      const y2 = cy + Math.sin(angle) * len;

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, 'rgba(255, 193, 7, 0.5)');
      grad.addColorStop(1, 'rgba(255, 193, 7, 0)');

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Outer ring with spending data
    const outerRadius = 220;
    const outerSegments = 24;
    for (let i = 0; i < outerSegments; i++) {
      const startAngle = (i / outerSegments) * Math.PI * 2;
      const endAngle = ((i + 1) / outerSegments) * Math.PI * 2;
      const active = i < (demoData.avgSpending / 5000) * outerSegments;

      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
      ctx.strokeStyle = active ? 'rgba(255, 193, 7, 0.6)' : 'rgba(255, 193, 7, 0.05)';
      ctx.lineWidth = active ? 2 : 0.5;
      ctx.stroke();
    }
  }, []);

  return (
    <div style={{ background: '#121212', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <canvas ref={canvasRef} />
      <div style={{ color: '#FFC107', fontFamily: 'system-ui', fontSize: 14, marginTop: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
        EMPREINTE YOANN · STYLE MANDALA
      </div>
    </div>
  );
}
