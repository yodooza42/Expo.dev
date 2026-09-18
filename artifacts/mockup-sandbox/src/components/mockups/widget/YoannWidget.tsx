import { useState, useEffect } from 'react';

export function YoannWidget() {
  const BG     = '#121212';
  const CARD   = '#2A2A2A';
  const NAVBAR = '#0D1B3E';
  const YELLOW = '#FFC107';
  const TEXT   = '#FFFFFF';
  const MUTED  = '#9E9E9E';
  const RED    = '#F44336';
  const GREEN  = '#4CAF50';
  const ORANGE = '#FF9800';

  /* ── Demo : bascule avant / pendant le travail ── */
  const [mode, setMode] = useState<'before' | 'during'>('before');

  /* ── Countdown avant embauche ── */
  const WORK_H = 7, WORK_M = 30;           // embauche 07:30
  const TRAVEL_MIN = 30;                    // 30 min de trajet
  const depart = `${String(WORK_H).padStart(2,'0')}:${String(WORK_M - TRAVEL_MIN).padStart(2,'0')}`;

  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (mode !== 'before') return;
    const tick = () => {
      const now = new Date();
      const departDate = new Date();
      departDate.setHours(WORK_H, WORK_M - TRAVEL_MIN, 0, 0);
      const diff = Math.max(0, departDate.getTime() - now.getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [mode]);

  /* ── Compteur de pauses (pendant travail) ── */
  const [pauseRunning, setPauseRunning] = useState(false);
  const [pauseSecs, setPauseSecs]       = useState(0);
  useEffect(() => {
    if (!pauseRunning) return;
    const t = setInterval(() => setPauseSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [pauseRunning]);

  const pauseH  = Math.floor(pauseSecs / 3600);
  const pauseM  = Math.floor((pauseSecs % 3600) / 60);
  const pauseS  = pauseSecs % 60;
  const pauseStr = pauseH > 0
    ? `${pauseH}h${String(pauseM).padStart(2,'0')}`
    : `${String(pauseM).padStart(2,'0')}:${String(pauseS).padStart(2,'0')}`;

  /* ── Progression journée (62 % = exemple : 11h10 sur 9h de travail) ── */
  const progress = 62;

  const tasks = [
    { color: RED,    title: 'Finaliser devis client Dupont', deadline: 'Auj.' },
    { color: ORANGE, title: 'Appel fournisseur matériaux',   deadline: 'Dem.' },
    { color: GREEN,  title: 'Révision planning chantier',    deadline: '18/06' },
    { color: YELLOW, title: 'Commander équipements sécurité', deadline: null },
  ];
  const appts = [
    { title: 'Réunion équipe',          when: 'Auj. 14:00' },
    { title: 'Visite chantier Durand',  when: 'Dem. 09:30' },
    { title: 'RDV notaire contrat',     when: '20/06 10:00' },
  ];
  const navItems = [
    { icon: <IconReset />,  label: 'Reset' },
    { icon: <IconTask />,   label: 'Tâche' },
    { icon: <IconIdea />,   label: 'Idée' },
    { icon: <IconRdv />,    label: 'RDV' },
    { icon: <IconHome />,   label: 'Accueil' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1A1A2E',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      gap: 12,
    }}>

      {/* ── Toggle de démonstration ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['before', 'during'] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); setPauseRunning(false); setPauseSecs(0); }} style={{
            padding: '4px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
            background: mode === m ? YELLOW : '#333', color: mode === m ? '#000' : '#aaa', fontWeight: 700,
          }}>
            {m === 'before' ? '🕐 Avant embauche' : '💼 Pendant travail'}
          </button>
        ))}
      </div>

      {/* ── Widget ── */}
      <div style={{
        width: 340,
        background: BG,
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
      }}>

        {/* ── BLOC 1 : Horaire travail ── */}
        <div style={{ background: CARD, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: YELLOW, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              ⏱ HORAIRE TRAVAIL
            </span>
            <span style={{ color: MUTED, fontSize: 10 }}>Lun 15/06</span>
          </div>

          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: TEXT, fontSize: 22, fontWeight: 700 }}>07:30</span>
            <span style={{ color: MUTED, fontSize: 14 }}>→</span>
            <span style={{ color: TEXT, fontSize: 22, fontWeight: 700 }}>16:30</span>

            {/* Zone droite : varie selon le mode */}
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              {mode === 'before' ? (
                /* ── Avant embauche : départ + countdown ── */
                <>
                  <div style={{ color: ORANGE, fontSize: 11, fontWeight: 700 }}>
                    🚗 Partir à {depart}
                  </div>
                  <div style={{ color: YELLOW, fontSize: 13, fontWeight: 800, letterSpacing: 1, marginTop: 1 }}>
                    {countdown}
                  </div>
                </>
              ) : (
                /* ── Pendant travail : pause counter + play/pause ── */
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: pauseRunning ? ORANGE : MUTED, fontSize: 11, fontWeight: 700 }}>
                      ☕ Pause
                    </div>
                    <div style={{ color: pauseRunning ? ORANGE : TEXT, fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>
                      {pauseStr}
                    </div>
                  </div>
                  <button
                    onClick={() => setPauseRunning(r => !r)}
                    style={{
                      width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: pauseRunning ? ORANGE : YELLOW,
                      color: '#000', fontSize: 14, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}
                  >
                    {pauseRunning ? '⏸' : '▶'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Barre de progression (masquée avant embauche) */}
          {mode === 'during' && (
            <div style={{ marginTop: 8, height: 4, background: '#3A3A3A', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: YELLOW, borderRadius: 2 }} />
            </div>
          )}

          {/* Ligne avant embauche : barre vide + label */}
          {mode === 'before' && (
            <div style={{ marginTop: 8, height: 4, background: '#3A3A3A', borderRadius: 2 }} />
          )}
        </div>

        {/* ── BLOC 2 : Tâches ── */}
        <div style={{ background: CARD, borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: YELLOW, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>📋 TÂCHES</span>
            <span style={{ color: MUTED, fontSize: 10 }}>4 / 11</span>
          </div>
          {tasks.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: i < tasks.length - 1 ? 5 : 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              <span style={{ color: TEXT, fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              {t.deadline && <span style={{ color: MUTED, fontSize: 9 }}>{t.deadline}</span>}
            </div>
          ))}
        </div>

        {/* ── BLOC 3 : RDV ── */}
        <div style={{ background: CARD, borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: YELLOW, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>📅 RENDEZ-VOUS</span>
            <span style={{ color: MUTED, fontSize: 10 }}>3 à venir</span>
          </div>
          {appts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: i < appts.length - 1 ? 5 : 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: YELLOW, flexShrink: 0 }} />
              <span style={{ color: TEXT, fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </span>
              <span style={{ color: YELLOW, fontSize: 9 }}>{a.when}</span>
            </div>
          ))}
        </div>

        {/* ── BLOC 4 : Barre de navigation ── */}
        <div style={{
          background: NAVBAR, borderRadius: 10, padding: '8px 4px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        }}>
          {navItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '4px 0' }}>
              {item.icon}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

/* ── Icônes PNG ── */
function IconReset() {
  return <img src='/__mockup/icon-reset-v2.png' alt='Reset' style={{width:28,height:28,objectFit:'contain'}} />;
}
function IconTask() {
  return <img src='/__mockup/icon-task-v2.png' alt='Tâche' style={{width:28,height:28,objectFit:'contain'}} />;
}
function IconIdea() {
  return <img src='/__mockup/icon-idea-v2.png' alt='Idée' style={{width:28,height:28,objectFit:'contain'}} />;
}
function IconRdv() {
  return <img src='/__mockup/icon-rdv-v2.png' alt='RDV' style={{width:28,height:28,objectFit:'contain'}} />;
}
function IconHome() {
  return <img src='/__mockup/icon-home-v2.png' alt='Accueil' style={{width:28,height:28,objectFit:'contain'}} />;
}
