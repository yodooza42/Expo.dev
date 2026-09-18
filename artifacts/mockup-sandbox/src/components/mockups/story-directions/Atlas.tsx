import './_group.css';

import { DEMO_OPTIONS, DEMO_ROUTE_PATH } from './_data';

export function Atlas() {
  return (
    <main className="atlas-story" aria-label="Story cartographique de la balade à Brantôme">
      <style>{`
        .atlas-story{--paper:#dce4dc;--limestone:#f0eee4;--water:#7fabb2;--ink:#263d43;--soft-ink:#64767a;--moss:#42675c;--route:#b54c38;position:relative;width:100%;height:100dvh;min-height:640px;overflow:hidden;background:var(--paper);color:var(--ink);font-family:Georgia,'Times New Roman',serif;isolation:isolate}
        .atlas-story *{box-sizing:border-box}.atlas-story:before{content:"";position:absolute;inset:0;z-index:-1;opacity:.29;background-image:radial-gradient(#29464b 0.55px,transparent .7px),radial-gradient(#29464b 0.45px,transparent .65px);background-size:7px 7px,11px 11px;background-position:0 0,3px 5px;mix-blend-mode:multiply}
        .atlas-grain{position:absolute;inset:0;pointer-events:none;opacity:.12;background:repeating-linear-gradient(8deg,transparent 0 14px,rgba(38,61,67,.15) 15px,transparent 16px)}
        .atlas-kicker,.atlas-meta,.atlas-caption,.atlas-scale,.atlas-stat-label{font-family:"Courier New",monospace;letter-spacing:.11em;text-transform:uppercase}
        .atlas-header{height:22.5%;padding:clamp(27px,5.5vh,44px) 26px 0;position:relative}
        .atlas-kicker{font-size:9px;color:var(--moss);display:flex;align-items:center;gap:9px}.atlas-kicker:before{content:"";height:1px;width:24px;background:currentColor}
        .atlas-title{font-size:clamp(27px,5.2vh,39px);line-height:.94;letter-spacing:-.055em;font-weight:normal;margin:14px 0 7px;max-width:255px}.atlas-title i{font-style:italic;color:var(--moss)}
        .atlas-meta{font-size:9px;color:var(--soft-ink);letter-spacing:.06em}.atlas-compass{position:absolute;right:28px;top:31px;width:34px;height:49px;text-align:center;font-family:"Courier New",monospace;font-size:9px;color:var(--ink)}.atlas-compass:before{content:"";position:absolute;left:16px;top:13px;border-left:2px solid transparent;border-right:2px solid transparent;border-bottom:22px solid var(--route);transform:translateX(-50%)}.atlas-compass:after{content:"";position:absolute;left:16px;top:35px;border-left:2px solid transparent;border-right:2px solid transparent;border-top:13px solid var(--ink);transform:translateX(-50%)}
        .atlas-map{height:55%;position:relative;border-top:1px solid rgba(38,61,67,.35);border-bottom:1px solid rgba(38,61,67,.35);overflow:hidden}
        .atlas-map:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 49.82%,rgba(38,61,67,.17) 50%,transparent 50.18%),linear-gradient(0deg,transparent 49.82%,rgba(38,61,67,.17) 50%,transparent 50.18%);background-size:90px 90px}
        .atlas-map:after{content:"";position:absolute;inset:12px;border:1px solid rgba(38,61,67,.18);pointer-events:none}
        .atlas-water{position:absolute;inset:-12% -20%;background:radial-gradient(ellipse at 61% 52%,transparent 0 18%,rgba(127,171,178,.42) 18.2% 20%,transparent 20.4%),radial-gradient(ellipse at 43% 37%,transparent 0 14%,rgba(127,171,178,.33) 14.2% 16%,transparent 16.2%);transform:rotate(-13deg)}
        .atlas-contours{position:absolute;inset:0;opacity:.45;background:repeating-radial-gradient(ellipse at 15% 70%,transparent 0 23px,rgba(66,103,92,.23) 24px 25px,transparent 26px 41px);transform:rotate(21deg) scale(1.4)}
        .atlas-map svg{position:absolute;inset:0;width:100%;height:100%;z-index:2}.atlas-route-ghost{fill:none;stroke:rgba(38,61,67,.29);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.atlas-route{fill:none;stroke:var(--route);stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:600;stroke-dashoffset:600;animation:atlas-trace 2.4s cubic-bezier(.22,.78,.31,1) .15s forwards}
        .atlas-place{position:absolute;z-index:3;font-size:12px;line-height:1.02;color:var(--ink);background:var(--limestone);padding:4px 6px 5px;box-shadow:0 0 0 1px rgba(38,61,67,.12)}.atlas-place small{display:block;font-family:"Courier New",monospace;font-size:7px;letter-spacing:.08em;color:var(--soft-ink);margin-top:3px}.atlas-place--brantome{top:32%;left:17%}.atlas-place--dronne{bottom:22%;right:11%;font-style:italic}
        .atlas-marker{position:absolute;z-index:4;width:15px;height:15px;border:3px solid var(--limestone);border-radius:50%;background:var(--route);box-shadow:0 0 0 1px var(--route)}.atlas-marker--start{left:25.8%;top:55.7%}.atlas-marker--end{left:27.2%;top:57%;background:var(--ink);box-shadow:0 0 0 1px var(--ink)}.atlas-marker--end:after{content:"";position:absolute;width:1px;height:29px;background:var(--ink);left:4px;top:10px;transform:rotate(-30deg);transform-origin:top}
        .atlas-scale{position:absolute;left:26px;bottom:22px;z-index:4;font-size:8px;color:var(--soft-ink);letter-spacing:.04em}.atlas-scale span{display:block;width:64px;border-top:2px solid var(--ink);margin-top:5px;position:relative}.atlas-scale span:before,.atlas-scale span:after{content:"";position:absolute;top:-4px;height:7px;border-left:1px solid var(--ink)}.atlas-scale span:before{left:0}.atlas-scale span:after{right:0}
        .atlas-footer{height:22.5%;background:rgba(240,238,228,.63);padding:18px 26px 19px;display:grid;grid-template-columns:1.22fr .78fr;grid-template-rows:auto 1fr;column-gap:20px}.atlas-caption{font-size:8px;color:var(--soft-ink);letter-spacing:.07em;grid-column:1/-1;border-bottom:1px solid rgba(38,61,67,.25);padding-bottom:10px}.atlas-dist{align-self:end;font-size:clamp(36px,7vh,52px);line-height:.8;letter-spacing:-.07em}.atlas-dist span{font-family:"Courier New",monospace;font-size:10px;letter-spacing:.03em;margin-left:5px;color:var(--soft-ink)}.atlas-stats{align-self:end;border-left:1px solid rgba(38,61,67,.25);padding-left:14px;display:grid;gap:8px}.atlas-stat{display:flex;justify-content:space-between;gap:8px;font-size:13px}.atlas-stat-label{font-size:7px;color:var(--soft-ink);align-self:center}.atlas-note{position:absolute;right:26px;bottom:5px;font-family:"Courier New",monospace;font-size:7px;color:rgba(38,61,67,.54);letter-spacing:.04em}
        .atlas-footer{grid-template-columns:.85fr 1.15fr}.atlas-stat>span:last-child{white-space:nowrap}.atlas-story:before{opacity:.10}
        @keyframes atlas-trace{to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.atlas-route{animation:none;stroke-dashoffset:0}}@media (min-aspect-ratio:9/16){.atlas-story{width:min(100vw,56.25dvh);margin:auto}}@media (max-height:639px){.atlas-story{min-height:100dvh}.atlas-header{padding-top:24px}.atlas-title{margin-top:10px}.atlas-footer{padding-top:14px}}
      `}</style>
      <div className="atlas-grain" />
      <header className="atlas-header">
        <div className="atlas-kicker">Carnet de marche · feuille 01</div>
        <h1 className="atlas-title">Les bords<br />de <i>Dronne</i></h1>
        <div className="atlas-meta">{DEMO_OPTIONS.dateLabel} · {DEMO_OPTIONS.timeLabel}</div>
        <div className="atlas-compass">N</div>
      </header>
      <section className="atlas-map" aria-label="Carte illustrée de l'itinéraire">
        <div className="atlas-water" /><div className="atlas-contours" />
        <div className="atlas-place atlas-place--brantome">Brantôme<small>2400 m</small></div>
        <div className="atlas-place atlas-place--dronne">La Dronne<small>rive gauche</small></div>
        <svg viewBox="0 0 360 360" aria-hidden="true">
          <path className="atlas-route-ghost" d={DEMO_ROUTE_PATH} />
          <path className="atlas-route" d={DEMO_ROUTE_PATH} pathLength="600" />
        </svg>
        <span className="atlas-marker atlas-marker--start" aria-label="Départ" />
        <span className="atlas-marker atlas-marker--end" aria-label="Arrivée" />
        <div className="atlas-scale">500 m<span /></div>
      </section>
      <footer className="atlas-footer">
        <div className="atlas-caption">Une boucle au fil de l’eau · Yoann &amp; Marie</div>
        <div className="atlas-dist">6,42<span>km</span></div>
        <div className="atlas-stats">
          <div className="atlas-stat"><span className="atlas-stat-label">Temps</span><span>1h18</span></div>
          <div className="atlas-stat"><span className="atlas-stat-label">Dénivelé</span><span>+82 m</span></div>
          <div className="atlas-stat"><span className="atlas-stat-label">Allure</span><span>12:09 /km</span></div>
        </div>
      </footer>
      <div className="atlas-note">Tracé et distance illustratifs</div>
    </main>
  );
}