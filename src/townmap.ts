// ============================================================
// AZ Tamer — labeled area minimaps for Haven City streets and
// building interiors. Draws into the shared #minimap canvas:
// structures, doors and NPCs get dots + name labels, and the
// player is a facing arrow.
// ============================================================

import { questState, QUESTS } from './quests';
import type { Player } from './state';

export interface MapMarker {
  x: number; z: number;
  label?: string;
  color: string;
  /** building = square, poi = diamond, npc = dot, door = bar */
  kind: 'building' | 'poi' | 'npc' | 'door';
  quest?: boolean;
  questKinds?: ('story' | 'main' | 'side')[];
  highlight?: boolean;
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
    const activeQuestIds: string[] = [];
    const label = mk.label.toLowerCase();
    
    // Haven City / Town
    if (t.includes('haven') || t.includes('pyrelight') || t.includes('mistveil') || t.includes('thornward') || t.includes('stormcall') || t.includes('duskwatch')) {
      if (label.includes('azrin') && label.includes('azrael')) {
        const state = questState(p, 'story_daughters');
        if (state === 'active' || state === 'ready') activeQuestIds.push('story_daughters');
      }
      if (label.includes('pyrelight')) {
        const list = ['pyrelight_m1', 'pyrelight_m2', 'pyrelight_m3', 'pyrelight_m4'];
        for (const id of list) {
          const s = questState(p, id);
          if (s === 'active' || s === 'ready') activeQuestIds.push(id);
        }
      }
      if (label.includes('mistveil')) {
        const list = ['mistveil_m1', 'mistveil_m2', 'mistveil_m3', 'mistveil_m4'];
        for (const id of list) {
          const s = questState(p, id);
          if (s === 'active' || s === 'ready') activeQuestIds.push(id);
        }
      }
      if (label.includes('thornward')) {
        const list = ['thornward_m1', 'thornward_m2', 'thornward_m3', 'thornward_m4'];
        for (const id of list) {
          const s = questState(p, id);
          if (s === 'active' || s === 'ready') activeQuestIds.push(id);
        }
      }
      if (label.includes('stormcall')) {
        const list = ['stormcall_m1', 'stormcall_m2', 'stormcall_m3', 'stormcall_m4'];
        for (const id of list) {
          const s = questState(p, id);
          if (s === 'active' || s === 'ready') activeQuestIds.push(id);
        }
      }
      if (label.includes('duskwatch')) {
        const list = ['duskwatch_m1', 'duskwatch_m2', 'duskwatch_m3', 'duskwatch_m4'];
        for (const id of list) {
          const s = questState(p, id);
          if (s === 'active' || s === 'ready') activeQuestIds.push(id);
        }
      }
      if (label.includes('anglers') || label.includes('wharf') || label.includes('pete') || label.includes('pond')) {
        const sFish = questState(p, 'side_fishing');
        if (sFish === 'active' || sFish === 'ready') activeQuestIds.push('side_fishing');
      }
    }
    
    // Agdao Island
    if (t.includes('agdao')) {
      if (label.includes('bluff')) {
        const sAgdao = questState(p, 'story_agdao');
        const sCradle = questState(p, 'story_cradle');
        const sEchoes = questState(p, 'story_echoes');
        if (sAgdao === 'active' || sAgdao === 'ready') activeQuestIds.push('story_agdao');
        if (sCradle === 'ready') activeQuestIds.push('story_cradle');
        if (sEchoes === 'ready') activeQuestIds.push('story_echoes');
      }
      if (label.includes('cradle hollow')) {
        const sCradle = questState(p, 'story_cradle');
        if (sCradle === 'active') activeQuestIds.push('story_cradle');
      }
    }
    
    // University
    if (t.includes('university')) {
      if (label.includes('library')) {
        const sHist = questState(p, 'story_historian'), sAmber = questState(p, 'story_amber'), sWren = questState(p, 'side_ledger');
        if (sHist === 'active' || sHist === 'ready') activeQuestIds.push('story_historian');
        if (sAmber === 'ready') activeQuestIds.push('story_amber');
        if (sWren === 'active' || sWren === 'ready') activeQuestIds.push('side_ledger');
      }
      if (label.includes('cafeteria')) {
        const sChef = questState(p, 'side_chef'), sWren = questState(p, 'side_ledger');
        if (sChef === 'active' || sChef === 'ready') activeQuestIds.push('side_chef');
        if (sWren === 'active' || sWren === 'ready') activeQuestIds.push('side_ledger');
      }
      if (label.includes('lobby')) {
        const sNiko = questState(p, 'side_niko'), sTomas = questState(p, 'side_wrench');
        if (sNiko === 'active' || sNiko === 'ready') activeQuestIds.push('side_niko');
        if (sTomas === 'active' || sTomas === 'ready') activeQuestIds.push('side_wrench');
      }
      if (label.includes('locker room')) {
        const sTomas = questState(p, 'side_wrench');
        if (sTomas === 'active' || sTomas === 'ready') activeQuestIds.push('side_wrench');
      }
      if (label.includes('classroom')) {
        const sLyra = questState(p, 'side_quiz');
        if (sLyra === 'active' || sLyra === 'ready') activeQuestIds.push('side_quiz');
      }
      if (label.includes('training hall')) {
        const sKade = questState(p, 'side_spar');
        if (sKade === 'active' || sKade === 'ready') activeQuestIds.push('side_spar');
      }
    }
    
