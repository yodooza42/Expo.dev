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
    { src: '/icon-reset.png', label: 'Reset' },
    { src: '/icon-task.png',  label: 'Tâche' },
    { src: '/icon-idea.png',  label: 'Idée' },
    { src: '/icon-rdv.png',   label: 'RDV' },
    { src: '/icon-home.png',  label: 'Accueil' },
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
              <img src={item.src} alt={item.label} style={{ width: 24, height: 24, objectFit: 'contain' }} />
              <span style={{ color: YELLOW, fontSize: 8, fontWeight: 600 }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

