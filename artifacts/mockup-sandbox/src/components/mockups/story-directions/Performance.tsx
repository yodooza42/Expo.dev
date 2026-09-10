import './_group.css';

import { DEMO_OPTIONS, DEMO_POINTS, DEMO_ROUTE_PATH } from './_data';

const pacePoints = DEMO_POINTS.map((point, index) => {
  const x = 4 + (index / (DEMO_POINTS.length - 1)) * 92;
  const y = 25 - ((point.spd - 4.3) / (5.6 - 4.3)) * 19;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(' ');

export function Performance() {
  return (
    <main className="performance-story" aria-label="Story sportive, Balade Les bords de Dronne">
      <style>{`
        .performance-story {
          --ink: #102b37;
          --paper: #f0ead9;
          --sun: #f05c37;
          --mist: #aac7c3;
          --blue: #7eb9cc;
          width: 100%;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: var(--ink);
          color: var(--ink);
          font-family: "Outfit", "Avenir Next", sans-serif;
        }
        .performance-story *, .performance-story *::before, .performance-story *::after { box-sizing: border-box; }
        .performance-story__art {
          position: relative;
          width: min(100vw, calc(100dvh * .5625));
          height: min(100dvh, calc(100vw * 1.77778));
          min-width: 360px;
          min-height: 640px;
          overflow: hidden;
          background: var(--paper);
          isolation: isolate;
        }
        @media (max-width: 359px), (max-height: 639px) {
          .performance-story__art { transform: scale(min(calc(100vw / 360), calc(100dvh / 640))); transform-origin: center; }
        }
        .performance-story__photo {
          position: absolute; inset: 0 0 auto; height: 226px;
          background: linear-gradient(180deg, rgba(16,43,55,.10), rgba(16,43,55,.88)), url("/__mockup/images/stories-dronne-demo.jpg") center 53% / cover;
          filter: saturate(.82) contrast(1.04);
        }
        .performance-story__grain { position:absolute; inset:0; opacity:.12; pointer-events:none; z-index:8; background-image: radial-gradient(rgba(16,43,55,.55) .5px, transparent .7px); background-size: 4px 4px; mix-blend-mode:multiply; }
        .performance-story__mast {
          position:absolute; z-index:2; top:0; left:0; right:0; padding:17px 19px;
          display:flex; justify-content:space-between; align-items:flex-start; color:#f6f0e0;
          font-family: "Space Mono", monospace; font-size:8px; letter-spacing:.12em; line-height:1.45;
        }
        .performance-story__chip { border:1px solid rgba(246,240,224,.75); border-radius:20px; padding:5px 8px; font-size:7px; }
        .performance-story__title { position:absolute; z-index:2; top:112px; left:19px; color:#f6f0e0; }
        .performance-story__title p { margin:0 0 5px; font-family:"Space Mono",monospace; font-size:8px; letter-spacing:.16em; }
        .performance-story__title h1 { max-width:260px; margin:0; font-size:25px; font-weight:800; letter-spacing:-.065em; line-height:.92; }
        .performance-story__runway { position:absolute; z-index:3; top:196px; left:0; right:0; height:111px; background:var(--sun); transform:skewY(-4deg); transform-origin:left; }
        .performance-story__runway > div { transform:skewY(4deg); height:100%; }
        .performance-story__distance {
          position:absolute; left:17px; top:204px; z-index:4; color:var(--ink); line-height:.76; font-weight:900; letter-spacing:-.06em; font-size:78px;
        }
        .performance-story__distance small { font-size:19px; letter-spacing:-.05em; vertical-align:18px; margin-left:4px; }
        .performance-story__distance-label { position:absolute; top:276px; left:21px; z-index:5; font-family:"Space Mono",monospace; font-size:8px; font-weight:bold; letter-spacing:.15em; }
        .performance-story__pace {
          position:absolute; z-index:5; top:216px; right:18px; width:95px; color:var(--ink); border-left:1px solid rgba(16,43,55,.45); padding-left:11px;
        }
        .performance-story__pace strong { display:block; white-space:nowrap; font-family:"Space Mono",monospace; font-size:19px; letter-spacing:-.08em; }
        .performance-story__pace strong small { font-size:9px; letter-spacing:0; }
        .performance-story__pace span { display:block; margin-top:5px; font-family:"Space Mono",monospace; font-size:7px; line-height:1.3; letter-spacing:.1em; }
        .performance-story__profile { position:absolute; z-index:5; top:259px; right:17px; width:99px; height:28px; }
        .performance-story__map {
          position:absolute; z-index:1; top:310px; left:0; right:0; height:207px; overflow:hidden; background:var(--mist);
        }
        .performance-story__map::before, .performance-story__map::after { content:""; position:absolute; border:1px solid rgba(16,43,55,.16); border-radius:50%; }
        .performance-story__map::before { width:280px; height:280px; left:-93px; top:-108px; }
        .performance-story__map::after { width:225px; height:225px; right:-84px; bottom:-105px; }
        .performance-story__map-label { position:absolute; z-index:2; top:16px; left:19px; font-family:"Space Mono",monospace; font-weight:bold; letter-spacing:.12em; font-size:8px; }
        .performance-story__route { position:absolute; z-index:2; top:7px; left:83px; width:194px; height:194px; transform:rotate(-7deg); }
        .performance-story__route path { fill:none; stroke-linecap:round; stroke-linejoin:round; }
        .performance-story__route .ghost { stroke:rgba(16,43,55,.27); stroke-width:3.5; }
        .performance-story__route .active { stroke:var(--sun); stroke-width:5.5; stroke-dasharray:1000; stroke-dashoffset:1000; animation: performance-route 1.8s cubic-bezier(.2,.8,.2,1) .18s forwards; }
        .performance-story__route .start { fill:var(--ink); stroke:var(--paper); stroke-width:2.5; }
        .performance-story__route .finish { fill:var(--sun); stroke:var(--ink); stroke-width:2.5; }
        .performance-story__scale { position:absolute; z-index:3; right:19px; bottom:13px; font:7px "Space Mono",monospace; letter-spacing:.1em; }
        .performance-story__scale::before { content:""; display:inline-block; width:26px; border-top:2px solid var(--ink); margin:0 6px 3px 0; }
        .performance-story__facts {
          position:absolute; bottom:0; left:0; right:0; height:123px; z-index:4; background:var(--ink); color:var(--paper); padding:16px 19px;
          display:grid; grid-template-columns: 1.35fr .75fr .8fr; column-gap:11px;
        }
        .performance-story__fact { border-right:1px solid rgba(240,234,217,.26); }
        .performance-story__fact:last-child { border:0; }
        .performance-story__fact b { display:block; font-size:24px; line-height:.9; font-weight:800; letter-spacing:-.075em; }
        .performance-story__fact:first-child b { font-size:31px; }
        .performance-story__fact span { display:block; margin-top:8px; color:var(--blue); font:7px "Space Mono",monospace; letter-spacing:.08em; line-height:1.25; }
        .performance-story__foot {
          position:absolute; z-index:6; bottom:8px; left:19px; color:var(--mist); font:6px "Space Mono",monospace; letter-spacing:.08em;
        }
        @keyframes performance-route { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) { .performance-story__route .active { animation:none; stroke-dashoffset:0; } }
      `}</style>
      <section className="performance-story__art">
        <div className="performance-story__photo" />
        <div className="performance-story__mast">
          <span>YOANN2.0 / RECORD</span>
          <span className="performance-story__chip">MARCHE</span>
        </div>
        <div className="performance-story__title">
          <p>BRANTÔME · 10 SEPT. 2026</p>
          <h1>Les bords<br />de Dronne</h1>
        </div>
        <div className="performance-story__runway"><div /></div>
        <div className="performance-story__distance">6,42<small>KM</small></div>
        <div className="performance-story__distance-label">DISTANCE ENREGISTRÉE</div>
        <div className="performance-story__pace">
          <strong>{DEMO_OPTIONS.averagePaceLabel.split(' ')[0]}<small> /km</small></strong>
          <span>ALLURE<br />MOYENNE</span>
        </div>
        <svg className="performance-story__profile" viewBox="0 0 100 30" aria-label="Profil d'allure">
          <polyline points={pacePoints} fill="none" stroke="#102b37" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <line x1="4" y1="26" x2="96" y2="26" stroke="rgba(16,43,55,.38)" strokeWidth=".7" />
        </svg>
        <div className="performance-story__map">
          <div className="performance-story__map-label">TRACE / 6,42 KM</div>
          <svg className="performance-story__route" viewBox="0 0 360 360" aria-label="Itinéraire de la balade">
            <path className="ghost" d={DEMO_ROUTE_PATH} />
            <path className="active" pathLength="1000" d={DEMO_ROUTE_PATH} />
            <circle className="start" cx="93" cy="202" r="6" />
            <circle className="finish" cx="96" cy="203" r="5" />
          </svg>
          <div className="performance-story__scale">500 M</div>
        </div>
        <div className="performance-story__facts">
          <div className="performance-story__fact"><b>1h18</b><span>TEMPS<br />EN MOUVEMENT</span></div>
          <div className="performance-story__fact"><b>+82<sup>m</sup></b><span>DÉNIVELÉ<br />POSITIF</span></div>
          <div className="performance-story__fact"><b>09:12</b><span>DÉPART<br />10:30 FIN</span></div>
        </div>
        <div className="performance-story__foot">YOANN + MARIE · DONNÉES ILLUSTRATIVES</div>
        <div className="performance-story__grain" />
      </section>
    </main>
  );
}