    // New Salmonan
    if (t.includes('salmonan')) {
      const sVeil = questState(p, 'story_veilfall');
      if (sVeil === 'active' || sVeil === 'ready') {
        if (label.includes('relay tower') && !p.flags['salm_proof_relay']) activeQuestIds.push('story_veilfall');
        if (label.includes('market') && !p.flags['salm_proof_crystal']) activeQuestIds.push('story_veilfall');
        if (label.includes('mural') && !p.flags['salm_proof_stringer']) activeQuestIds.push('story_veilfall');
        if (label.includes('ivan') && p.flags['salm_proof_relay'] && p.flags['salm_proof_crystal'] && p.flags['salm_proof_stringer']) activeQuestIds.push('story_veilfall');
      }
    }
    
    let highlight = mk.highlight;
    if (t.includes('haven')) {
      const sRoads = questState(p, 'story_roads');
      if (sRoads === 'active' && label.includes('gate')) {
        highlight = true;
      }
      const sHist = questState(p, 'story_historian');
      if (sHist === 'active' && label.includes('skyport')) {
        highlight = true;
      }
      const sAmber = questState(p, 'story_amber');
      if (sAmber === 'active' || sAmber === 'ready') {
        const hasAmber = p.itemCount('storm_amber') >= 1;
        if (!hasAmber && label.includes('gate')) {
          highlight = true;
        } else if (hasAmber && label.includes('skyport')) {
          highlight = true;
        }
      }
      const sAgdao = questState(p, 'story_agdao');
      if (sAgdao === 'active' && label.includes('gate')) {
        highlight = true;
      }
      const sDaughters = questState(p, 'story_daughters');
      if (sDaughters === 'active' && (label.includes('azrin') || label.includes('azrael'))) {
        highlight = true;
      }
    } else if (t.includes('skyport') || t.includes('aetherline')) {
      const sHist = questState(p, 'story_historian');
      const sAmber = questState(p, 'story_amber');
      const hasAmber = p.itemCount('storm_amber') >= 1;
      const needsUniversity = (sHist === 'active') || (sAmber === 'active' && hasAmber) || (sAmber === 'ready');
      if (needsUniversity && (label.includes('pod') || label.includes('transport'))) {
        highlight = true;
      }
    }
    
    if (activeQuestIds.length > 0) {
      const questKinds = activeQuestIds.map(id => QUESTS[id]?.kind).filter(Boolean) as ('story' | 'main' | 'side')[];
      return { ...mk, quest: true, questKinds, highlight };
    }
    return { ...mk, highlight };
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

    if (mk.highlight) {
      const time = Date.now() * 0.005;
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      const radius = 8 + pulse * 4.5;
      c.save();
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fillStyle = `rgba(242, 193, 78, ${0.12 + 0.22 * (1 - pulse)})`;
      c.fill();
      
      c.beginPath();
      c.arc(x, y, 7.5, 0, Math.PI * 2);
      c.strokeStyle = '#f2c14e';
      c.lineWidth = 1.6;
      c.stroke();
      c.restore();
    }

    if (mk.quest) {
      const kinds = mk.questKinds && mk.questKinds.length > 0 ? mk.questKinds : [];
      if (kinds.length === 0) {
        // Fallback to original single red exclamation mark
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
        // Render custom badges side-by-side
        const N = kinds.length;
        const spacing = 15;
        const time = Date.now() * 0.005;
        const pulse = 0.5 + 0.5 * Math.sin(time * 2);
        
        c.save();
        kinds.forEach((kind, i) => {
          const cx = x + (i - (N - 1) / 2) * spacing;
          const cy = y;
          
          let bgColor = '#e85a6a';
          let emoji = '❗';
          if (kind === 'story') {
            bgColor = '#f2c14e';
            emoji = '📜';
          } else if (kind === 'main') {
            bgColor = '#e85a6a';
            emoji = '⚔️';
          } else if (kind === 'side') {
            bgColor = '#5ab8e8';
            emoji = '🤝';
          }
          
          const haloRadius = 6 + pulse * 3.5;
          c.beginPath();
          c.arc(cx, cy, haloRadius, 0, Math.PI * 2);
          c.fillStyle = bgColor === '#f2c14e' 
            ? `rgba(242, 193, 78, ${0.15 + 0.25 * (1 - pulse)})` 
            : bgColor === '#5ab8e8'
            ? `rgba(90, 184, 232, ${0.15 + 0.25 * (1 - pulse)})`
            : `rgba(232, 90, 106, ${0.15 + 0.25 * (1 - pulse)})`;
          c.fill();
          
          c.beginPath();
          c.arc(cx, cy, 6.5, 0, Math.PI * 2);
          c.fillStyle = bgColor;
          c.strokeStyle = '#ffffff';
          c.lineWidth = 1.2;
          c.stroke();
          c.fill();
          
          const bob = Math.sin(time * 3.5 + i * 1.5) * 1.2;
          c.fillStyle = '#ffffff';
          c.font = '10px sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(emoji, cx, cy + bob);
        });
        c.restore();
      }
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
      const labelY = mk.quest ? y - 9 : y - 7;
      c.strokeText(mk.label, x, labelY);
      c.fillStyle = mk.quest ? '#e85a6a' : mk.color;
      c.fillText(mk.label, x, labelY);
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
