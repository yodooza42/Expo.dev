import { useState } from 'react';

const CARD   = '#2A2A2A';
const NAVBAR = '#0D1B3E';
const YELLOW = '#FFC107';
const TEXT   = '#FFFFFF';
const MUTED  = '#9E9E9E';
const RED    = '#F44336';
const GREEN  = '#4CAF50';
const ORANGE = '#FF9800';
const CYAN   = '#00BCD4';

const MOCK_TASKS = [
  { color: RED,    title: 'Finaliser présentation projet',  deadline: '18 jun' },
  { color: ORANGE, title: 'Rappeler médecin Anna',          deadline: '19 jun' },
  { color: GREEN,  title: 'Révision planning semaine',      deadline: null },
  { color: YELLOW, title: 'Commander fournitures bureau',   deadline: null },
];

const MOCK_APPTS = [
  { title: "Réunion d'équipe",       when: "Auj. · 14h00" },
  { title: 'Visite scolaire Anna',   when: 'Mer. 19 · 09h30' },
  { title: 'RDV dentiste',           when: 'Jeu. 20 · 16h00' },
];

function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function Dot({ color }: { color: string }) {
  return (
    <div style={{
      width: 7, height: 7, borderRadius: '50%',
      background: color, flexShrink: 0,
    }} />
  );
}

function NavDivider() {
  return <div style={{ width: 1, height: 20, background: '#3A3A3A' }} />;
}

