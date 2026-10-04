import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { landmarkIcon } from './icons.jsx';

// Interactive atlas of Grimhollow laid over a genuine antique chart: a plain
// 18th-century survey of the island of Boero (Jakob van der Schley / Pieter de
// Hondt, c. 1753), which is in the public domain (see CREDITS.txt). The
// engraving is the whole map — we add no terrain of our own. On top of it we
// keep only the game layer: inked roads, a seal with the landmark icon for each
// place, and the party marker. The only other raster in the project is the
// parchment texture.

const W = 1000;
const H = 640;

const DANGER_COLORS = ['#5f7a3f', '#a8862a', '#b5672f', '#a13f2a', '#8a2020', '#5f1830'];
const dangerColor = (d) => DANGER_COLORS[Math.min(Math.max(d, 1), 5)] || '#6b5335';

// Paper tone, reused for the halo behind ink drawn over the dark engraving.
const PARCH = '#f2e7cd';
const HALO = '#f4ead2';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

// A lightly wobbled poly-line, so overlay roads read as hand-inked.
function wobbleLine(pts, rng, amp = 2) {
  if (pts.length < 2) return '';
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2 + (rng() - 0.5) * amp;
    const my = (y0 + y1) / 2 + (rng() - 0.5) * amp;
    d += ` Q${r1(mx)},${r1(my)} ${r1(x1)},${r1(y1)}`;
  }
  return d;
}

