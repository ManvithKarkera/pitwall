// PitWall hero: an isometric line drawing of an F1 car on a display plinth, built with the
// anatomy skill's kit (~/.claude/skills/anatomy). Hover the car for a labelled cutaway; hover the rear wing for DRS.
//   node frontend/hero/build-car.mjs                     -> frontend/src/hero/carFigure.js (used by the site)
//   node frontend/hero/build-car.mjs preview.html        -> a standalone page for checking the drawing
import { writeFileSync } from "node:fs";
import * as k from "/home/illusive/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "/home/illusive/.claude/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "/home/illusive/.claude/skills/anatomy/kit/tube.mjs";
import * as A from "/home/illusive/.claude/skills/anatomy/kit/audit.mjs";
import { kitScript } from "/home/illusive/.claude/skills/anatomy/scripts/inline-kit.mjs";

const PAGE = process.argv.find((a) => a.endsWith(".html"));
const MODULE = new URL("../src/hero/carFigure.js", import.meta.url);
const W = 900;
const H = 560;
const DEG = Math.PI / 180;

// World: 1 unit = 20 mm. x along the car (nose at +x), y across, z up. Ground (plinth top) at z = 0.
const WHEEL_R = 18;
const AXLE_Z = WHEEL_R;
const FRONT_X = 95;
const REAR_X = -85;
const FRONT = { w: 14, y: 41 };
const REAR = { w: 19, y: 39.5 };
const FLOOR_Z = 3;
const FLOOR_T = 1.5;
const DECK = FLOOR_Z + FLOOR_T;
const LIFT = 24;
const PLINTH = { x: -168, y: -76, w: 336, d: 152, r: 12 };
const PLINTH_H = 12;
const FOOT_H = 6;

const P = k.fitProjection(
  [...k.boxCorners(PLINTH, -PLINTH_H - FOOT_H, 0), [-130, 0, 52 + LIFT * 0.2], [-20, 0, 36 + LIFT], [144, 50, 14]],
  W,
  H,
  { pad: 34, azimuth: 52, elevation: 30 },
);
const V = G.viewOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (pts, style) => k.dotsSvg(pts, style);
const path = (pts, close = true) => "M" + pts.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L") + (close ? "Z" : "");

const ALONG_X = (o = [0, 0, 0]) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]); // section in (y, z)
const ALONG_Y = (o = [0, 0, 0]) => G.frameOf(o, [0, 1, 0], [1, 0, 0], [0, 0, 1]); // section in (x, z)
const UP = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);

const SPRING = { stagger: 0, stiffness: 70, damping: 15, substeps: 4 };
const R = A.recorder(P, { order: [], spring: SPRING });
const MOVE = { chassis: [0, 0, 0], cover: [0, 0, 0], stand: [0, 0, 0] };

function put(piece, ref, svg, shapes, { bias = 0, name, cls = "", route, chunk } = {}) {
  R.put({ piece, at: ref, bias, svg: cls ? `<g class="${cls}">${svg}</g>` : svg, move: MOVE[piece], shapes, name: name ?? R.nameFor(`${piece}.item`), route, chunk });
}
const rec = (shape) => R.solid(shape);

// A prism with a convex section, extruded along a frame axis.
function prism(piece, F, section, s0, s1, { tone = "hi", cls = "", name, extra = "", inner = "", bias = 0, crease } = {}) {
  const id = R.nameFor(name ?? `${piece}.prism`);
  const paths = G.prismOf(F, section, s0, s1, P);
  const cx = section.reduce((a, p) => a + p[0], 0) / section.length;
  const cy = section.reduce((a, p) => a + p[1], 0) / section.length;
  const mid = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(piece, mid, S(paths, { tone, inner, ...(crease ? { crease } : {}) }) + extra, [rec(A.prism(F, section, s0, s1, { name: id, owner: piece === "cover" ? "cover" : undefined }))], { bias, name: id, cls });
  return id;
}
function slab(piece, plan, z, h, { tone = "mid", cls = "", name, steps = 3, bevel = 0.4, extra = "", inner = "", bias = 0 } = {}) {
  const id = R.nameFor(name ?? `${piece}.slab`);
  put(piece, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(k.slabOf(plan, z, h, P, steps, bevel), { tone, inner }) + extra, [rec(A.slab(plan, z, h, { name: id }, steps))], { bias, name: id, cls });
  return id;
}
function turned(piece, F, profile, { tone = "hi", cls = "", name, extra = "", inner = "", bias = 0, owner } = {}) {
  const id = R.nameFor(name ?? `${piece}.turned`);
  const smooth = profile.some((p) => p[2]);
  const paths = G.solidOf(profile, F, P, { smooth: smooth ? { rows: 4 } : false });
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  put(piece, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone, inner }) + extra, [rec(A.solid(F, profile, { name: id, owner }))], { bias, name: id, cls });
  return id;
}
function ringPart(piece, F, meridian, { tone = "hi", cls = "", name, extra = "", bias = 0 } = {}) {
  const id = R.nameFor(name ?? `${piece}.ring`);
  const paths = G.lathe(meridian, F, P, { smooth: meridian.some((p) => p[2]) ? { rows: 4 } : false });
  const mid = (Math.min(...meridian.map((p) => p[0])) + Math.max(...meridian.map((p) => p[0]))) / 2;
  put(piece, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone }) + extra, [rec(A.lathe(F, meridian, { name: id }))], { bias, name: id, cls });
  return id;
}
function tube(piece, control, r, { name, tone = "hi", cls = "", bend = 3, maxLength = 14 } = {}) {
  const id = R.nameFor(name ?? `${piece}.tube`);
  const line = control.length > 2 ? G.fillet(control, Math.max(r * bend, 2.5), 10, { P, tube: r }) : control;
  R.route(id, line, r, { piece, move: MOVE[piece] });
  tubePieces(line, r, P, { maxLength }).forEach((part, index) =>
    put(piece, part.mid, tubeSvg(part, { tone }), [A.tube(part.points, part.radii)], { name: `${id}:${index}`, cls, route: id, chunk: index }),
  );
  return id;
}