function NavBtn({ icon }: { icon: string }) {
  return (
    <div style={{
      flex: 1, height: 40, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
    </div>
  );
}

interface WidgetProps {
  healthSteps: number | null;
  healthSleepMin: number | null;
  pauseActive: boolean;
  nounouName: string;
  nounouColor: string;
  nounouPeriod: string;
  nounouDuration: string;
  marieCircleColor: string;
  todayDayNum: number;
  todayWork: string;
}

function Widget({
  healthSteps, healthSleepMin, pauseActive,
  nounouName, nounouColor, nounouPeriod, nounouDuration,
  marieCircleColor, todayDayNum, todayWork,
}: WidgetProps) {
  const isRepos = todayWork === 'Repos';
  const hasHealth = healthSteps != null || healthSleepMin != null;

  return (
    <div style={{
      width: 360,
      background: '#121212',
      borderRadius: 16,
      padding: '10px 12px 6px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>

      {/* ── Bloc 1 : Marie · Nounou · Santé · Travail · Pause ── */}
      <div style={{
        background: CARD, borderRadius: 12,
        padding: '10px 10px',
        display: 'flex', alignItems: 'center', gap: 0,
      }}>
        {/* ① Gauche : cercle Marie + Nounou */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: marieCircleColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>
              {todayDayNum}
            </span>
          </div>
          {nounouName && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{
                background: nounouColor + '33',
                borderRadius: 8, padding: '2px 7px',
                display: 'inline-block',
              }}>
                <span style={{ color: nounouColor, fontSize: 10, fontWeight: 'bold' }}>
                  {nounouName}
                </span>
              </div>
              <span style={{ color: TEXT, fontSize: 10 }}>{nounouPeriod}</span>
              <span style={{ color: MUTED, fontSize: 9 }}>{nounouDuration}</span>
            </div>
          )}
        </div>

        {/* ② Centre : santé (flex 1) */}
        <div style={{
          flex: 1,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 4,
        }}>
          {hasHealth && (
            <>
              {healthSteps != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11 }}>👟</span>
                  <span style={{ color: ORANGE, fontSize: 13, fontWeight: 'bold' }}>
                    {healthSteps.toLocaleString('fr-FR')}
                  </span>
                </div>
              )}
              {healthSleepMin != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11 }}>😴</span>
                  <span style={{ color: TEXT, fontSize: 13, fontWeight: 'bold' }}>
                    {formatSleep(healthSleepMin)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ③ Droite : travail + bouton pause */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10 }}>💼</span>
              <span style={{ color: MUTED, fontSize: 10 }}>Travail</span>
            </div>
            <span style={{
              color: isRepos ? MUTED : YELLOW,
              fontSize: 14, fontWeight: 'bold',
            }}>
              {todayWork}
            </span>
          </div>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: pauseActive ? GREEN : YELLOW,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, position: 'relative',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: '#1A1500',
              position: 'absolute',
            }} />
            <span style={{
              fontSize: 18,
              color: pauseActive ? GREEN : YELLOW,
              position: 'relative', zIndex: 1,
            }}>
              {pauseActive ? '⏸' : '▶'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Bloc 2 : Tâches ── */}
      <div style={{
        background: CARD, borderRadius: 12,
        padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11 }}>📋</span>
          <span style={{ color: MUTED, fontSize: 11 }}>Tâches</span>
          <span style={{ color: YELLOW, fontSize: 10, marginLeft: 2 }}>{MOCK_TASKS.length}</span>
        </div>
        {MOCK_TASKS.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            marginBottom: i < MOCK_TASKS.length - 1 ? 5 : 0,
          }}>
            <Dot color={t.color} />
            <span style={{
              color: TEXT, fontSize: 12, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {t.title}
            </span>
            {t.deadline && (
              <span style={{ color: MUTED, fontSize: 9, flexShrink: 0 }}>{t.deadline}</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Bloc 3 : Rendez-vous ── */}
      <div style={{
        background: CARD, borderRadius: 12,
        padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11 }}>📅</span>
          <span style={{ color: MUTED, fontSize: 11 }}>Rendez-vous</span>
          <span style={{ color: YELLOW, fontSize: 10, marginLeft: 2 }}>{MOCK_APPTS.length}</span>
        </div>
        {MOCK_APPTS.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            marginBottom: i < MOCK_APPTS.length - 1 ? 5 : 0,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: 2,
              background: YELLOW, flexShrink: 0,
            }} />
            <span style={{
              color: TEXT, fontSize: 12, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {a.title}
            </span>
            <span style={{ color: YELLOW, fontSize: 9, flexShrink: 0 }}>{a.when}</span>
          </div>
        ))}
      </div>

      {/* ── Bloc 4 : Barre de navigation ── */}
      <div style={{
        background: NAVBAR, borderRadius: 12,
        padding: '2px 4px',
        display: 'flex', alignItems: 'center',
      }}>
        <NavBtn icon="🔄" />
        <NavDivider />
        <NavBtn icon="✅" />
        <NavDivider />
        <NavBtn icon="💡" />
        <NavDivider />
        <NavBtn icon="📅" />
        <NavDivider />
        <NavBtn icon="🏠" />
      </div>
    </div>
  );
}

function AnnotationBadge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 6, padding: '1px 7px', fontSize: 10, fontWeight: 700,
      letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}

interface ChangeCardProps {
  taskId: string;
  title: string;
  color: string;
  items: { label: string; before?: string; after?: string; note?: string }[];
}

