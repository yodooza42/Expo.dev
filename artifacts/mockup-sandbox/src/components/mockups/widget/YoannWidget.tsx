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
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
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
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ color: YELLOW, fontSize: 12, fontWeight: 600 }}>9h00</div>
              <div style={{ color: MUTED, fontSize: 10 }}>aujourd'hui</div>
            </div>
          </div>
          <div style={{ marginTop: 8, height: 4, background: '#3A3A3A', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: '62%', height: '100%', background: YELLOW, borderRadius: 2 }} />
          </div>
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
          background: NAVBAR,
          borderRadius: 10,
          padding: '8px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
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

/* ── Icônes SVG jaunes reproduisant tes designs ── */
const C = '#FFC107';
const ST = { stroke: C, strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function IconReset() {
  return (
    <svg width={26} height={26} viewBox="0 0 48 48">
      {/* Cercle avec tête de serpent */}
      <path d="M38 10 A18 18 0 1 0 40 30" {...ST} />
      <circle cx={41} cy={9} r={3} fill={C} />
      <circle cx={39} cy={7} r={1} fill="#0D1B3E" />
    </svg>
  );
}

function IconTask() {
  return (
    <svg width={26} height={26} viewBox="0 0 48 48">
      {/* Document avec coin plié + croix */}
      <polyline points="30,4 42,16 42,44 6,44 6,4 30,4" {...ST} />
      <polyline points="30,4 30,16 42,16" {...ST} />
      <line x1={18} y1={30} x2={30} y2={30} {...ST} />
      <line x1={24} y1={24} x2={24} y2={36} {...ST} />
    </svg>
  );
}

function IconIdea() {
  return (
    <svg width={26} height={26} viewBox="0 0 48 48">
      {/* Ampoule + croix */}
      <path d="M16 30 Q9 24 9 17 A15 15 0 0 1 39 17 Q39 24 32 30 Z" {...ST} />
      <line x1={16} y1={30} x2={32} y2={30} {...ST} />
      <line x1={17} y1={35} x2={31} y2={35} {...ST} />
      <line x1={19} y1={40} x2={29} y2={40} {...ST} />
      <line x1={20} y1={21} x2={28} y2={21} {...ST} />
      <line x1={24} y1={17} x2={24} y2={25} {...ST} />
    </svg>
  );
}

function IconRdv() {
  return (
    <svg width={26} height={26} viewBox="0 0 48 48">
      {/* Calendrier + croix */}
      <rect x={6} y={10} width={36} height={34} rx={4} {...ST} />
      <line x1={6} y1={20} x2={42} y2={20} {...ST} />
      <line x1={15} y1={5} x2={15} y2={15} {...ST} />
      <line x1={33} y1={5} x2={33} y2={15} {...ST} />
      <line x1={20} y1={31} x2={28} y2={31} {...ST} />
      <line x1={24} y1={27} x2={24} y2={35} {...ST} />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width={26} height={26} viewBox="0 0 48 48">
      {/* Contour maison */}
      <polyline points="4,25 24,5 44,25" {...ST} />
      <polyline points="10,25 10,44 38,44 38,25" {...ST} />
      {/* Cerveau — hémisphère gauche avec bosses */}
      <path d="M12,40 L12,33 Q12,27 15,26 Q17,25 18,27 Q19,25 21,26 Q23,27 23,31 L23,40 Z" {...ST} />
      {/* Cerveau — hémisphère droit avec bosses */}
      <path d="M36,40 L36,33 Q36,27 33,26 Q31,25 30,27 Q29,25 27,26 Q25,27 25,31 L25,40 Z" {...ST} />
      {/* Trait central */}
      <line x1={24} y1={27} x2={24} y2={40} {...ST} strokeWidth={1.5} />
      {/* Sillons gauche */}
      <path d="M14,32 Q17,30 20,32" {...ST} strokeWidth={1.2} />
      <path d="M13,36 Q16,34 20,36" {...ST} strokeWidth={1.2} />
      {/* Sillons droit */}
      <path d="M34,32 Q31,30 28,32" {...ST} strokeWidth={1.2} />
      <path d="M35,36 Q32,34 28,36" {...ST} strokeWidth={1.2} />
    </svg>
  );
}