export default function WorldMap({ data }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const byId = useMemo(() => new Map(data.locations.map((l) => [l.id, l])), [data]);
  const selected = selectedId != null ? byId.get(selectedId) : null;

  // The whole atlas is open: every place is known and clickable from the start.
  const character = data.character || null;

  // Where the party is right now: at a place, or part-way along a road.
  const marker = useMemo(() => {
    if (!character) return null;
    const road = character.travel;
    const a = road && byId.get(road.from);
    const b = road && byId.get(road.to);
    if (a && b && a.x != null && b.x != null) {
      const t = Math.max(0, Math.min(1, road.progress));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 30;
      const u = 1 - t;
      return {
        x: u * u * a.x + 2 * u * t * mx + t * t * b.x,
        y: u * u * a.y + 2 * u * t * my + t * t * b.y,
        onRoad: true, paused: road.paused,
      };
    }
    const here = byId.get(character.locationId);
    return here && here.x != null ? { x: here.x, y: here.y, onRoad: false } : null;
  }, [character, byId]);

  // Roads: hand-wobbled ink dashes with a pale underlay, so they read over the
  // engraving.
  const roads = useMemo(() => data.connections.map((c) => {
    const a = byId.get(c.from); const b = byId.get(c.to);
    if (!a || !b || a.x == null || b.x == null) return null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 30;
    const rng = rngFrom(hash(`road-${c.from}-${c.to}`));
    return { c, a, b, mx, my, d: wobbleLine([[a.x, a.y], [mx, my], [b.x, b.y]], rng, 12) };
  }).filter(Boolean), [data, byId]);

  return (
    <div className="atlas">
      <div className="map-col">
        <div className="map-wrap">
          <svg className="world-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Карта Гримхоула">
          <defs>
            {/* the antique engraving: Boero, c. 1753, public domain. It is the
                whole map; we add no decorative drawing of our own on top. */}
            <pattern id="antiqueMap" width={W} height={H} patternUnits="userSpaceOnUse">
              <image
                href="/art/maps/isle-antique.jpg" x={0} y={0} width={W} height={H}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          </defs>

          <rect width={W} height={H} fill="url(#antiqueMap)" />

          {/* roads: pale underlay then ink dashes */}
          {roads.map(({ c, a, b, mx, my, d }) => {
            const hot = selectedId === c.from || selectedId === c.to;
            return (
              <g key={`r${c.from}-${c.to}`} opacity={1}>
                <path d={d} fill="none" stroke={HALO} strokeWidth={hot ? 4.5 : 3.4} opacity={0.85} strokeLinecap="round" />
                <path className={`road ${hot ? 'hot' : ''}`} d={d} fill="none" />
                {c.minutes != null && (
                  <text x={mx} y={my - 4} className="road-time">{c.minutes} мин</text>
                )}
              </g>
            );
          })}

          {/* places: every location is open — an inked seal with its landmark */}
          {data.locations.map((l) => {
            if (l.x == null) return null;
            const active = selectedId === l.id;
            const hot = active || hoverId === l.id;
            const color = l.isSafe ? '#5f7a3f' : dangerColor(l.danger);
            const icon = landmarkIcon(l);
            return (
              <g
                key={l.id}
                className={`map-node ${active ? 'active' : ''}`}
                transform={`translate(${l.x},${l.y})`}
                onClick={() => setSelectedId(l.id)}
                onDoubleClick={() => navigate(`/world/locations/${l.id}`)}
                onMouseEnter={() => setHoverId(l.id)}
                onMouseLeave={() => setHoverId(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/world/locations/${l.id}`); }}
              >
                {hot && <circle r={29} className="node-ring" />}
                <circle r={17} className="seal" />
                {icon && (
                  <image
                    href={icon} x={-12} y={-12} width={24} height={24} className="landmark"
                    style={{ filter: 'invert(0.78) sepia(0.5) saturate(1.6) hue-rotate(330deg) brightness(0.9)' }}
                  />
                )}
                <circle cx={13} cy={-13} r={l.isSafe ? 4 : 2.5 + l.danger} fill={color} stroke={PARCH} strokeWidth={1.2} />
                <text y={33} className="node-label">{l.name}</text>
              </g>
            );
          })}

          {/* the party: an inked cross marks the spot */}
          {marker && (
            <g className="party-marker" transform={`translate(${marker.x},${marker.y})`}>
              <circle r={12} className={`party-pulse ${marker.paused ? 'paused' : ''}`} />
              <path d="M-6,-6 L6,6 M6,-6 L-6,6" className="party-x" />
            </g>
          )}
          </svg>
        </div>

        <div className="map-legend">
          <div className="legend-title">Легенда</div>
          <div className="legend-row"><span className="dot party" /> Отряд</div>
          <div className="legend-row"><span className="dot" style={{ background: '#5f7a3f' }} /> Безопасно</div>
          {[1, 2, 3, 4, 5].map((d) => (
            <div className="legend-row" key={d}>
              <span className="dot" style={{ background: dangerColor(d), width: 6 + d, height: 6 + d }} />
              {'★'.repeat(d)}
            </div>
          ))}
          <div className="legend-sep" />
          <div className="legend-row legend-credit">
            van der Schley, «Остров Буру» (ок. 1753) · общественное достояние.
            Путь указывается в минутах.
          </div>
        </div>
      </div>

      <div className="map-detail card">
        {character && character.travel && (
          <div className="party-road card">
            <span className="muted small">Отряд в пути</span>
            <b>
              {(byId.get(character.travel.from)?.name) || '?'} → {(byId.get(character.travel.to)?.name) || '?'}
            </b>
            <div className="road-track mini">
              <div className="road-fill" style={{ width: `${Math.round(character.travel.progress * 100)}%` }} />
            </div>
            <span className="muted small">
              {character.travel.minute} / {character.travel.minutes} мин
              {character.travel.paused ? ' · дорога ждёт решения' : ''}
            </span>
            <div className="actions">
              <button type="button" onClick={() => navigate(`/travel/${character.travel.id}`)}>Смотреть путь</button>
            </div>
          </div>
        )}
        {!selected && (
          <p className="muted">
            Кликните по метке, чтобы увидеть место. Двойной клик или кнопка — отправиться туда.
          </p>
        )}
        {selected && (
          <>
            <div className="page-head" style={{ margin: 0 }}>
              <h2 style={{ margin: 0 }}>{selected.name}</h2>
              {selected.isSafe && <span className="badge safe">Безопасно</span>}
            </div>
            <p className="muted small">{selected.continentName} · {selected.regionName}</p>
            <p>{selected.description}</p>
            <div className="map-detail-meta">
              <span className="danger-tag">Опасность {'★'.repeat(Math.min(selected.danger, 5))}</span>
              <span className="muted small">{selected.monsterCount} вид(ов) существ</span>
            </div>
            <div className="actions">
              <button type="button" onClick={() => navigate(`/world/locations/${selected.id}`)}>Отправиться</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { dangerColor };
