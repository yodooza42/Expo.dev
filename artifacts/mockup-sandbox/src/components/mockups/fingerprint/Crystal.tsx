import { useEffect, useRef } from 'react';

interface UserData {
  activeHours: number;
  tasksCompleted: number;
  projectsCount: number;
  avgSpending: number;
  consistencyScore: number;
}

const demoData: UserData = {
  activeHours: 14,
  tasksCompleted: 67,
  projectsCount: 8,
  avgSpending: 2400,
  consistencyScore: 73,
};

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function Crystal() {
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

    const bg = '#121212';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;

    // Subtle grid background
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.03)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < size; i += 25) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    // Crystal facets based on data
    const facetCount = 6 + Math.floor(demoData.projectsCount);
    const maxRadius = 180;

    const vertices: { x: number; y: number; r: number; a: number }[] = [];
    for (let i = 0; i < facetCount; i++) {
      const angle = (i / facetCount) * Math.PI * 2 + seededRandom(i + demoData.activeHours) * 0.3;
      const radius = maxRadius * (0.5 + seededRandom(i * 3 + 42) * 0.5);
      vertices.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: radius,
        a: angle,
      });
    }

    // Draw facets
    for (let i = 0; i < facetCount; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % facetCount];
      const v3 = vertices[(i + 2) % facetCount];

      // Inner triangle facet
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.closePath();

      const brightness = 0.05 + seededRandom(i * 7 + demoData.tasksCompleted) * 0.15;
      const hue = 45 + seededRandom(i * 13) * 15; // warm golds
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${brightness})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 193, 7, ${0.15 + demoData.consistencyScore / 400})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Outer edge highlight
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.strokeStyle = `rgba(255, 193, 7, ${0.2 + (demoData.avgSpending / 5000) * 0.3})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Center crystal core
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    const coreGrad = ctx.createRadialGradient(cx - 5, cy - 5, 0, cx, cy, 18);
    coreGrad.addColorStop(0, 'rgba(255, 220, 120, 0.8)');
    coreGrad.addColorStop(1, 'rgba(255, 193, 7, 0.2)');
    ctx.fillStyle = coreGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Connection lines between vertices
    for (let i = 0; i < facetCount; i++) {
      for (let j = i + 2; j < facetCount; j++) {
        if (Math.abs(i - j) > 2 && Math.abs(i - j) < facetCount - 2) continue;
        const v1 = vertices[i];
        const v2 = vertices[j];
        ctx.beginPath();
        ctx.moveTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.06)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
    }

    // Data pulse dots at vertices
    vertices.forEach((v, i) => {
      const pulseSize = 2 + (demoData.tasksCompleted / 100) * 4 * seededRandom(i + 99);
      ctx.beginPath();
      ctx.arc(v.x, v.y, pulseSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 193, 7, ${0.4 + seededRandom(i) * 0.4})`;
      ctx.fill();
    });

    // Decorative corner marks
    const cornerSize = 30;
    const corners = [
      [cornerSize, cornerSize],
      [size - cornerSize, cornerSize],
      [size - cornerSize, size - cornerSize],
      [cornerSize, size - cornerSize],
    ];
    corners.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y);
      ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5);
      ctx.strokeStyle = 'rgba(255, 193, 7, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, []);

  return (
    <div style={{ background: '#121212', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <canvas ref={canvasRef} />
      <div style={{ color: '#FFC107', fontFamily: 'system-ui', fontSize: 14, marginTop: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
        EMPREINTE YOANN · STYLE CRISTAL
      </div>
    </div>
  );
}