// ---------- plinth (stand) ----------
function plinth() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLINTH, -PLINTH_H - FOOT_H, PLINTH_H, P)}"/>`];
  const feet = k.corners(PLINTH, 24).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 8, -PLINTH_H - FOOT_H, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -PLINTH_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLINTH, -PLINTH_H, PLINTH_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLINTH, -PLINTH_H + 4, P, 8), { tone: "faint" }) }));
  out.push(Ln(k.planOutline(k.insetPlan(PLINTH, 6), 0, P, 8), { tone: "lo" }));
  const screws = k.corners(PLINTH, 12);
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  // start line: chequered strip across the deck, front of the car
  const chk = { x: 150, y: -60, w: 8, d: 120, r: 0.5 };
  out.push(S(k.slabOf(chk, 0, 0.5, P, 2), { tone: "lo", crease: "none" }));
  for (let i = 0; i < 30; i++) {
    for (let j = 0; j < 2; j++) {
      if ((i + j) % 2) continue;
      const y0 = chk.y + i * 4, x0 = chk.x + j * 4;
      out.push(`<path class="chq" d="${path([[x0, y0, 0.5], [x0 + 4, y0, 0.5], [x0 + 4, y0 + 4, 0.5], [x0, y0 + 4, 0.5]])}"/>`);
    }
  }
  // ruler strip along the near edge, metres of car length
  const strip = { x: -140, y: PLINTH.y + PLINTH.d - 14, w: 280, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 0, strip.x + strip.w, 5, 10, strip.y + 0.8, 0.6, [2, 3.8], P);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  // label plate
  const plate = { x: 80, y: PLINTH.y + 8, w: 56, d: 16, r: 1.5 };
  out.push(S(k.slabOf(plate, 0, 0.8, P, 4), { tone: "lo" }));
  out.push(Ln(k.planOutline(k.insetPlan(plate, 1.6), 0.8, P), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([plate.x + plate.w / 2, plate.y + 9.4], 0.8, P, "x"), "PITWALL", { size: 5.2, tone: "hi", anchor: "middle" }));
  out.push(Dots([at([plate.x + 3, plate.y + 8, 0.8]), at([plate.x + plate.w - 3, plate.y + 8, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ---------- wheels ----------
function wheel(x, yc, w) {
  const F = G.frameOf([x, yc, AXLE_Z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const h = w / 2;
  const rim = 11.6;
  const tyre = [
    [-h, 15.6],
    [-h + 0.8, 17.2, 1],
    [-h + 2.4, 18, 1],
    [h - 2.4, 18, 1],
    [h - 0.8, 17.2, 1],
    [h, 15.6],
  ];
  const near = G.dot3(F.a, V) > 0 ? h : -h; // the sidewall that faces the viewer
  const sign = near > 0 ? 1 : -1;
  const tag = `${x > 0 ? "F" : "R"}${yc > 0 ? "R" : "L"}`;
  const band = Ln(G.arcOf(F, near, 14.4, P, { least: -1 }), { tone: "lit", className: "compound" });
  const lip = Ln(G.arcOf(F, near, rim + 0.6, P, { least: -1 }), { tone: "lo" });
  turned("chassis", F, tyre, { tone: "hi", cls: "rubber", name: `tyre${tag}`, extra: band + lip });
  // wheel cover: a flat alloy disc on the sidewall, spokes and a centre-lock nut
  const coverF = G.frameOf(G.pointOf(F, near, 0, 0), G.mul3(F.a, sign), F.u, F.v);
  const spokes = G.spokesOf(coverF, 0.5, 3.6, rim - 1.4, 10, P, { sweep: 0.18 });
  turned("chassis", coverF, [[0, rim], [0.5, rim]], { tone: "mid", cls: "alloy", name: `wheel${tag}`, extra: Ln(G.circleOf(coverF, 0.5, rim - 1.2, P, 72), { tone: "lo" }) + Ln(spokes, { tone: "faint" }) });
  const nutF = G.frameOf(G.pointOf(coverF, 0.5, 0, 0), coverF.a, F.u, F.v);
  turned("chassis", nutF, [[0, 2.6], [1.2, 2.6], [1.2, 1.6], [2.0, 1.6]], { tone: "hi", cls: "alloy", name: `nut${tag}`, extra: Dots(G.dotsOf(nutF, 1.2, 2.1, 6, P, { all: true }), { size: 0.35 }) });
}

// ---------- lofted bodywork ----------
// A body is a list of stations along x, each a superellipse section in (y, z):
// { x, yc, wT (half width above the centre line), wB (below), b (bottom z), t (top z), n (squareness above), nB (below) }.
// Neighbouring sections are joined by quads, shaded by facing in the kit's tones, and painted back to front.
const RING = 36;
const L = G.lightOf(P);
function sectionPoint(st, a) {
  const { yc = 0, wT, wB = wT, b, t, n = 2.6, nB = n } = st;
  const zc = (b + t) / 2, hh = (t - b) / 2;
  const c = Math.cos(a), s = Math.sin(a);
  const e = s >= 0 ? n : nB;
  const w = s >= 0 ? wT : wB;
  return [yc + w * Math.sign(c) * Math.abs(c) ** (2 / e), zc + hh * Math.sign(s) * Math.abs(s) ** (2 / e)];
}
const ringOfStation = (st) => Array.from({ length: RING }, (_, i) => sectionPoint(st, -Math.PI / 2 + (i / RING) * 2 * Math.PI));
function stationAt(stations, x) {
  const sorted = [...stations].sort((p, q) => p.x - q.x);
  let i = sorted.findIndex((st) => st.x >= x);
  if (i <= 0) return { ...sorted[Math.max(0, i)] };
  const p = sorted[i - 1], q = sorted[i], f = (x - p.x) / (q.x - p.x);
  const mix = (key, d) => (p[key] ?? d ?? p.wT) * (1 - f) + (q[key] ?? d ?? q.wT) * f;
  return { x, yc: mix("yc", 0), wT: mix("wT"), wB: (p.wB ?? p.wT) * (1 - f) + (q.wB ?? q.wT) * f, b: mix("b"), t: mix("t"), n: mix("n", 2.6), nB: (p.nB ?? p.n ?? 2.6) * (1 - f) + (q.nB ?? q.n ?? 2.6) * f };
}
const onBody = (stations, x, a) => { const [y, z] = sectionPoint(stationAt(stations, x), a); return [x, y, z]; };
// The top surface height of a body at (x, y), for things drawn on it.
function topAt(stations, x, y) {
  const st = stationAt(stations, x);
  const e = st.n ?? 2.6, zc = (st.b + st.t) / 2, hh = (st.t - st.b) / 2;
  const u = Math.min(1, Math.abs(y - (st.yc ?? 0)) / st.wT);
  return zc + hh * (1 - u ** e) ** (1 / e);
}

function loft(piece, stations, { cls = "livery", tone = "hi", name, extra = "", under = "", bias = 0 } = {}) {
  const id = R.nameFor(name ?? `${piece}.loft`);
  const rings = stations.map((st) => ringOfStation(st).map(([y, z]) => [st.x, y, z]));
  const faces = [];
  const centre = (pts) => G.mul3(pts.reduce((acc, p) => G.add3(acc, p), [0, 0, 0]), 1 / pts.length);
  for (let i = 0; i < rings.length - 1; i++) {
    const axis = G.lerp3(centre(rings[i]), centre(rings[i + 1]), 0.5);
    for (let j = 0; j < RING; j++) {
      const q = [rings[i][j], rings[i][(j + 1) % RING], rings[i + 1][(j + 1) % RING], rings[i + 1][j]];
      let n = G.cross3(G.sub3(q[2], q[0]), G.sub3(q[1], q[3]));
      if (G.len3(n) < 1e-9) continue;
      n = G.unit3(n);
      const c = centre(q);
      if (G.dot3(n, G.sub3(c, axis)) < 0) n = G.mul3(n, -1);
      faces.push({ pts: q, n, c, keys: [[i, j], [i, (j + 1) % RING], [i + 1, (j + 1) % RING], [i + 1, j]] });
    }
  }
  [0, rings.length - 1].forEach((i) => {
    const other = i === 0 ? 1 : rings.length - 2;
    const n = [Math.sign(stations[i].x - stations[other].x), 0, 0];
    faces.push({ pts: rings[i], n, c: centre(rings[i]), keys: rings[i].map((_, j) => [i, j]), cap: i });
  });
  const visible = faces.filter((f) => G.dot3(f.n, V) > 1e-6).sort((p, q) => G.dot3(p.c, V) - G.dot3(q.c, V));
  const edgeKey = (a, b) => [a.join(","), b.join(",")].sort().join("|");
  const owners = new Map();
  for (const f of faces) {
    const seen = G.dot3(f.n, V) > 1e-6;
    f.keys.forEach((k0, idx) => {
      const k1 = f.keys[(idx + 1) % f.keys.length];
      const key = edgeKey(k0, k1);
      const entry = owners.get(key) ?? { pts: [f.pts[idx], f.pts[(idx + 1) % f.pts.length]], seen: 0, all: 0 };
      entry.all++;
      if (seen) entry.seen++;
      owners.set(key, entry);
    });
  }
  const outline = [...owners.values()].filter((e) => e.seen === 1).map((e) => path(e.pts, false)).join("");
  const body = visible.map((f) => {
    const tone4 = G.bandOf(G.dot3(f.n, L));
    return tone4 === 4 ? `<path class="iso-top" d="${path(f.pts)}"/>` : `<path class="iso-shade" data-shade="${tone4}" d="${path(f.pts)}"/>`;
  }).join("");
  const svg = `<g class="iso-solid" data-seamless="">${body}${under}<path class="iso-line iso-edge" data-tone="${tone}" d="${outline}"/></g>${extra}`;
  const shapes = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const mid = stationAt(stations, (stations[i].x + stations[i + 1].x) / 2);
    shapes.push(rec(A.prism(ALONG_X(), ringOfStation(mid), Math.min(stations[i].x, stations[i + 1].x), Math.max(stations[i].x, stations[i + 1].x), { name: `${id}.${i}`, owner: id })));
  }
  const all = rings.flat();
  put(piece, centre(all), svg, shapes, { name: id, cls, bias });
  return id;
}
const lineOn = (pts, tone = "lo", className) => Ln(path(pts, false), { tone, className });

// ---------- chassis ----------
const BODY = [
  { x: 141, wT: 2.0, b: 6.6, t: 9.4, n: 2.2 },
  { x: 134, wT: 3.4, b: 6.2, t: 11.2, n: 2.4 },
  { x: 122, wT: 5.2, b: 6.0, t: 13.6, n: 2.5 },
  { x: 106, wT: 7.0, b: 5.8, t: 16.4, n: 2.6 },
  { x: 90, wT: 8.6, b: 5.4, t: 19.2, n: 2.7 },
  { x: 76, wT: 10.6, wB: 9.6, b: 4.6, t: 22.2, n: 2.9 },
  { x: 62, wT: 13.4, wB: 12.0, b: DECK, t: 25.0, n: 3.4, nB: 5 },
  { x: 44, wT: 15.0, wB: 13.6, b: DECK, t: 26.0, n: 3.8, nB: 6 },
  { x: 20, wT: 16.0, wB: 14.6, b: DECK, t: 26.2, n: 4.0, nB: 6 },
  { x: -25, wT: 16.0, wB: 14.6, b: DECK, t: 26.2, n: 4.0, nB: 6 },
];
const COVER = [
  { x: 26, wT: 6.2, wB: 9.0, b: 25.0, t: 44.6, n: 3.2, nB: 8 },
  { x: 16, wT: 7.6, wB: 10.6, b: 25.0, t: 45.6, n: 3.0, nB: 8 },
  { x: 4, wT: 9.6, wB: 12.0, b: 25.0, t: 41.0, n: 2.8, nB: 8 },
  { x: -12, wT: 11.6, wB: 12.8, b: 25.0, t: 36.0, n: 2.8, nB: 8 },
  { x: -24.5, wT: 12.6, wB: 13.0, b: 25.0, t: 33.6, n: 2.8, nB: 8 },
  { x: -25.5, wT: 12.8, wB: 13.0, b: DECK, t: 33.4, n: 2.8, nB: 8 },
  { x: -46, wT: 12.6, wB: 12.8, b: DECK, t: 29.6, n: 2.7, nB: 8 },
  { x: -70, wT: 10.4, wB: 12.4, b: DECK, t: 25.0, n: 2.6, nB: 8 },
  { x: -88, wT: 7.4, wB: 9.0, b: 13.6, t: 20.6, n: 2.4, nB: 6 },
  { x: -104, wT: 3.6, wB: 4.4, b: 14.4, t: 17.4, n: 2.2, nB: 4 },
];
const podStations = (side) => [
  { x: 34, yc: side * 29.5, wT: 9.6, wB: 7.4, b: 9.6, t: 22.6, n: 3.2, nB: 2.2 },
  { x: 30, yc: side * 29.6, wT: 11.0, wB: 8.6, b: 8.0, t: 24.0, n: 3.2, nB: 2.4 },
  { x: 18, yc: side * 29.0, wT: 12.2, wB: 9.4, b: 5.8, t: 24.2, n: 3.0, nB: 2.6 },
  { x: 0, yc: side * 27.6, wT: 11.8, wB: 9.6, b: DECK, t: 22.4, n: 2.8, nB: 3 },
  { x: -20, yc: side * 25.0, wT: 10.0, wB: 8.8, b: DECK, t: 18.8, n: 2.6, nB: 3 },
  { x: -40, yc: side * 21.6, wT: 7.4, wB: 6.8, b: DECK, t: 14.6, n: 2.4, nB: 3 },
  { x: -58, yc: side * 18.0, wT: 4.6, wB: 4.6, b: DECK, t: 10.6, n: 2.2, nB: 3 },
  { x: -68, yc: side * 15.6, wT: 2.4, wB: 2.4, b: DECK, t: 7.6, n: 2.2, nB: 3 },
];

function floorAndTub() {
  // floor: a flat carbon plate, wide under the sidepods, with a raised edge lip and fences at its leading edge
  const ring = [[-100, -27], [-46, -27], [-40, -44], [32, -44], [58, -26], [80, -12], [80, 12], [58, 26], [32, 44], [-40, 44], [-46, 27], [-100, 27]];
  const ex = k.extrude(ring, FLOOR_Z, FLOOR_T, P, { convex: false });
  const edge = k.onTop([[-40, 41.4], [32, 41.4], [56.6, 25.2]], DECK, P);
  put("chassis", [-10, 0, FLOOR_Z], S(ex, { tone: "mid" }) + Ln(edge, { tone: "faint" }), [rec(A.extruded(ring, FLOOR_Z, FLOOR_T, { name: "floor" }))], { name: "floor", cls: "carbon", bias: -40 });
  for (const side of [1, -1]) {
    slab("chassis", { x: -40, y: side > 0 ? 42.6 : -44, w: 70, d: 1.4, r: 0.4 }, DECK, 2.2, { tone: "mid", cls: "carbon", name: `floor.lip${side}`, steps: 2, bevel: 0 });
    for (let i = 0; i < 4; i++) slab("chassis", { x: 34 + i * 3.4 - i * 0, y: side * (20 + i * 4.4) - 0.3, w: 9 - i, d: 0.6, r: 0.2 }, DECK, 3.2 - i * 0.4, { tone: "mid", cls: "carbon", name: `fence${side}${i}`, steps: 2, bevel: 0 });
  }
  slab("chassis", { x: -70, y: -4, w: 130, d: 8, r: 0.5 }, FLOOR_Z - 1.2, 1.2, { tone: "lo", cls: "carbon", name: "plank", bias: -60 });

  // survival cell and nose as one shell, with the cockpit opening, a livery stripe and the car number
  const cock = [], rim = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const p = [40 + 17 * Math.cos(t), 8.4 * Math.sin(t)];
    cock.push([p[0], p[1], topAt(BODY, p[0], p[1]) + 0.05]);
    const q = [40 + 19.4 * Math.cos(t), 10.6 * Math.sin(t)];
    rim.push([q[0], q[1], topAt(BODY, q[0], q[1]) + 0.05]);
  }
  const stripe = (a) => Array.from({ length: 30 }, (_, i) => onBody(BODY, 140 - i * 4.6, a));
  const extra = `<path class="void" d="${path(cock)}"/>` + Ln(path(cock), { tone: "hi" }) + Ln(path(rim), { tone: "lo" }) +
    lineOn(stripe(0.42), "faint", "stripe") + lineOn(stripe(0.62), "faint", "stripe") +
    lineOn(Array.from({ length: 12 }, (_, i) => onBody(BODY, 60 + i * 6, -0.15)), "lo");
  loft("chassis", BODY, { name: "tub", extra });
  // nose camera pods, pitot and the number panel
  for (const side of [1, -1]) {
    const c = onBody(BODY, 116, side > 0 ? 0.5 : Math.PI - 0.5);
    const F = G.frameOf(c, [0, side, 0.0], [1, 0, 0], [0, 0, 1]);
    turned("chassis", G.frameOf(G.add3(c, [0, side * 0.2, 0]), [1, 0, 0], [0, 1, 0], [0, 0, 1]), [[-3, 0.9, 1], [-1.6, 1.3, 1], [2, 1.3, 1], [3, 0.6, 1]], { tone: "hi", cls: "carbon", name: `nosecam${side}` });
    void F;
  }
  tube("chassis", [onBody(BODY, 141, Math.PI / 2), [149, 0, 8.8]], 0.35, { name: "pitot", cls: "metal" });
  // headrest pads either side of the empty cockpit
  for (const side of [1, -1]) slab("chassis", { x: 25, y: side > 0 ? 7.6 : -11.6, w: 10, d: 4, r: 1.6 }, 25.4, 3.2, { tone: "hi", cls: "pad", name: `headrest${side}`, steps: 4, bevel: 0.6 });
  // steering wheel just visible in the opening
  slab("chassis", { x: 51, y: -4.5, w: 1.6, d: 9, r: 0.7 }, 24.2, 2.4, { tone: "hi", cls: "carbon", name: "wheel.steer", steps: 3, bevel: 0 });

  // halo: a centre pillar and a hoop round the cockpit
  tube("chassis", [[63, 0, topAt(BODY, 63, 0)], [60, 0, 33], [57, 0, 37.4]], 1.3, { name: "halo.pillar", cls: "carbon", bend: 2 });
  tube("chassis", [[23, -11.4, topAt(BODY, 23, 11.4)], [27, -12.0, 35], [46, -9.4, 37.6], [57, 0, 37.6], [46, 9.4, 37.6], [27, 12.0, 35], [23, 11.4, topAt(BODY, 23, 11.4)]], 1.3, { name: "halo.hoop", cls: "carbon", bend: 4, maxLength: 9 });
}

// ---------- bodywork that lifts (engine cover and sidepods) ----------
function cover() {
  const intake = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    intake.push([26.05, 4.0 * Math.cos(t), 39.4 + 3.4 * Math.sin(t)]);
  }
  const louvres = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const x = -32 - i * 3.2;
    return lineOn([onBody(COVER, x, 0.98), onBody(COVER, x - 2.2, 0.64)], "lo") + lineOn([onBody(COVER, x - 0.6, 0.98), onBody(COVER, x - 2.8, 0.64)], "lo", "gill-light");
  }).join("");
  const spine = lineOn(Array.from({ length: 26 }, (_, i) => onBody(COVER, 24 - i * 5, Math.PI / 2)), "faint");
  loft("cover", COVER, { name: "cover", extra: `<path class="void" d="${path(intake)}"/>` + Ln(path(intake), { tone: "lo" }) + louvres + spine });
  // shark fin with the car number
  const FIN = [[-100, 17.6], [-22, 34.2], [-26, 41.2], [-100, 28.6]];
  const num = k.faceTextSvg(k.sideMatrix([-62, 0.62], 29.6, P, "left"), "16", { size: 8.4, tone: "hi", anchor: "middle" });
  prism("cover", ALONG_Y(), FIN, -0.6, 0.6, { cls: "fin", name: "cover.fin", extra: num });
  // roll-hoop T-cam and antenna
  slab("cover", { x: 15, y: -2.6, w: 6, d: 5.2, r: 1.4 }, 45.2, 1.8, { tone: "hi", cls: "tcam", name: "cover.tcam", bias: 1 });
  // sidepods: undercut shells with a letterbox inlet
  for (const side of [1, -1]) {
    const st = podStations(side);
    const yc = side * 29.5;
    const mouth = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const [y, z] = sectionPoint({ yc, wT: 7.6, wB: 5.6, b: 12.4, t: 20.6, n: 3.6, nB: 2.4 }, a);
      mouth.push([34.05, y, z]);
    }
    const gills = side > 0 ? [0, 1, 2, 3].map((i) => lineOn(Array.from({ length: 8 }, (_, j) => onBody(st, -6 - i * 6 - j * 0.5, 0.7 + j * 0.06)), "lo")).join("") : "";
    const crease = lineOn(Array.from({ length: 20 }, (_, i) => onBody(st, 33 - i * 5, side > 0 ? 0.25 : Math.PI - 0.25)), "faint");
    loft("cover", st, { name: `pod${side > 0 ? "R" : "L"}`, extra: `<path class="void" d="${path(mouth)}"/>` + Ln(path(mouth), { tone: "lo" }) + gills + crease });
    // mirror on a stalk from the sidepod shoulder
    const foot = onBody(st, 24, side > 0 ? 1.1 : Math.PI - 1.1);
    tube("cover", [foot, [foot[0] - 0.6, side * 33.4, 29.4]], 0.45, { name: `mirror.stalk${side}`, cls: "carbon" });
    slab("cover", { x: 20.4, y: side > 0 ? 31.2 : -38.6, w: 4.6, d: 7.4, r: 1.6 }, 29.4, 3.4, { tone: "hi", cls: "livery", name: `mirror${side}`, steps: 4, bevel: 0.5, extra: side > 0 ? "" : "" });
  }
}

// ---------- power unit (revealed) ----------
function powerUnit() {
  // gearbox casing behind the engine, carrying the rear suspension and crash structure
  const GB = { x: -100, y: -12, w: 32, d: 24, r: 2 };
  slab("chassis", GB, DECK, 9.5, { tone: "mid", cls: "carbon", name: "gearbox", inner: Ln(k.sideSeam(GB, DECK + 5, P, 3), { tone: "faint" }) });
  // V6 block: crankcase, sump seam and two cylinder banks with cam covers
  const BLOCK = { x: -66, y: -10, w: 40, d: 20, r: 1.5 };
  slab("chassis", BLOCK, DECK, 8, { tone: "mid", cls: "gun", name: "pu.block", inner: Ln(k.sideSeam(BLOCK, DECK + 3, P, 3), { tone: "faint" }) });
  slab("chassis", { x: -68, y: -8, w: 2, d: 16, r: 0.6 }, DECK, 9.5, { tone: "mid", cls: "gun", name: "pu.bell", steps: 2 });
  for (const side of [1, -1]) {
    const bank = { x: -64, y: side > 0 ? 2 : -12, w: 36, d: 10, r: 1.4 };
    slab("chassis", bank, DECK + 8, 4.6, { tone: "mid", cls: "gun", name: `pu.head${side}` });
    const cam = k.insetPlan(bank, 1.2);
    const top = DECK + 8 + 4.6 + 3;
    const bolts = [];
    for (let i = 0; i < 3; i++) for (const dy of [-2.6, 2.6]) bolts.push(at([bank.x + 7 + i * 11, bank.y + bank.d / 2 + dy, top]));
    const ribs = [0, 1, 2, 3].map((i) => k.lineOnTop([cam.x + 4 + i * 9.2, cam.y], [cam.x + 4 + i * 9.2, cam.y + cam.d], top, P)).join("");
    slab("chassis", cam, DECK + 12.6, 3, { tone: "hi", cls: "camcover", name: `pu.cam${side}`, extra: Ln(ribs, { tone: "faint" }) + Dots(bolts, { size: 0.5 }) });
  }
  // plenum in the V with six intake trumpets
  const PLEN = { x: -60, y: -1.8, w: 28, d: 3.6, r: 1.2 };
  slab("chassis", PLEN, DECK + 8, 8.8, { tone: "hi", cls: "metal", name: "pu.plenum" });
  for (let i = 0; i < 3; i++) {
    for (const dy of [-0.95, 0.95]) {
      const F = UP([-55 + i * 9 + (dy > 0 ? 4.5 : 0), dy, DECK + 16.8]);
      turned("chassis", F, [[0, 0.85], [2.4, 0.85], [2.4, 1.3], [3.0, 1.3]], { tone: "hi", cls: "metal", name: `pu.trumpet${i}${dy > 0 ? "a" : "b"}` });
    }
  }
  // turbocharger on the front of the engine: compressor (left) and turbine (right) on one shaft
  const TURBO = G.frameOf([-29.5, 0, 21.5], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  turned("chassis", TURBO, [[-7.2, 2.6], [-6.2, 4.4, 1], [-4.2, 5.2, 1], [-2.2, 4.6, 1], [-1.2, 2.4], [1.2, 2.4], [2.2, 4.4, 1], [4.2, 4.9, 1], [6.2, 4.2, 1], [7.2, 2.4]], { tone: "hi", cls: "hot", name: "pu.turbo", inner: G.arcOf(TURBO, 0, 2.4, P, {}) });
  slab("chassis", { x: -33, y: -2, w: 7, d: 4, r: 1 }, DECK + 8, 9.1, { tone: "mid", cls: "gun", name: "pu.turbo.mount", steps: 2 });
  // exhaust primaries from the near bank into a collector on the turbine inlet
  const COLL = [-29.5, 9.4, 21.5];
  put("chassis", COLL, S(G.sphereOf(COLL, 2.2, P), { tone: "hi" }), [rec(A.ball(COLL, 2.2, { name: "pu.collector" }))], { name: "pu.collector", cls: "hot" });
  for (let i = 0; i < 3; i++) {
    const x0 = -56 + i * 10;
    tube("chassis", [[x0, 12.1, DECK + 10.5], [x0, 12.9, DECK + 10.5], [x0 + 4, 12.6, 20.2], [-31.4, 10.4, 21.5]], 0.8, { name: `pu.exhaust${i}`, cls: "hot", bend: 3 });
  }
  // MGU-K on the block's flank, driven off the crank
  const MGUK = G.frameOf([-40, -10, DECK + 4], [0, -1, 0], [1, 0, 0], [0, 0, 1]);
  turned("chassis", MGUK, [[0, 3.4], [4, 3.4], [4, 2.6], [5, 2.6]], { tone: "hi", cls: "metal", name: "pu.mguk" });
  // radiators in the sidepod bays, finned cores on brackets
  for (const side of [1, -1]) {
    const core = { x: -14, y: side > 0 ? 22 : -34, w: 30, d: 12, r: 0.8 };
    const fins = [];
    for (let x = core.x + 1.5; x < core.x + core.w - 1; x += 1.6) fins.push(k.lineOnTop([x, core.y + 1], [x, core.y + core.d - 1], 17, P));
    slab("chassis", core, 7.5, 9.5, { tone: "mid", cls: "radiator", name: `radiator${side}`, steps: 2, extra: Ln(k.planOutline(k.insetPlan(core, 1), 17, P, 2), { tone: "lo" }) + Ln(fins.join(""), { tone: "faint" }) });
  }
}

// ---------- suspension ----------
// Brake duct drum between the upright and the wheel, a carbon fairing with cooling slots.
function brakeDrum(x, side, from, to, r) {
  const F = G.frameOf([x, side > 0 ? from : -to, AXLE_Z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const w = to - from;
  const slots = Ln(G.arcOf(F, w * 0.5, r, P, {}), { tone: "lo" });
  turned("chassis", F, [[0, r - 0.6], [0.4, r], [w, r]], { tone: "hi", cls: "carbon", name: `drum${x > 0 ? "F" : "R"}${side}`, inner: G.arcOf(F, w * 0.5, r, P, {}) });
  void slots;
}
function suspension() {
  // front: wishbones from the nose's flanks to an upright inside each wheel
  for (const side of [1, -1]) {
    const yu = side * 27;
    brakeDrum(FRONT_X, side, 31.5, 34, 9.4);
    const upPlan = { x: FRONT_X - 4, y: side > 0 ? 27 : -31.5, w: 8, d: 4.5, r: 1 };
    slab("chassis", upPlan, 10, 16, { tone: "mid", cls: "carbon", name: `uprightF${side}`, steps: 2 });
    const nosePt = (x, deg) => onBody(BODY, x, (side > 0 ? deg : 180 - deg) * DEG);
    tube("chassis", [nosePt(84, 34), [FRONT_X - 1.2, yu, 23]], 0.75, { name: `wbF.up.a${side}`, cls: "carbon" });
    tube("chassis", [nosePt(104, 34), [FRONT_X + 1.2, yu, 23]], 0.75, { name: `wbF.up.b${side}`, cls: "carbon" });
    tube("chassis", [nosePt(82, -18), [FRONT_X - 1.2, yu, 12.5]], 0.75, { name: `wbF.lo.a${side}`, cls: "carbon" });
    tube("chassis", [nosePt(102, -18), [FRONT_X + 1.2, yu, 12.5]], 0.75, { name: `wbF.lo.b${side}`, cls: "carbon" });
  }
  // rear: from the gearbox flanks to the rear uprights
  for (const side of [1, -1]) {
    const yu = side * 23;
    brakeDrum(REAR_X, side, 27.5, 30, 10);
    const upPlan = { x: REAR_X - 4, y: side > 0 ? 23 : -27.5, w: 8, d: 4.5, r: 1 };
    slab("chassis", upPlan, 10, 16, { tone: "mid", cls: "carbon", name: `uprightR${side}`, steps: 2 });
    const gy = side * 12;
    tube("chassis", [[-96, gy, 12], [REAR_X - 1.2, yu, 23]], 0.75, { name: `wbR.up.a${side}`, cls: "carbon" });
    tube("chassis", [[-72, gy, 12], [REAR_X + 1.2, yu, 23]], 0.75, { name: `wbR.up.b${side}`, cls: "carbon" });
    tube("chassis", [[-96, gy, 7], [REAR_X - 1.2, yu, 12.5]], 0.75, { name: `wbR.lo.a${side}`, cls: "carbon" });
    tube("chassis", [[-72, gy, 7], [REAR_X + 1.2, yu, 12.5]], 0.75, { name: `wbR.lo.b${side}`, cls: "carbon" });
  }
}

// ---------- wings ----------
const FLAP_PIVOT = [-115.5, 42.2];
const FLAP_CHORD = 15;
const FLAP_T = 1.6;
const FLAP_CLOSED = 26;
const FLAP_OPEN = 4;
const flapSection = (deg) => {
  const a = deg * DEG;
  const d = [-Math.cos(a), Math.sin(a)]; // chord runs back (−x) and up
  const n = [d[1], -d[0]]; // normal to the chord
  const [px, pz] = FLAP_PIVOT;
  const p = (along, off) => [px + d[0] * along + n[0] * off, pz + d[1] * along + n[1] * off];
  return [p(0, -FLAP_T / 2), p(FLAP_CHORD * 0.25, -FLAP_T * 0.7), p(FLAP_CHORD, -0.2), p(FLAP_CHORD, 0.3), p(FLAP_CHORD * 0.2, FLAP_T * 0.6), p(-0.4, 0)];
};
const FLAP_FRAMES = 12;
const SPAN = 38;

function rearWing() {
  const F = ALONG_Y();
  // crash structure and swan-neck pylon from the gearbox to the mainplane
  slab("chassis", { x: -118, y: -5, w: 18, d: 10, r: 1.5 }, 8, 6, { tone: "mid", cls: "carbon", name: "crash" });
  slab("chassis", { x: -117.6, y: -2, w: 0.6, d: 4, r: 0.2 }, 9, 3.4, { tone: "hi", cls: "rainlight", name: "rainlight", steps: 2, bevel: 0 });
  prism("chassis", F, [[-112, 3], [-100, 3], [-100, DECK], [-112, 8]], -27, 27, { cls: "carbon", name: "diffuser" });
  slab("chassis", { x: -116, y: -1, w: 4, d: 2, r: 0.6 }, 14, 22.6, { tone: "mid", cls: "carbon", name: "pylon", steps: 2, bevel: 0 });
  // beam wing and mainplane between the endplates
  prism("chassis", F, [[-124, 20], [-111, 20.6], [-111, 22.2], [-123, 22.2]], -SPAN, SPAN, { cls: "carbon", name: "beamwing" });
  prism("chassis", F, [[-132, 37.4], [-112, 36.6], [-110.6, 38.6], [-114, 40.2], [-130, 39.6]], -SPAN, SPAN, { cls: "carbon", name: "mainplane" });
  prism("chassis", F, [[-121, 23.6], [-112, 24], [-111.4, 25.4], [-120, 25.4]], -SPAN, SPAN, { cls: "carbon", name: "beamwing2" });
  // endplates: carbon, a red top band, louvre slots and a rain-light strip on the trailing edge
  for (const side of [1, -1]) {
    const y = side > 0 ? SPAN : -SPAN - 1.4;
    const plan = { x: -137, y, w: 32, d: 1.4, r: 0.5 };
    const face = side > 0 ? SPAN + 1.42 : null;
    const slots = face ? [0, 1, 2, 3, 4].map((i) => {
      const z = 21 + i * 2.2;
      return Ln(path([[-133, face, z], [-118, face, z + 1.4], [-118, face, z + 2.2], [-133, face, z + 0.8]]), { tone: "lo" });
    }).join("") : "";
    slab("chassis", plan, 18, 28, { tone: "hi", cls: "carbon", name: `endplate${side}`, steps: 2, bevel: 0, extra: slots });
    slab("chassis", { ...plan }, 46, 6, { tone: "hi", cls: "livery", name: `endplate.band${side}`, steps: 2, bevel: 0 });
  }
  // DRS actuator pod on the mainplane centre
  slab("chassis", { x: -118.5, y: -1.6, w: 4, d: 3.2, r: 1 }, 39.2, 3.2, { tone: "hi", cls: "metal", name: "drs.pod" });
  // the flap: every frame prebuilt, one shown at a time
  const frames = Array.from({ length: FLAP_FRAMES + 1 }, (_, i) => {
    const deg = FLAP_CLOSED + ((FLAP_OPEN - FLAP_CLOSED) * i) / FLAP_FRAMES;
    return `<g data-flap="${i}"${i ? ' style="display:none"' : ""}>${S(G.prismOf(F, flapSection(deg), -SPAN, SPAN, P), { tone: "hi", lit: true })}</g>`;
  }).join("");
  put("chassis", [-122, 0, 46], `<g data-part="flap">${frames}</g>`, [rec(A.prism(F, flapSection(FLAP_CLOSED), -SPAN, SPAN, { name: "flap" }))], { name: "flap", cls: "carbon" });
}

function frontWing() {
  const F = ALONG_Y();
  prism("chassis", F, [[118, 2.6], [141, 2.6], [144, 3.6], [141, 5.2], [121, 5]], -50, 50, { cls: "carbon", name: "fw.main" });
  for (const side of [1, -1]) {
    const span = (from, to) => (side > 0 ? [from, to] : [-to, -from]);
    prism("chassis", F, [[115, 5.6], [125, 5.8], [127, 8.0], [117, 7.2]], ...span(10, 50), { cls: "livery", name: `fw.flap1${side}` });
    prism("chassis", F, [[111.4, 7.8], [119, 8.4], [120.4, 10.8], [112.6, 9.8]], ...span(16, 50), { cls: "carbon", name: `fw.flap2${side}` });
    prism("chassis", F, [[108.6, 10.2], [113.6, 10.8], [114.6, 13.0], [109.6, 12.2]], ...span(26, 50), { cls: "livery", name: `fw.flap3${side}` });
    const y = side > 0 ? 50 : -51.4;
    slab("chassis", { x: 106, y, w: 39, d: 1.4, r: 0.5 }, 2.6, 10.4, { tone: "hi", cls: "carbon", name: `fw.end${side}`, steps: 2, bevel: 0 });
    slab("chassis", { x: 106, y, w: 39, d: 1.4, r: 0.5 }, 13, 2.2, { tone: "hi", cls: "livery", name: `fw.endtop${side}`, steps: 2, bevel: 0 });
    slab("chassis", { x: 120, y: side > 0 ? 51.4 : -54.4, w: 22, d: 3, r: 0.8 }, 2.6, 0.9, { tone: "mid", cls: "carbon", name: `fw.foot${side}`, steps: 2, bevel: 0 });
  }
  // nose pillars down to the mainplane
  for (const side of [1, -1]) slab("chassis", { x: 124, y: side * 3 - 0.5, w: 6, d: 1, r: 0.3 }, 5.2, onBody(BODY, 127, -Math.PI / 2)[2] - 5.2, { tone: "mid", cls: "carbon", name: `fw.pillar${side}`, steps: 2, bevel: 0 });
}

// ---------- what's inside (shown in the cutaway) ----------
function internals() {
  // seat moulded to the driver, fuel cell behind it
  prism("chassis", ALONG_Y(), [[20, DECK + 0.6], [49, DECK + 0.6], [49, 8.6], [27, 9.6], [23.4, 21.6], [20, 21.6]], -7.4, 7.4, { cls: "inner", name: "in.seat" });
  slab("chassis", { x: -23.6, y: -11.6, w: 41, d: 23.2, r: 4 }, DECK + 0.4, 18.6, { tone: "hi", cls: "inner", name: "in.fuel", steps: 6, bevel: 0.8, inner: Ln(k.sideSeam({ x: -23.6, y: -11.6, w: 41, d: 23.2, r: 4 }, DECK + 9, P, 6), { tone: "faint" }) });
  // pedal box: throttle and brake pedals, two master cylinders and their reservoir
  for (const [y, h] of [[-2.8, 8.6], [1.2, 9.6]]) slab("chassis", { x: 78, y, w: 1.4, d: 2.4, r: 0.4 }, 7.4, h, { tone: "hi", cls: "inner", name: `in.pedal${y}`, steps: 2, bevel: 0 });
  for (const y of [-2, 2.4]) turned("chassis", G.frameOf([82, y, 13], [1, 0, 0], [0, 1, 0], [0, 0, 1]), [[0, 1.1], [5, 1.1], [5, 0.6], [6.2, 0.6]], { tone: "hi", cls: "inner", name: `in.mc${y}` });
  turned("chassis", UP([86, 0.2, 15]), [[0, 1.3], [2.6, 1.3], [2.6, 0.7], [3.2, 0.7]], { tone: "hi", cls: "inner", name: "in.reservoir" });
  // steering rack across the nose, track rods out to the front uprights
  const RACK = G.frameOf([92, -7.5, 15], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  turned("chassis", RACK, [[0, 1.4], [15, 1.4]], { tone: "hi", cls: "inner", name: "in.rack", inner: G.arcOf(RACK, 4, 1.4, P, {}) + G.arcOf(RACK, 11, 1.4, P, {}) });
  for (const side of [1, -1]) tube("chassis", [[92, side * 7.5, 15], [FRONT_X + 3, side * 27, 16]], 0.55, { name: `in.trackrod${side}`, cls: "inner" });
  // heave damper with its spring, lying on top of the nose bulkhead
  const coil = k.coil(97, 107, [0, 18.4], 1.7, 6, "x", P);
  turned("chassis", G.frameOf([96, 0, 18.4], [1, 0, 0], [0, 1, 0], [0, 0, 1]), [[0, 0.9], [12, 0.9]], { tone: "hi", cls: "inner", name: "in.heave", extra: Ln(coil.back, { tone: "lo" }) + Ln(coil.front, { tone: "hi" }) });
  // side impact structures through the sidepods
  for (const side of [1, -1]) {
    tube("chassis", [[30, side * 15.6, 11], [30, side * 34, 11]], 1.6, { name: `in.sis.lo${side}`, cls: "inner" });
    tube("chassis", [[20, side * 15.6, 20], [20, side * 31, 20]], 1.3, { name: `in.sis.up${side}`, cls: "inner" });
  }
  // tailpipe from the turbine back over the gearbox to the exit under the beam wing
  tube("chassis", [[-29.5, 11.6, 21.5], [-36, 9, 24.4], [-90, 3, 20], [-110, 0, 18]], 1.5, { name: "in.tailpipe", cls: "hot", bend: 5 });
}

// ---------- assemble ----------
floorAndTub();
powerUnit();
cover();
suspension();
rearWing();
frontWing();
internals();
for (const [x, sp] of [[FRONT_X, FRONT], [REAR_X, REAR]]) for (const side of [1, -1]) wheel(x, side * sp.y, sp.w);

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
A.auditOrExit(R, P);

// Items that stay solid in the cutaway; everything else turns to a ghost outline.
const INSIDE = /^(pu\.|radiator|gearbox|crash|in\.|drum|upright|wb[FR]|rainlight|diffuser|plank)/;
const body = R.items
  .map((item) => `<g data-name="${item.name}"${INSIDE.test(item.name) ? " data-inside" : " data-ghost"}>${item.svg}</g>`)
  .join("");

// Labels for the cutaway, ScarbsTech-style: a dot on the part, a leader, the name in red.
// Each label goes in a row above or below the car; within a row they're ordered by where their part is,
// so leaders never cross, and pushed apart until no two names overlap.
const LABELS = [
  ["exhaust", [-80, 4, 21.2], "top"],
  ["power unit", [-46, 12, 18], "top"],
  ["brake duct", [REAR_X, 28.8, 27], "top"],
  ["turbo", [-29.5, -6, 25], "top"],
  ["fuel cell", [-4, -6, 23.4], "top"],
  ["heave damper", [102, 0, 18.4], "top"],
  ["brake duct", [FRONT_X, -32.8, 27], "top"],
  ["rear impact structure", [-112, 5, 11], "bottom"],
  ["gearbox case", [-86, 12, 9], "bottom"],
  ["radiators", [4, 34, 13], "bottom"],
  ["seat", [30, 4, 12], "bottom"],
  ["side impact structure", [30, 30, 11], "bottom"],
  ["pedals", [78, 0, 12], "bottom"],
  ["master cylinders", [84, 2.4, 13], "bottom"],
  ["steering rack", [92, 6, 15], "bottom"],
];
const LANE = { top: 44, bottom: H - 26 };
const textW = (t) => t.length * 6.1 + 6;
const placed = [];
for (const lane of ["top", "bottom"]) {
  const row = LABELS.filter((l) => l[2] === lane).map(([text, point]) => ({ text, a: at(point), w: textW(text) })).sort((p, q) => p.a[0] - q.a[0]);
  row.forEach((l, i) => (l.x = Math.max(l.a[0], i ? row[i - 1].x + (row[i - 1].w + l.w) / 2 + 12 : 12 + l.w / 2)));
  const over = row.length ? row[row.length - 1].x + row[row.length - 1].w / 2 - (W - 12) : 0;
  if (over > 0) for (let i = row.length - 1; i >= 0; i--) {
    const limit = i === row.length - 1 ? W - 12 - row[i].w / 2 : row[i + 1].x - (row[i].w + row[i + 1].w) / 2 - 12;
    row[i].x = Math.min(row[i].x, limit);
  }
  row.forEach((l, i) => placed.push({ ...l, y: LANE[lane] + (lane === "top" ? (i % 2) * 16 : -(i % 2) * 16), lane }));
}
const labels = placed.map(({ text, a: [x, y], x: tx, y: ty, lane }) => {
  const ly = lane === "top" ? ty + 5 : ty - 13;
  return `<g class="label"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7"/><path d="M${x.toFixed(1)} ${y.toFixed(1)}L${tx.toFixed(1)} ${ly.toFixed(1)}"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${text}</text></g>`;
}).join("");

const svg = k.figureSvg({
  width: W,
  height: H,
  label: "An isometric line drawing of a Formula 1 car on a display plinth. Hover the car for a cutaway that shows what is inside; hover the rear wing to open the DRS flap.",
  body: [plinth(), `<g class="car">${body}</g>`, `<g class="labels" aria-hidden="true">${labels}</g>`],
});

const CSS = `
.iso[data-theme="light"]{
  --ink:#2a1d17;--ghost:#cdbfae;--accent:#d40a00;--paper:#fbf6ee;
  --anatomy-page:#f1e6d6;--anatomy-card:#fbf6ee;--anatomy-text:#6b574a;--anatomy-strong:#241914;--anatomy-muted:#8f7a6a;
  --anatomy-paper:var(--paper);--anatomy-face:var(--paper);--anatomy-top:var(--paper);
  --anatomy-shade-0:#efe5d6;--anatomy-shade-1:#f4ecdf;--anatomy-shade-2:#f8f2e8;--anatomy-shade-3:var(--paper);
  --anatomy-lit-top:var(--paper);--anatomy-lit-shade:#f4ecdf;
  --anatomy-hi:var(--ink);--anatomy-mid:#6b574a;--anatomy-lo:#8f7a6a;--anatomy-faint:#c9b9a5;--anatomy-lit:var(--ink);
  --anatomy-halo:#7a5f48;--anatomy-halo-opacity:.18;--anatomy-dot:var(--ink);--anatomy-weight:.75px;
}
.iso-plate{background-color:var(--paper);background-image:linear-gradient(#e9ddcc 1px,transparent 1px),linear-gradient(90deg,#e9ddcc 1px,transparent 1px);background-size:22px 22px}
.iso-plate-corner[data-corner="fig"],.iso-plate-corner[data-corner="title"]{color:var(--ink)}
.car .iso-edge{stroke-width:1px}
.void{fill:#e6dac8;stroke:none}
.compound{stroke:var(--accent)!important;stroke-width:1.2px!important}
.stripe{stroke:var(--accent)!important;stroke-width:1px!important}
.gill-light{stroke:var(--anatomy-faint)!important}
.rainlight .iso-shade,.rainlight .iso-top,.rainlight .iso-fill{fill:var(--accent);stroke:var(--accent)}
.chq{fill:var(--ink);opacity:.8}
.hot{--anatomy-shade-0:#ead2b8;--anatomy-shade-1:#f0dcc6;--anatomy-shade-2:#f5e6d4;--anatomy-shade-3:#f9eee2}
/* cutaway */
.car [data-ghost] :is(.iso-fill,.iso-shade,.iso-top,.void,.tb-body,.tb-shine,.tb-shade,.iso-face-text){transition:fill-opacity .45s var(--anatomy-ease),stroke-opacity .45s var(--anatomy-ease)}
.car [data-ghost] .iso-line{transition:stroke .45s var(--anatomy-ease),stroke-opacity .45s}
.car [data-ghost] .iso-dots circle{transition:opacity .45s}
.xray .car [data-ghost] :is(.iso-fill,.iso-shade,.iso-top,.void,.tb-body,.tb-shine,.tb-shade,.iso-face-text){fill-opacity:0;stroke-opacity:0}
.xray .car [data-ghost] .iso-line{stroke:var(--ghost)!important}
.xray .car [data-ghost] .iso-dots circle{opacity:0}
.xray .car [data-ghost] [data-part="flap"] .iso-line{stroke:var(--ghost)}
.xray .car [data-inside] .iso-edge{stroke-width:1.15px}
.labels{opacity:0;transition:opacity .35s var(--anatomy-ease) .1s;pointer-events:none}
.xray .labels{opacity:1}
.label circle{fill:var(--accent)}
.label path{stroke:var(--accent);stroke-width:.8px;fill:none}
.label text{fill:var(--accent);font:700 11.5px/1 "Titillium Web",ui-sans-serif,system-ui,sans-serif;letter-spacing:.01em}
.iso-stage{outline:none;cursor:pointer;touch-action:pan-y}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
@media (prefers-reduced-motion:reduce){.car *,.labels{transition:none!important}}
`;

const live = `
const P = ${JSON.stringify(P)};
const FRAMES = ${FLAP_FRAMES};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const flaps = [...svg.querySelectorAll("[data-flap]")];
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
let xray = false, drs = { x: 0, v: 0, target: 0 }, frame = 0, last = 0, shown = 0;
function spring(s, dt, k, c, calm) {
  if (calm) { s.x = s.target; s.v = 0; return false; }
  for (let i = 0; i < 4; i++) { s.v += ((s.target - s.x) * k - s.v * c) * dt / 4; s.x += s.v * dt / 4; }
  if (Math.abs(s.target - s.x) < 5e-4 && Math.abs(s.v) < 5e-4) { s.x = s.target; s.v = 0; return false; }
  return true;
}
function say() {
  const wing = drs.x > 0.6 ? "DRS open" : drs.x > 0.02 ? (drs.target ? "DRS opening" : "DRS closing") : "DRS closed";
  const text = (xray ? "cutaway · what's inside" : "bodywork on") + " · " + wing;
  if (readout.textContent !== text) readout.textContent = text;
}
function setXray(on) { if (on !== xray) { xray = on; stage.classList.toggle("xray", on); say(); } }
function draw() {
  const f = Math.max(0, Math.min(FRAMES, Math.round(drs.x * FRAMES)));
  if (f !== shown) { flaps[shown].style.display = "none"; flaps[f].style.display = ""; shown = f; }
  say();
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const moving = spring(drs, dt, 120, 22, still.matches);
  draw();
  frame = moving ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame) { last = 0; frame = requestAnimationFrame(tick); } };
const WING = /^(mainplane|flap|endplate|beamwing|drs|pylon)/;
const onWing = (e) => WING.test(e.target.closest("[data-name]")?.dataset.name ?? "");
stage.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const wing = onWing(e);
  drs.target = wing ? 1 : 0;
  setXray(!wing);
  run();
});
stage.addEventListener("pointerleave", () => { drs.target = 0; setXray(false); run(); });
stage.addEventListener("click", (e) => {
  if (onWing(e)) drs.target = drs.target ? 0 : 1; else setXray(!xray);
  run();
});
stage.addEventListener("keydown", (e) => {
  if (e.key === "x" || e.key === "X" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setXray(!xray); }
  if (e.key === "d" || e.key === "D") { drs.target = drs.target ? 0 : 1; run(); }
  if (e.key === "Escape") { drs.target = 0; setXray(false); run(); }
});
draw();
`;

const plate = k.plateHtml({
  fig: "Fig. 1",
  title: "PitWall · 2026 car",
  hint: "Hover the car for the cutaway · hover the rear wing",
  readout: "bodywork on · DRS closed",
  keys: [
    { mark: "edge", label: "Bodywork, wings and wheels: ghosted in the cutaway" },
    { mark: "raised", label: "What's inside: power unit, radiators, fuel cell, seat, pedals, steering" },
  ],
  caption: "Hover the car and the bodywork turns to a ghost outline so you can see what's inside. Hover the rear wing and the DRS flap opens. Keys: X for the cutaway, D for DRS.",
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="F1 car: press X for the cutaway, D to open the DRS flap">${svg}</div>`,
});

if (PAGE) {
  // The kit source contains the literal tags "</body>" and "</html>"; escape them so a host that injects before </body> can't split the script.
  const SCRIPT = (kitScript() + live).replace(/<\/(body|html)>/g, "<\\/$1>");
  writeFileSync(PAGE, k.pageHtml({ title: "PitWall car", theme: "light", body: `<style>${CSS}</style>${plate}`, script: SCRIPT, width: 940 }));
  console.log("wrote", PAGE, R.items.length, "items");
} else {
  // For the site: the figure markup and its styles. CarHero.jsx wires the interaction.
  const css = (k.ISO_CSS + CSS).replace(/\s*\n\s*/g, "");
  writeFileSync(MODULE, `// Generated by frontend/hero/build-car.mjs. Do not edit by hand.\nexport const CAR_CSS = ${JSON.stringify(css)};\nexport const CAR_HTML = ${JSON.stringify(plate)};\n`);
  console.log("wrote", MODULE.pathname, R.items.length, "items");
}
