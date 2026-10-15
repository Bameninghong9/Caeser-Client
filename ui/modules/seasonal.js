// Saisonale Deko: eine abschaltbare Ebene über dem bestehenden Design.
// Die Datumslogik ist DOM-frei, damit sie auch in Node getestet werden kann.

export const SEASON_CLASS = 'season-halloween';

// Halloween-Zeitraum: 1. Oktober bis einschließlich 2. November (lokale Zeit).
export function isHalloweenSeason(date = new Date()) {
  const month = date.getMonth(), day = date.getDate();
  return month === 9 || (month === 10 && day <= 2);
}

// setting: 'auto' (Datum entscheidet), 'on' oder 'off' (Wahl des Nutzers gewinnt).
export function seasonalActive(setting, date = new Date()) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return isHalloweenSeason(date);
}

// Schalter in den Einstellungen: entspricht die Wahl dem Datum, zurück auf 'auto'.
export function nextSeasonalSetting(wantOn, date = new Date()) {
  return Boolean(wantOn) === isHalloweenSeason(date) ? 'auto' : (wantOn ? 'on' : 'off');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAT_PATH = 'M20 7L18.6 4.5L18 7.5C15 6.5 12 4 9.5 1C9 4.5 6 7 1 8C4 9 6 11 6.5 14C8.5 12 11 12 12.5 13.5C14 12.5 16 13 18 16L20 18L22 16C24 13 26 12.5 27.5 13.5C29 12 31.5 12 33.5 14C34 11 36 9 39 8C34 7 31 4.5 30.5 1C28 4 25 6.5 22 7.5L21.4 4.5Z';
const SILHOUETTE = '#060509';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function div(className, ...children) {
  const el = document.createElement('div');
  el.className = className;
  el.append(...children);
  return el;
}
// Fester Zufall, damit Bäume bei jedem Start gleich aussehen
function seeded(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = n => n.toFixed(1);

// Spinnennetz, Ecke unten rechts im viewBox; per CSS in andere Ecken gespiegelt
function spiderWeb(variant, withSpider = false) {
  const size = 200, angles = [180, 197, 214, 232, 251, 270], rings = [26, 50, 78, 110, 146, 186];
  const point = (angle, r) => [size + r * Math.cos(angle * Math.PI / 180), size + r * Math.sin(angle * Math.PI / 180)];
  let d = angles.map(a => { const [x, y] = point(a, 200); return `M${size} ${size}L${f(x)} ${f(y)}`; }).join('');
  for (const r of rings) {
    for (let i = 0; i < angles.length - 1; i++) {
      const [x1, y1] = point(angles[i], r), [x2, y2] = point(angles[i + 1], r);
      const [cx, cy] = point((angles[i] + angles[i + 1]) / 2, r * 0.86);
      d += `M${f(x1)} ${f(y1)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`;
    }
  }
  const web = svg('svg', { class: `season-web season-web-${variant}`, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
  web.append(svg('path', { d }));
  if (withSpider) {
    const [sx, sy] = point(222, 130);
    web.append(svg('path', { class: 'season-thread', d: `M${f(sx)} ${f(sy - 18)}V${f(sy + 26)}` }));
    web.append(svg('circle', { class: 'season-spider', cx: f(sx), cy: f(sy + 29), r: '3' }));
  }
  return web;
}

// Spinne mit Beinen (für die Abseil-Spinne)
function spiderIcon() {
  const icon = svg('svg', { viewBox: '0 0 30 26', 'aria-hidden': 'true' });
  const legs = 'M12 12L5 6L2 9M12 14L4 12L1 16M18 12L25 6L28 9M18 14L26 12L29 16M12 16L5 18L3 23M18 16L25 18L27 23M13 17L9 22L8 25M17 17L21 22L22 25';
  icon.append(svg('path', { d: legs, fill: 'none', stroke: '#0b0810', 'stroke-width': '1.3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    svg('ellipse', { cx: '15', cy: '16', rx: '4.6', ry: '5.4', fill: '#0b0810', stroke: 'rgba(251,146,60,.45)', 'stroke-width': '.6' }),
    svg('circle', { cx: '15', cy: '9.6', r: '2.8', fill: '#0b0810', stroke: 'rgba(251,146,60,.45)', 'stroke-width': '.6' }),
    svg('circle', { cx: '14', cy: '9.2', r: '.55', fill: '#bef264' }), svg('circle', { cx: '16', cy: '9.2', r: '.55', fill: '#bef264' }));
  return icon;
}

// Kürbislaterne mit Kerzenlicht im Inneren
function jackOLantern() {
  const icon = svg('svg', { viewBox: '0 0 40 37', 'aria-hidden': 'true' });
  icon.append(
    svg('path', { d: 'M20 9.5c-3.5-2.3-10-2.1-13.6 2.3S3 24.5 5.6 30 13.8 36 20 36s11.7-.6 14.4-6 2.4-12.7-.9-18.2S23.5 7.2 20 9.5z', fill: '#c2410c' }),
    svg('path', { d: 'M20 9.8c-2.8 2.8-3.4 17 0 26M20 9.8c2.8 2.8 3.4 17 0 26M12.2 10.9c-4 4.6-4.3 17 .6 23.4M27.8 10.9c4 4.6 4.3 17-.6 23.4', fill: 'none', stroke: '#7c2d12', 'stroke-width': '1', 'stroke-linecap': 'round', opacity: '.6' }),
    svg('path', { d: 'M20 9.6c0-3 .8-5.2 3.2-6.8', fill: 'none', stroke: '#3f6212', 'stroke-width': '2.6', 'stroke-linecap': 'round' }),
    svg('path', { class: 'season-face', d: 'M10.5 18.5l5.5-2.2-1.6 6zM29.5 18.5l-5.5-2.2 1.6 6zM20 22.3l-2 3.3h4zM10.5 27c3 4.6 16 4.6 19 0l-3 1.4-1.6-2-2.1 2.2-2.8-2.1-2.8 2.1-2.1-2.2-1.6 2z', fill: '#fde68a' }));
  return icon;
}
function lantern(index) {
  return div(`season-lantern season-lantern-${index}`, div('season-candle'), jackOLantern());
}

// Kahler, verdrehter Baum als Liniengeflecht
function tree(group, x, baseY, height, seed) {
  const rand = seeded(seed);
  const grow = (x1, y1, angle, len, width, depth) => {
    const bend = (rand() - 0.5) * 0.9;
    const x2 = x1 + Math.cos(angle) * len, y2 = y1 + Math.sin(angle) * len;
    const cx = (x1 + x2) / 2 + Math.cos(angle + Math.PI / 2) * len * bend * 0.35, cy = (y1 + y2) / 2 + Math.sin(angle + Math.PI / 2) * len * bend * 0.35;
    group.append(svg('path', { d: `M${f(x1)} ${f(y1)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`, fill: 'none', stroke: SILHOUETTE, 'stroke-width': f(width), 'stroke-linecap': 'round' }));
    if (depth <= 0) return;
    const branches = depth > 3 ? 2 : 2 + (rand() > 0.6 ? 1 : 0);
    for (let i = 0; i < branches; i++) {
      const spread = (i - (branches - 1) / 2) * (0.55 + rand() * 0.35) + (rand() - 0.5) * 0.4;
      grow(x2, y2, angle + spread, len * (0.66 + rand() * 0.14), width * 0.66, depth - 1);
    }
  };
  grow(x, baseY, -Math.PI / 2 + (rand() - 0.5) * 0.2, height * 0.32, height * 0.06, 6);
}

// Friedhof-Silhouette am unteren Rand: Hügel, Grabsteine, Kreuze, Zaun und zwei kahle Bäume
function graveyard() {
  const icon = svg('svg', { class: 'season-graveyard', viewBox: '0 0 1200 220', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' });
  const g = svg('g');
  tree(g, 230, 200, 185, 7);
  tree(g, 985, 196, 140, 23);
  const grave = (x, y, w, h, tilt) => svg('path', { d: `M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z`, fill: SILHOUETTE, transform: `rotate(${tilt} ${x + w / 2} ${y + h})` });
  const cross = (x, y, h, tilt) => svg('path', { d: `M${x - 2.5} ${y}h5v${h * 0.28}h${h * 0.22}v5h${-h * 0.22}v${h * 0.72 - 5}h-5v${-(h * 0.72 - 5)}h${-h * 0.22}v-5h${h * 0.22}z`, fill: SILHOUETTE, transform: `rotate(${tilt} ${x} ${y + h})` });
  let fence = '';
  for (let x = 640; x <= 860; x += 13) fence += `M${x} 202V${168 + (x % 3)}l2.2-5 2.2 5V202z`;
  fence += 'M636 176h228v3H636zM636 192h228v3H636z';
  g.append(
    svg('path', { d: fence, fill: SILHOUETTE, opacity: '.92' }),
    grave(330, 168, 24, 40, -6), grave(372, 176, 18, 30, 4), cross(430, 160, 44, -3), grave(486, 174, 22, 34, 7),
    grave(560, 180, 16, 26, -4), cross(905, 166, 36, 5), grave(1060, 172, 22, 36, -5), grave(1110, 182, 16, 24, 6),
    svg('path', { d: 'M0 220V186C120 170 220 178 340 190S560 176 700 186 940 196 1060 180 1200 186 1200 186V220Z', fill: SILHOUETTE }));
  icon.append(g);
  return icon;
}

function ghost() {
  const icon = svg('svg', { viewBox: '0 0 40 48', 'aria-hidden': 'true' });
  icon.append(svg('path', { d: 'M20 2C10.5 2 4.5 9.5 4.5 19.5V45l5-4 5 4.2 5.5-4.2 5.5 4.2 5-4.2 5 4V19.5C35.5 9.5 29.5 2 20 2z', fill: 'rgba(226,232,255,.85)' }),
    svg('ellipse', { cx: '14.8', cy: '19', rx: '2.4', ry: '3.4', fill: '#0b0912' }), svg('ellipse', { cx: '25.2', cy: '19', rx: '2.4', ry: '3.4', fill: '#0b0912' }),
    svg('ellipse', { cx: '20', cy: '28', rx: '2.6', ry: '3.2', fill: '#0b0912', opacity: '.8' }));
  return div('season-ghost', icon);
}

function bat(index) {
  const icon = svg('svg', { viewBox: '0 0 40 19', 'aria-hidden': 'true' });
  icon.append(svg('path', { d: BAT_PATH }));
  return div(`season-bat season-bat-${index}`, icon);
}

function leaf(index) {
  const icon = svg('svg', { viewBox: '0 0 20 22', 'aria-hidden': 'true' });
  icon.append(svg('path', { d: 'M10 1C5 5 2.6 9.5 3.6 14.2 4.5 18 7.4 20 10 20s5.5-2 6.4-5.8C17.4 9.5 15 5 10 1z' }), svg('path', { d: 'M10 3.5V21.5M10 9l-3-2.5M10 13l3.2-2.8M10 16.5l-2.8-2.2', fill: 'none' }));
  return div(`season-leaf season-leaf-${index}`, icon);
}

function buildLayer() {
  const layer = div('season-layer');
  layer.id = 'season-layer';
  layer.setAttribute('aria-hidden', 'true');
  const moon = div('season-moon-wrap', div('season-moon'), div('season-cloud season-cloud-1'), div('season-cloud season-cloud-2'));
  const eyes = [1, 2, 3].map(i => div(`season-eyes season-eyes-${i}`, div('season-eye'), div('season-eye')));
  const dangler = div('season-dangler', div('season-dangler-thread'), div('season-dangler-spider', spiderIcon()));
  layer.append(
    div('season-shade'), div('season-flash'), moon,
    ...[1, 2, 3, 4, 5, 6, 7].map(bat), ghost(),
    div('season-fog season-fog-back'), graveyard(), ...eyes, ...[1, 2, 3].map(lantern), div('season-fog season-fog-front'),
    spiderWeb('br', true), spiderWeb('tl'), spiderWeb('tr'), dangler,
    ...[1, 2, 3, 4].map(leaf));
  return layer;
}

// Schaltet die Deko am <body> um. Die Deko-Ebene liegt im Hintergrund (pointer-events: none).
export function applySeasonal(setting, date = new Date()) {
  const active = seasonalActive(setting, date);
  document.body.classList.toggle(SEASON_CLASS, active);
  const existing = document.getElementById('season-layer');
  if (active && !existing) {
    const host = document.getElementById('wallpaper-backdrop') || document.body;
    host.append(buildLayer());
  } else if (!active && existing) existing.remove();
  // Kürbislaterne neben dem Podest der Startseite (absolut positioniert, ändert kein Layout)
  const pedestal = document.querySelector('.player-pedestal');
  const pumpkin = document.getElementById('season-play-pumpkin');
  if (active && pedestal && !pumpkin) {
    const el = div('season-play-pumpkin', div('season-candle'), jackOLantern());
    el.id = 'season-play-pumpkin'; el.setAttribute('aria-hidden', 'true');
    pedestal.append(el);
  } else if (!active && pumpkin) pumpkin.remove();
  return active;
}
