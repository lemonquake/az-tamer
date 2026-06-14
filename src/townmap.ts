// ============================================================
// AZ Tamer — labeled area minimaps for Haven City streets and
// building interiors. Draws into the shared #minimap canvas:
// structures, doors and NPCs get dots + name labels, and the
// player is a facing arrow.
// ============================================================

import { questState } from './quests';
import type { Player } from './state';

export interface MapMarker {
  x: number; z: number;
  label?: string;
  color: string;
  /** building = square, poi = diamond, npc = dot, door = bar */
  kind: 'building' | 'poi' | 'npc' | 'door';
  quest?: boolean;
}

export interface AreaMapOpts {
  /** circular grounds (street) or rectangular room (interior) */
  shape: 'circle' | 'rect';
  radius?: number;          // world radius when circle
  w?: number; d?: number;   // room size when rect
  markers: MapMarker[];
  player: { x: number; z: number; rot: number };
  title: string;
  playerState?: Player;
}

function decorateQuestMarkers(p: Player, markers: MapMarker[], title: string): MapMarker[] {
  const t = title.toLowerCase();
  
  return markers.map(mk => {
    if (!mk.label) return mk;
    let isQuest = false;
    const label = mk.label.toLowerCase();
    
    // Haven City / Town
    if (t.includes('haven') || t.includes('pyrelight') || t.includes('mistveil') || t.includes('thornward') || t.includes('stormcall') || t.includes('duskwatch')) {
      if (label.includes('azrin') && label.includes('azrael')) {
        const state = questState(p, 'story_daughters');
        if (state === 'active' || state === 'ready') isQuest = true;
      }
      if (label.includes('pyrelight')) {
        const s1 = questState(p, 'pyrelight_m1'), s2 = questState(p, 'pyrelight_m2'), s3 = questState(p, 'pyrelight_m3'), s4 = questState(p, 'pyrelight_m4');
        if (s1 === 'active' || s1 === 'ready' || s2 === 'active' || s2 === 'ready' || s3 === 'active' || s3 === 'ready' || s4 === 'active' || s4 === 'ready') isQuest = true;
      }
      if (label.includes('mistveil')) {
        const s1 = questState(p, 'mistveil_m1'), s2 = questState(p, 'mistveil_m2'), s3 = questState(p, 'mistveil_m3'), s4 = questState(p, 'mistveil_m4');
        if (s1 === 'active' || s1 === 'ready' || s2 === 'active' || s2 === 'ready' || s3 === 'active' || s3 === 'ready' || s4 === 'active' || s4 === 'ready') isQuest = true;
      }
      if (label.includes('thornward')) {
        const s1 = questState(p, 'thornward_m1'), s2 = questState(p, 'thornward_m2'), s3 = questState(p, 'thornward_m3'), s4 = questState(p, 'thornward_m4');
        if (s1 === 'active' || s1 === 'ready' || s2 === 'active' || s2 === 'ready' || s3 === 'active' || s3 === 'ready' || s4 === 'active' || s4 === 'ready') isQuest = true;
      }
      if (label.includes('stormcall')) {
        const s1 = questState(p, 'stormcall_m1'), s2 = questState(p, 'stormcall_m2'), s3 = questState(p, 'stormcall_m3'), s4 = questState(p, 'stormcall_m4');
        if (s1 === 'active' || s1 === 'ready' || s2 === 'active' || s2 === 'ready' || s3 === 'active' || s3 === 'ready' || s4 === 'active' || s4 === 'ready') isQuest = true;
      }
      if (label.includes('duskwatch')) {
        const s1 = questState(p, 'duskwatch_m1'), s2 = questState(p, 'duskwatch_m2'), s3 = questState(p, 'duskwatch_m3'), s4 = questState(p, 'duskwatch_m4');
        if (s1 === 'active' || s1 === 'ready' || s2 === 'active' || s2 === 'ready' || s3 === 'active' || s3 === 'ready' || s4 === 'active' || s4 === 'ready') isQuest = true;
      }
    }
    
    // Agdao Island
    if (t.includes('agdao')) {
      if (label.includes('bluff')) {
        const sAgdao = questState(p, 'story_agdao');
        const sCradle = questState(p, 'story_cradle');
        const sEchoes = questState(p, 'story_echoes');
        if (sAgdao === 'active' || sAgdao === 'ready' || sCradle === 'ready' || sEchoes === 'ready') isQuest = true;
      }
      if (label.includes('cradle hollow')) {
        const sCradle = questState(p, 'story_cradle');
        if (sCradle === 'active') isQuest = true;
      }
    }
    
    // University
    if (t.includes('university')) {
      if (label.includes('library')) {
        const sHist = questState(p, 'story_historian'), sAmber = questState(p, 'story_amber'), sWren = questState(p, 'side_ledger');
        if (sHist === 'active' || sHist === 'ready' || sAmber === 'ready' || sWren === 'active' || sWren === 'ready') isQuest = true;
      }
      if (label.includes('cafeteria')) {
        const sChef = questState(p, 'side_chef'), sWren = questState(p, 'side_ledger');
        if (sChef === 'active' || sChef === 'ready' || sWren === 'active' || sWren === 'ready') isQuest = true;
      }
      if (label.includes('lobby')) {
        const sNiko = questState(p, 'side_niko'), sTomas = questState(p, 'side_wrench');
        if (sNiko === 'active' || sNiko === 'ready' || sTomas === 'active' || sTomas === 'ready') isQuest = true;
      }
      if (label.includes('locker room')) {
        const sTomas = questState(p, 'side_wrench');
        if (sTomas === 'active' || sTomas === 'ready') isQuest = true;
      }
      if (label.includes('classroom')) {
        const sLyra = questState(p, 'side_quiz');
        if (sLyra === 'active' || sLyra === 'ready') isQuest = true;
      }
      if (label.includes('training hall')) {
        const sKade = questState(p, 'side_spar');
        if (sKade === 'active' || sKade === 'ready') isQuest = true;
      }
    }
    
    // New Salmonan
    if (t.includes('salmonan')) {
      const sVeil = questState(p, 'story_veilfall');
      if (sVeil === 'active' || sVeil === 'ready') {
        if (label.includes('relay tower') && !p.flags['salm_proof_relay']) isQuest = true;
        if (label.includes('market') && !p.flags['salm_proof_crystal']) isQuest = true;
        if (label.includes('mural') && !p.flags['salm_proof_stringer']) isQuest = true;
        if (label.includes('ivan') && p.flags['salm_proof_relay'] && p.flags['salm_proof_crystal'] && p.flags['salm_proof_stringer']) isQuest = true;
      }
    }
    
    if (isQuest) {
      return { ...mk, quest: true };
    }
    return mk;
  });
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

  const finalMarkers = o.playerState ? decorateQuestMarkers(o.playerState, o.markers, o.title) : o.markers;

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
  for (const mk of finalMarkers) {
    const x = tx(mk.x), y = tz(mk.z);
    c.fillStyle = mk.color;
    
    if (mk.quest) {
      const time = Date.now() * 0.005;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2);
      const radius = 6 + pulse * 3.5;
      c.save();
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fillStyle = `rgba(232, 90, 106, ${0.15 + 0.25 * (1 - pulse)})`;
      c.fill();
      
      c.beginPath();
      c.arc(x, y, 6.5, 0, Math.PI * 2);
      c.fillStyle = '#e85a6a';
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.2;
      c.stroke();
      c.fill();
      
      const bob = Math.sin(time * 3.5) * 1.5;
      c.fillStyle = '#ffffff';
      c.font = 'bold 10px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('!', x, y + bob - 0.5);
      c.restore();
    } else {
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
    }
    
    if (mk.label) {
      c.font = 'bold 9px Trebuchet MS';
      c.lineWidth = 3; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.lineJoin = 'round';
      c.strokeText(mk.label, x, y - 7);
      c.fillStyle = mk.quest ? '#e85a6a' : mk.color;
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
