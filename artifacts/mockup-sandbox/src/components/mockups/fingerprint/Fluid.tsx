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

function noise(t: number) {
  return Math.sin(t) * 0.5 + Math.sin(t * 2.3) * 0.25 + Math.sin(t * 4.7) * 0.125;
}

export function Fluid() {
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

    // Flow lines based on active hours and consistency
    const lineCount = 12 + Math.floor(demoData.projectsCount * 1.5);
    const baseRadius = 60;

    for (let i = 0; i < lineCount; i++) {
      const seed = i * 17 + demoData.activeHours * 3;
      const startAngle = (i / lineCount) * Math.PI * 2;
      const wobble = demoData.consistencyScore / 100; // 0 = chaotic, 1 = smooth

      ctx.beginPath();
      let x = cx + Math.cos(startAngle) * baseRadius;
      let y = cy + Math.sin(startAngle) * baseRadius;
      ctx.moveTo(x, y);

      const steps = 60;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const radius = baseRadius + t * (180 + demoData.avgSpending / 30);
        const angle = startAngle + t * Math.PI * (0.5 + (1 - wobble) * noise(seed + t * 8));
        x = cx + Math.cos(angle) * radius;
        y = cy + Math.sin(angle) * radius;
        ctx.lineTo(x, y);
      }

      const alpha = 0.08 + (demoData.tasksCompleted / 100) * 0.2;
      ctx.strokeStyle = `rgba(255, 193, 7, ${alpha})`;
      ctx.lineWidth = 1 + (demoData.consistencyScore / 100) * 2;
      ctx.stroke();
    }

    // Organic blobs / islands
    const blobCount = 5 + Math.floor(demoData.projectsCount / 2);
    for (let i = 0; i < blobCount; i++) {
      const seed = i * 31 + 100;
      const angle = (i / blobCount) * Math.PI * 2 + 0.5;
      const dist = 100 + (demoData.avgSpending / 5000) * 80;
      const bx = cx + Math.cos(angle) * dist;
      const by = cy + Math.sin(angle) * dist;
      const br = 15 + noise(seed) * 20 + (demoData.tasksCompleted / 100) * 10;

      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.15) {
        const r = br + noise(seed + a * 3) * 8;
        const px = bx + Math.cos(a) * r;
        const py = by + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const blobGrad = ctx.createRadialGradient(bx, by, 0, bx, by, br * 1.5);
      blobGrad.addColorStop(0, `rgba(255, 193, 7, ${0.15 + demoData.consistencyScore / 300})`);
      blobGrad.addColorStop(1, 'rgba(255, 193, 7, 0)');
      ctx.fillStyle = blobGrad;
      ctx.fill();
    }

    // Ripple rings from center
    const ringCount = 4 + Math.floor(demoData.activeHours / 4);
    for (let i = 0; i < ringCount; i++) {
      const r = 40 + i * 35 + noise(i * 10 + demoData.consistencyScore) * 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 193, 7, ${0.04 + (demoData.tasksCompleted / 100) * 0.06})`;
      ctx.lineWidth = 0.5 + i * 0.2;
      ctx.stroke();
    }

    // Central vortex core
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50);
    coreGrad.addColorStop(0, 'rgba(255, 220, 120, 0.15)');
    coreGrad.addColorStop(0.5, 'rgba(255, 193, 7, 0.05)');
    coreGrad.addColorStop(1, 'rgba(18, 18, 18, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Small particles
    const particleCount = 30 + Math.floor(demoData.tasksCompleted / 2);
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 7 + demoData.activeHours * 2;
      const pa = (i / particleCount) * Math.PI * 2 + noise(seed) * 2;
      const pr = 80 + noise(seed + 10) * 120;
      const px = cx + Math.cos(pa) * pr;
      const py = cy + Math.sin(pa) * pr;
      const ps = 1 + noise(seed + 20) * 2;

      ctx.beginPath();
      ctx.arc(px, py, ps, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 200, 80, ${0.3 + noise(seed + 30) * 0.5})`;
      ctx.fill();
    }

    // Top and bottom thin accent lines
    ctx.beginPath();
    ctx.moveTo(60, 40); ctx.lineTo(140, 40);
    ctx.moveTo(size - 140, size - 40); ctx.lineTo(size - 60, size - 40);
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, []);

  return (
    <div style={{ background: '#121212', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <canvas ref={canvasRef} />
      <div style={{ color: '#FFC107', fontFamily: 'system-ui', fontSize: 14, marginTop: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
        EMPREINTE YOANN · STYLE FLUIDE
      </div>
    </div>
  );
}
