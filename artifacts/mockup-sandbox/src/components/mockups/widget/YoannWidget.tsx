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

  const tasks = [
    { color: RED,    title: 'Finaliser devis client Dupont', deadline: 'Auj.' },
    { color: ORANGE, title: 'Appel fournisseur matériaux', deadline: 'Dem.' },
    { color: GREEN,  title: 'Révision planning chantier', deadline: '18/06' },
    { color: YELLOW, title: 'Commander équipements sécurité', deadline: null },
  ];
  const appts = [
    { title: 'Réunion équipe', when: 'Auj. 14:00' },
    { title: 'Visite chantier Durand', when: 'Dem. 09:30' },
    { title: 'RDV notaire contrat', when: '20/06 10:00' },
  ];

  const navItems = [
    { svg: <ResetIcon />, label: 'Reset' },
    { svg: <TaskIcon />,  label: 'Tâche' },
    { svg: <IdeaIcon />,  label: 'Idée' },
    { svg: <RdvIcon />,   label: 'RDV' },
    { svg: <HomeIcon />,  label: 'Accueil' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1E1E1E',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Widget shell — Android home-screen dimensions */}
      <div style={{
        width: 340,
        background: BG,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
      }}>

        {/* ── BLOC 1 : Horaire travail ── */}
        <div style={{
          background: CARD,
          borderRadius: 10,
          padding: '10px 12px',
        }}>
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
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ color: YELLOW, fontSize: 12, fontWeight: 600 }}>9h00</div>
              <div style={{ color: MUTED, fontSize: 10 }}>aujourd'hui</div>
            </div>
          </div>
          {/* Barre de progression */}
          <div style={{
            marginTop: 8,
            height: 4,
            background: '#3A3A3A',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{ width: '62%', height: '100%', background: YELLOW, borderRadius: 2 }} />
          </div>
        </div>

        {/* ── BLOC 2 : Tâches ── */}
        <div style={{
          background: CARD,
          borderRadius: 10,
          padding: '8px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: YELLOW, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              📋 TÂCHES
            </span>
            <span style={{ color: MUTED, fontSize: 10 }}>4 / 11</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {tasks.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 8, height: 8,
                  borderRadius: '50%',
                  background: t.color,
                  flexShrink: 0,
                }} />
                <span style={{
                  color: TEXT,
                  fontSize: 11,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {t.title}
                </span>
                {t.deadline && (
                  <span style={{ color: MUTED, fontSize: 9, flexShrink: 0 }}>
                    {t.deadline}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── BLOC 3 : RDV ── */}
        <div style={{
          background: CARD,
          borderRadius: 10,
          padding: '8px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: YELLOW, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              📅 RENDEZ-VOUS
            </span>
            <span style={{ color: MUTED, fontSize: 10 }}>{appts.length} à venir</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {appts.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 8, height: 8,
                  borderRadius: 2,
                  background: YELLOW,
                  flexShrink: 0,
                }} />
                <span style={{
                  color: TEXT,
                  fontSize: 11,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {a.title}
                </span>
                <span style={{ color: YELLOW, fontSize: 9, flexShrink: 0 }}>
                  {a.when}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── BLOC 4 : Barre de navigation ── */}
        <div style={{
          background: NAVBAR,
          borderRadius: 10,
          padding: '6px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
        }}>
          {navItems.map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              flex: 1,
              cursor: 'pointer',
              padding: '4px 0',
            }}>
              {item.svg}
              <span style={{ color: YELLOW, fontSize: 8, fontWeight: 600 }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Icônes SVG jaunes ── */
const S: React.CSSProperties = { display: 'block' };
const STROKE = { stroke: '#FFC107', strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function ResetIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 48 48" style={S}>
      <path d="M9 18 A18 18 0 1 1 9 30" {...STROKE} />
      <polygon points="38,12 47,24 30,21" fill="#FFC107" stroke="none" />
    </svg>
  );
}
function TaskIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 48 48" style={S}>
      <polyline points="31,3 41,13 41,45 7,45 7,3 31,3" {...STROKE} />
      <polyline points="31,3 31,13 41,13" {...STROKE} />
      <line x1={15} y1={27} x2={33} y2={27} {...STROKE} />
      <line x1={24} y1={18} x2={24} y2={36} {...STROKE} />
    </svg>
  );
}
function IdeaIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 48 48" style={S}>
      <path d="M10 18 A14 14 0 0 1 38 18 L38 28 A4 4 0 0 1 34 32 L14 32 A4 4 0 0 1 10 28 Z" {...STROKE} />
      <line x1={17} y1={32} x2={17} y2={38} {...STROKE} />
      <line x1={31} y1={32} x2={31} y2={38} {...STROKE} />
      <line x1={15} y1={38} x2={33} y2={38} {...STROKE} />
      <line x1={20} y1={22} x2={28} y2={22} {...STROKE} />
      <line x1={24} y1={18} x2={24} y2={26} {...STROKE} />
    </svg>
  );
}
function RdvIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 48 48" style={S}>
      <rect x={6} y={11} width={36} height={34} rx={3} {...STROKE} />
      <line x1={6} y1={21} x2={42} y2={21} {...STROKE} />
      <line x1={16} y1={6} x2={16} y2={16} {...STROKE} />
      <line x1={32} y1={6} x2={32} y2={16} {...STROKE} />
      <line x1={22} y1={31} x2={26} y2={31} {...STROKE} />
      <line x1={24} y1={29} x2={24} y2={33} {...STROKE} />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 48 48" style={S}>
      <polyline points="4,24 24,4 44,24" {...STROKE} />
      <polyline points="10,24 10,45 38,45 38,24" {...STROKE} />
      <rect x={18} y={32} width={12} height={13} {...STROKE} />
    </svg>
  );
}
