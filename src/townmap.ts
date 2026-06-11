// ============================================================
// AZ Tamer — labeled area minimaps for Haven City streets and
// building interiors. Draws into the shared #minimap canvas:
// structures, doors and NPCs get dots + name labels, and the
// player is a facing arrow.
// ============================================================

export interface MapMarker {
  x: number; z: number;
  label?: string;
  color: string;
  /** building = square, poi = diamond, npc = dot, door = bar */
  kind: 'building' | 'poi' | 'npc' | 'door';
}

export interface AreaMapOpts {
  /** circular grounds (street) or rectangular room (interior) */
  shape: 'circle' | 'rect';
  radius?: number;          // world radius when circle
  w?: number; d?: number;   // room size when rect
  markers: MapMarker[];
  player: { x: number; z: number; rot: number };
  title: string;
}

const SIZE = 250;

export function drawAreaMap(cv: HTMLCanvasElement, o: AreaMapOpts): void {
  if (cv.width !== SIZE) { cv.width = SIZE; cv.height = SIZE; }
  cv.style.display = 'block';
  const c = cv.getContext('2d')!;
  const m = SIZE / 2;

  c.clearRect(0, 0, SIZE, SIZE);
  c.fillStyle = 'rgba(6,8,16,0.92)';
  c.fillRect(0, 0, SIZE, SIZE);

  // world → map transform
  let sc: number;
  if (o.shape === 'circle') {
    const R = o.radius ?? 36;
    sc = (m - 16) / R;
  } else {
    sc = Math.min((SIZE - 36) / (o.w ?? 18), (SIZE - 52) / (o.d ?? 13));
  }
  const tx = (x: number) => m + x * sc;
  const tz = (z: number) => m + 8 + z * sc;

  // grounds
  if (o.shape === 'circle') {
    const R = (o.radius ?? 36) * sc;
    const grd = c.createRadialGradient(m, m + 8, R * 0.2, m, m + 8, R);
    grd.addColorStop(0, '#1c2a1a'); grd.addColorStop(1, '#101a10');
    c.beginPath(); c.arc(m, m + 8, R, 0, Math.PI * 2);
    c.fillStyle = grd; c.fill();
    c.strokeStyle = '#2c3666'; c.lineWidth = 2; c.stroke();
    // central plaza
    c.beginPath(); c.arc(tx(0), tz(0), 7 * sc, 0, Math.PI * 2);
    c.fillStyle = '#3a3424'; c.fill();
  } else {
    const w = (o.w ?? 18) * sc, d = (o.d ?? 13) * sc;
    c.fillStyle = '#221c2e';
    c.fillRect(m - w / 2, m + 8 - d / 2, w, d);
    c.strokeStyle = '#2c3666'; c.lineWidth = 2;
    c.strokeRect(m - w / 2, m + 8 - d / 2, w, d);
  }

  // markers + labels
  c.textAlign = 'center';
  for (const mk of o.markers) {
    const x = tx(mk.x), y = tz(mk.z);
    c.fillStyle = mk.color;
    if (mk.kind === 'building') {
      c.fillRect(x - 4, y - 4, 8, 8);
    } else if (mk.kind === 'poi') {
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.fillRect(-3.6, -3.6, 7.2, 7.2);
      c.restore();
    } else if (mk.kind === 'door') {
      c.fillRect(x - 5, y - 2, 10, 4);
    } else {
      c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
    }
    if (mk.label) {
      c.font = 'bold 9px Trebuchet MS';
      c.lineWidth = 3; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.lineJoin = 'round';
      c.strokeText(mk.label, x, y - 7);
      c.fillStyle = mk.color;
      c.fillText(mk.label, x, y - 7);
    }
  }

  // player arrow (faces rot; world rot 0 = +Z which is down-screen)
  const px = tx(o.player.x), py = tz(o.player.z);
  c.save();
  c.translate(px, py);
  c.rotate(Math.PI - o.player.rot);
  c.beginPath();
  c.moveTo(0, -6.5); c.lineTo(4.5, 5); c.lineTo(0, 2.4); c.lineTo(-4.5, 5);
  c.closePath();
  c.fillStyle = '#ffffff';
  c.shadowColor = '#f2c14e'; c.shadowBlur = 6;
  c.fill();
  c.restore();

  // title band
  c.fillStyle = 'rgba(12,16,34,0.85)';
  c.fillRect(0, 0, SIZE, 16);
  c.font = 'bold 10px Trebuchet MS';
  c.fillStyle = '#f2c14e';
  c.textAlign = 'center';
  c.fillText(o.title.toUpperCase(), m, 11.5);
}

export function hideAreaMap(cv: HTMLCanvasElement): void {
  cv.style.display = 'none';
}