function ChangeCard({ taskId, title, color, items }: ChangeCardProps) {
  return (
    <div style={{
      background: '#1E1E2E',
      border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AnnotationBadge color={color} label={taskId} />
        <span style={{ color: '#E0E0E0', fontSize: 12, fontWeight: 700 }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: MUTED, fontSize: 10 }}>{item.label}</span>
            {item.before && item.after ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <code style={{
                  background: '#FF444422', color: '#FF7070',
                  fontSize: 10, borderRadius: 4, padding: '1px 5px',
                  textDecoration: 'line-through',
                }}>
                  {item.before}
                </code>
                <span style={{ color: MUTED, fontSize: 10 }}>→</span>
                <code style={{
                  background: '#4CAF5022', color: '#81C784',
                  fontSize: 10, borderRadius: 4, padding: '1px 5px',
                }}>
                  {item.after}
                </code>
              </div>
            ) : item.note ? (
              <span style={{ color: '#B0BEC5', fontSize: 10 }}>{item.note}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TodoAndroidWidget() {
  const [showSleep, setShowSleep] = useState(true);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0F0F1A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '32px 24px',
      gap: 24,
    }}>

      {/* ── Header ── */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 14 }}>📱</span>
          <span style={{ color: '#E0E0E0', fontSize: 14, fontWeight: 700 }}>
            Widget Android — Écran d'accueil
          </span>
        </div>
        <span style={{ color: MUTED, fontSize: 11 }}>360 × 280 px · État actuel · Données fictives</span>
      </div>

      {/* ── Toggle sommeil ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: MUTED, fontSize: 11 }}>Afficher le sommeil :</span>
        <button
          onClick={() => setShowSleep(s => !s)}
          style={{
            padding: '4px 14px', borderRadius: 20, border: 'none',
            cursor: 'pointer', fontSize: 11, fontWeight: 700,
            background: showSleep ? CYAN : '#333',
            color: showSleep ? '#000' : '#aaa',
          }}
        >
          {showSleep ? '😴 Activé' : '😴 Masqué'}
        </button>
        <span style={{ color: MUTED, fontSize: 10 }}>
          (task #28 : écriture dans AsyncStorage)
        </span>
      </div>

      {/* ── Widget principal ── */}
      <Widget
        healthSteps={8_234}
        healthSleepMin={showSleep ? 427 : null}
        pauseActive={false}
        nounouName="Isabelle"
        nounouColor={CYAN}
        nounouPeriod="08h30 → 15h00"
        nounouDuration="6h30"
        marieCircleColor="#2196F3"
        todayDayNum={17}
        todayWork="17h00 - 01h00"
      />

      {/* ── Séparateur ── */}
      <div style={{
        width: 360, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, height: 1, background: '#2A2A4A' }} />
        <span style={{ color: MUTED, fontSize: 10, whiteSpace: 'nowrap' }}>
          ✏️ Modifications en attente
        </span>
        <div style={{ flex: 1, height: 1, background: '#2A2A4A' }} />
      </div>

      {/* ── Annotations ── */}
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>

        <ChangeCard
          taskId="#25"
          title="Renommer les variables Garmin → Health Connect"
          color="#FF9800"
          items={[
            {
              label: 'Clé AsyncStorage',
              before: '@yoann2_garmin_health',
              after: '@yoann2_health_connect',
            },
            {
              label: 'Interface TypeScript',
              before: 'GarminHealthData',
              after: 'HealthConnectData',
            },
            {
              label: 'Hook React',
              before: 'useGarminHealth',
              after: 'useHealthConnect',
            },
            {
              label: 'Fichiers impactés',
              note: 'widgets/data.ts · hooks/useGarminHealth.ts · widgets/widgetSettings.ts',
            },
          ]}
        />

        <ChangeCard
          taskId="#28"
          title="Écrire sleepDurationMin dans AsyncStorage"
          color={CYAN}
          items={[
            {
              label: 'Problème actuel',
              note: 'useGarminHealth ne stocke pas sleepDurationMin → widget affiche toujours 😴 vide',
            },
            {
              label: 'Correction',
              note: 'Ajouter await AsyncStorage.setItem(HEALTH_KEY, JSON.stringify({...data, yesterday: { sleepDurationMin }})) dans useGarminHealth',
            },
            {
              label: 'Résultat visible ci-dessus',
              note: 'Le toggle "Afficher le sommeil" simule l\'état avant/après la correction',
            },
          ]}
        />
      </div>

      {/* ── Footer ── */}
      <div style={{
        color: '#3A3A5A', fontSize: 10, textAlign: 'center', paddingBottom: 8,
      }}>
        Mockup généré depuis TodoWidget.tsx · artifacts/yoann2/widgets/
      </div>
    </div>
  );
}
