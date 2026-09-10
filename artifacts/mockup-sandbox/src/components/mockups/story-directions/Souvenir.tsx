import './_group.css';

import { DEMO_OPTIONS, DEMO_ROUTE_PATH } from './_data';

const photoUrl = '/__mockup/images/stories-dronne-demo.jpg';

export function Souvenir() {
  const { dateLabel, timeLabel, distKm, durationLabel, averagePaceLabel, gainM, placeLabel, walkParticipants } =
    DEMO_OPTIONS;

  return (
    <article className="souvenir-story" aria-label="Souvenir de balade à Brantôme">
      <style>{`
        .souvenir-story {
          --ink: #193b3c;
          --mist: #d8e4da;
          --paper: #e9e4cf;
          --sun: #e2a952;
          --river: #9dc9c9;
          position: relative; width: 100%; height: 100dvh; min-height: 640px; overflow: hidden;
          color: var(--ink); background: #b7d0cf;
          font-family: Georgia, 'Times New Roman', serif;
        }
        .souvenir-story *, .souvenir-story *::before, .souvenir-story *::after { box-sizing: border-box; }
        .souvenir-photo { position:absolute; inset:0; width:100%; height:62.5%; object-fit:cover; object-position:49% 53%; filter:saturate(.87) contrast(.96) sepia(.08); transform:scale(1.03); animation:souvenir-settle 1.8s cubic-bezier(.2,.75,.25,1) both; }
        .souvenir-wash { position:absolute; inset:0 0 auto; height:66%; background:linear-gradient(180deg, rgba(19,44,45,.45) 0%, rgba(19,44,45,.04) 44%, rgba(19,44,45,.35) 96%); }
        .souvenir-date { position:absolute; top:5.1%; left:0; width:100%; text-align:center; color:#f4f0df; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:9px; font-weight:700; letter-spacing:2.1px; text-transform:uppercase; text-shadow:0 1px 7px rgba(0,0,0,.26); }
        .souvenir-place { position:absolute; top:8%; left:7%; right:7%; color:#f7f0db; text-shadow:0 2px 15px rgba(8,28,28,.38); }
        .souvenir-place h1 { margin:0; font-size:clamp(35px, 10vw, 54px); line-height:.89; font-weight:400; letter-spacing:-2.5px; }
        .souvenir-place p { margin:8px 0 0; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:9px; letter-spacing:1.4px; text-transform:uppercase; }
        .souvenir-caption { position:absolute; left:7%; right:14%; bottom:40.5%; color:#f8f3df; font-size:19px; line-height:1.05; font-style:italic; text-shadow:0 1px 12px rgba(8,30,29,.7); }
        .souvenir-caption span { display:block; margin-top:8px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-style:normal; font-size:8px; letter-spacing:1.4px; text-transform:uppercase; opacity:.88; }
        .souvenir-card { position:absolute; left:0; right:0; bottom:0; height:43%; padding:19px 7% 16px; background:var(--paper); border-radius:24px 24px 0 0; box-shadow:0 -11px 32px rgba(18,54,53,.14); }
        .souvenir-card::before { content:''; position:absolute; top:11px; left:50%; width:31px; height:3px; transform:translateX(-50%); border-radius:6px; background:#b6af95; }
        .souvenir-people { margin:4px 0 13px; display:flex; align-items:center; gap:9px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; color:#405c5a; font-size:9px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
        .souvenir-avatars { display:flex; padding-left:5px; }
        .souvenir-avatar { display:grid; place-items:center; width:24px; height:24px; margin-left:-5px; border:2px solid var(--paper); border-radius:50%; background:#466d69; color:#f6eed5; font-family:Georgia,serif; font-size:10px; }
        .souvenir-avatar + .souvenir-avatar { background:#bb7b50; }
        .souvenir-route-row { display:flex; align-items:center; gap:12px; min-height:78px; }
        .souvenir-route { width:78px; height:78px; flex:none; overflow:visible; }
        .souvenir-route path.ghost { fill:none; stroke:#8ca9a2; stroke-width:12; stroke-linecap:round; stroke-linejoin:round; opacity:.24; }
        .souvenir-route path.live { fill:none; stroke:#285b5a; stroke-width:8; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1300; stroke-dashoffset:1300; animation:souvenir-route 1.8s .25s cubic-bezier(.35,.8,.3,1) forwards; }
        .souvenir-route circle { fill:#e2a952; stroke:#e9e4cf; stroke-width:7; }
        .souvenir-route .end { fill:#e9e4cf; stroke:#285b5a; stroke-width:6; }
        .souvenir-route-copy { min-width:0; }
        .souvenir-route-copy h2 { margin:0; font-size:21px; line-height:.98; font-weight:400; letter-spacing:-.7px; }
        .souvenir-route-copy p { margin:7px 0 0; color:#58726d; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:9px; letter-spacing:.6px; }
        .souvenir-metrics { display:grid; grid-template-columns:1.15fr .85fr 1fr; gap:0; margin-top:15px; padding:13px 0 11px; border-top:1px solid #b5bfaa; border-bottom:1px solid #b5bfaa; }
        .souvenir-metric { padding-left:11px; border-left:1px solid #c6c7ae; }
        .souvenir-metric:first-child { padding-left:0; border-left:0; }
        .souvenir-metric strong { display:block; font-size:22px; line-height:1; font-weight:400; letter-spacing:-1px; }
        .souvenir-metric span { display:block; margin-top:5px; color:#59706a; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:7px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; }
        .souvenir-note { margin:12px 0 0; color:#66807a; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:7px; letter-spacing:.4px; }
        @keyframes souvenir-route { to { stroke-dashoffset:0; } }
        @keyframes souvenir-settle { from { transform:scale(1.1); } to { transform:scale(1.03); } }
        @media (prefers-reduced-motion: reduce) { .souvenir-photo { animation:none; } .souvenir-route path.live { animation:none; stroke-dashoffset:0; } }
      `}</style>

      <img className="souvenir-photo" src={photoUrl} alt="" />
      <div className="souvenir-wash" />
      <div className="souvenir-date">{dateLabel} · {timeLabel}</div>
      <header className="souvenir-place">
        <h1>Brantôme</h1>
        <p>Les bords de Dronne</p>
      </header>
      <div className="souvenir-caption">
        Le matin a pris son temps.
        <span>Une balade illustrée</span>
      </div>

      <section className="souvenir-card">
        <div className="souvenir-people">
          <div className="souvenir-avatars"><span className="souvenir-avatar">Y</span><span className="souvenir-avatar">M</span></div>
          Avec {walkParticipants.join(' & ')}
        </div>
        <div className="souvenir-route-row">
          <svg className="souvenir-route" viewBox="0 0 360 360" aria-label="Tracé illustratif de la balade">
            <path className="ghost" d={DEMO_ROUTE_PATH} />
            <path className="live" d={DEMO_ROUTE_PATH} pathLength="1300" />
            <circle cx="143" cy="326" r="11" />
            <circle className="end" cx="144" cy="273" r="9" />
          </svg>
          <div className="souvenir-route-copy">
            <h2>Une boucle<br />au bord de l&apos;eau</h2>
            <p>Itinéraire illustratif · {distKm.toFixed(2).replace('.', ',')} km</p>
          </div>
        </div>
        <div className="souvenir-metrics">
          <div className="souvenir-metric"><strong>{distKm.toFixed(2).replace('.', ',')} km</strong><span>Distance</span></div>
          <div className="souvenir-metric"><strong>{durationLabel}</strong><span>En chemin</span></div>
          <div className="souvenir-metric"><strong>+{gainM} m</strong><span>Dénivelé</span></div>
        </div>
        <p className="souvenir-note">Allure moyenne {averagePaceLabel} · données de démonstration</p>
      </section>
    </article>
  );
}