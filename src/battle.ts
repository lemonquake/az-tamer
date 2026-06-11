// ============================================================
// AZ Tamer — battle engine (3v3, speed-ordered turns, AI,
// gifting/capture, EXP, evolution) with 3D presentation
// ============================================================
import * as THREE from 'three';
import {
  TECHS, ITEMS, TYPE_CSS, TYPE_COLORS, TYPE_ELEMENT,
  elementsOf, elementMult, ELEMENT_ICONS, type Technique,
} from './data';
import { sfx } from './audio';
import { Guardian, Player } from './state';
import {
  makeGuardian, disposeRig, tween, wait, Ease, makeFloatingDamageText,
  stoneTexture, skyGradient, type GuardianRig,
} from './models';
import { say, choose, toast, askName, setStoryInBattle } from './ui';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export type BattleResult = 'win' | 'lose' | 'flee';

export interface BattleView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
}

interface Unit {
  g: Guardian;
  side: 'player' | 'enemy';
  slot: number;
  rig: GuardianRig;
  guarding: boolean;
  mods: { atk: number; def: number; spd: number };
  bond: number;       // gift bond (wild enemies)
  favor: number;      // hidden per-enemy gift taste multiplier
  wild: boolean;
  cardEl?: HTMLElement;
}

export interface BattleOptions {
  boss?: boolean;
  wild?: boolean;            // enemies capturable via gifting
  intro?: string;            // log line at start
  theme?: 'cavern' | 'vault' | 'storm';
  firstStrike?: boolean;     // crawler cannon stun: enemies skip round 1
}

interface EnemySpec { speciesId: string; level: number; }

const THEME_COLORS: Record<string, { sky: [string, string]; floor: string; fog: number }> = {
  cavern: { sky: ['#1a1430', '#060810'], floor: '#3a3f52', fog: 0x0a0c18 },
  vault: { sky: ['#0e2238', '#04101c'], floor: '#2e4a5a', fog: 0x081018 },
  storm: { sky: ['#2a2440', '#0a0814'], floor: '#3a3a4e', fog: 0x100c20 },
};

export class Battle {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  private units: Unit[] = [];
  private round = 0;
  private camT = 0;
  private spotlight!: THREE.PointLight;

  constructor(private player: Player, private enemySpecs: EnemySpec[], private opts: BattleOptions) {}

  get view(): BattleView {
    return { scene: this.scene, camera: this.camera, update: (dt) => this.updateView(dt) };
  }

  private updateView(dt: number): void {
    this.camT += dt;
    // gentle camera drift
    this.camera.position.x = Math.sin(this.camT * 0.18) * 0.6;
    this.camera.position.y = 4.6 + Math.sin(this.camT * 0.13) * 0.15;
    this.camera.lookAt(0, 0.8, 0);
  }

  // ---------- setup ----------
  private buildArena(): void {
    const theme = THEME_COLORS[this.opts.theme ?? 'cavern'];
    this.scene.background = skyGradient(theme.sky[0], theme.sky[1]);
    this.scene.fog = new THREE.Fog(theme.fog, 14, 30);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7.6, 0.5, 36),
      new THREE.MeshStandardMaterial({ map: stoneTexture(theme.floor, '#1a1e2a', 3), roughness: 0.9 })
    );
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6.4, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
    this.scene.add(ring);

    this.scene.add(new THREE.AmbientLight(0x8a93c0, 0.7));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.4);
    key.position.set(4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    this.spotlight = new THREE.PointLight(0x5a7bd8, 18, 22);
    this.spotlight.position.set(0, 6, 0);
    this.scene.add(this.spotlight);

    // floating dust motes
    const pts = new Float32Array(240);
    for (let i = 0; i < pts.length; i++) pts[i] = (Math.random() - 0.5) * 14;
    const dust = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pts, 3)),
      new THREE.PointsMaterial({ color: 0x8a93c0, size: 0.05, transparent: true, opacity: 0.5 })
    );
    dust.position.y = 3;
    this.scene.add(dust);

    this.camera.position.set(0, 4.6, 9.2);
    this.camera.lookAt(0, 0.8, 0);
  }

  private slotPos(side: 'player' | 'enemy', slot: number): THREE.Vector3 {
    const x = side === 'player' ? -2.6 : 2.6;
    return new THREE.Vector3(x, 0, (slot - 1) * 2.3);
  }

  private spawnUnit(g: Guardian, side: 'player' | 'enemy', slot: number): Unit {
    const rig = makeGuardian(g.speciesId);
    rig.group.position.copy(this.slotPos(side, slot));
    rig.group.rotation.y = side === 'player' ? Math.PI / 2 : -Math.PI / 2;
    this.scene.add(rig.group);
    const u: Unit = {
      g, side, slot, rig, guarding: false,
      mods: { atk: 1, def: 1, spd: 1 },
      bond: 0, favor: 0.8 + Math.random() * 0.6,
      wild: side === 'enemy' && !!this.opts.wild,
    };
    if (g.fainted) { rig.group.visible = false; }
    return u;
  }

  // ---------- UI ----------
  private log(msg: string): void { $('battle-log').innerHTML = msg; }

  private renderCards(): void {
    const wrap = $('battle-parties');
    wrap.innerHTML = '';
    const mk = (u: Unit) => {
      const el = document.createElement('div');
      el.className = `unit-card${u.g.fainted ? ' dead' : ''}`;
      const s = u.g.stats;
      const side = u.side === 'enemy' ? `<span style="color:var(--ui-red)">FOE</span> ` : '';
      const els = elementsOf(u.g.speciesId).map(e => ELEMENT_ICONS[e]).join('');
      el.innerHTML = `<div class="nm"><span style="color:${TYPE_CSS[u.g.species.type]}">${side}${u.g.nickname}</span><span><span style="font-size:11px" title="${elementsOf(u.g.speciesId).join(' · ')}">${els}</span> Lv${u.g.level}</span></div>
        <div class="minibar hp"><div style="width:${Math.max(0, (u.g.hp / s.hp)) * 100}%"></div></div>
        <div class="minibar sp"><div style="width:${Math.max(0, (u.g.sp / s.sp)) * 100}%"></div></div>`;
      u.cardEl = el;
      wrap.appendChild(el);
    };
    this.units.filter(u => u.side === 'enemy').forEach(mk);
    this.units.filter(u => u.side === 'player').forEach(mk);
  }

  private highlight(u: Unit | null): void {
    this.units.forEach(x => x.cardEl?.classList.toggle('active', x === u));
  }

  private menu(buttons: { label: string; disabled?: boolean; cls?: string }[]): Promise<number> {
    return new Promise(resolve => {
      const m = $('battle-menu');
      m.innerHTML = '';
      m.style.display = 'block';
      buttons.forEach((b, i) => {
        const btn = document.createElement('button');
        btn.className = `ui-btn ${b.cls ?? ''}`;
        btn.innerHTML = b.label;
        btn.disabled = !!b.disabled;
        btn.onclick = () => { m.style.display = 'none'; resolve(i); };
        m.appendChild(btn);
      });
    });
  }

  // ---------- animations ----------
  /** Rotate a unit to face a world position (models face +Z at rotation 0). */
  private faceTo(u: Unit, pos: THREE.Vector3): void {
    const d = pos.clone().sub(u.rig.group.position);
    if (d.lengthSq() > 0.001) u.rig.group.rotation.y = Math.atan2(d.x, d.z);
  }
  /** Restore a unit's default battle-line facing (toward the opposing side). */
  private faceHome(u: Unit): void {
    u.rig.group.rotation.y = u.side === 'player' ? Math.PI / 2 : -Math.PI / 2;
  }

  private async lungeAttack(att: Unit, def: Unit): Promise<void> {
    this.faceTo(att, def.rig.group.position);
    const start = att.rig.group.position.clone();
    const target = def.rig.group.position.clone().lerp(start, 0.35);
    await tween(0.22, t => att.rig.group.position.lerpVectors(start, target, t), Ease.inQuad);
    await tween(0.28, t => att.rig.group.position.lerpVectors(target, start, t), Ease.outQuad);
    this.faceHome(att);
  }

  private async castFlash(att: Unit, color: number): Promise<void> {
    const light = new THREE.PointLight(color, 30, 8);
    light.position.copy(att.rig.group.position).y += 1.5;
    this.scene.add(light);
    const s = att.rig.body.scale.x;
    await tween(0.35, t => {
      const k = 1 + Math.sin(t * Math.PI) * 0.18;
      att.rig.body.scale.setScalar(s * k);
      light.intensity = 30 * (1 - t);
    });
    att.rig.body.scale.setScalar(s);
    this.scene.remove(light);
  }

  private async hitReact(def: Unit, dmg: number, eff: number, crit: boolean): Promise<void> {
    const pos = def.rig.group.position.clone(); pos.y += 1.8;
    const color = crit ? '#ffd24e' : eff > 1 ? '#ff6a5a' : eff < 1 ? '#8b93b8' : '#ffffff';
    makeFloatingDamageText(this.scene, pos, `${dmg}`, color);
    const orig = def.rig.group.position.clone();
    await tween(0.3, t => {
      def.rig.group.position.x = orig.x + Math.sin(t * Math.PI * 4) * 0.12 * (1 - t);
    });
    def.rig.group.position.copy(orig);
  }

  private async koAnim(u: Unit): Promise<void> {
    await tween(0.6, t => {
      u.rig.group.rotation.z = (u.side === 'player' ? -1 : 1) * t * Math.PI / 2;
      u.rig.group.position.y = -t * 0.3;
      u.rig.group.scale.setScalar(1 - t * 0.4);
    });
    u.rig.group.visible = false;
  }

  // ---------- damage ----------
  /**
   * HP-proportional damage model. A neutral hit with a starter technique
   * removes ~10–15% of the target's max HP; the biggest arts remove ~40%.
   * Nothing short of a critical super-effective ultimate can pass 70% —
   * one-shots are impossible by construction.
   */
  private computeDamage(att: Unit, def: Unit, tech: Technique): { dmg: number; eff: number; crit: boolean } {
    const as = att.g.stats, ds = def.g.stats;
    const atkStat = (tech.kind === 'phys' ? as.atk : as.wis) * att.mods.atk;
    const defStat = (tech.kind === 'phys' ? ds.def : (ds.def + ds.wis) / 2) * def.mods.def;
    // element effectiveness: attack element vs every defender element
    const attEl = TYPE_ELEMENT[tech.type];
    const eff = elementMult(attEl, elementsOf(def.g.speciesId));
    const stab = elementsOf(att.g.speciesId).includes(attEl) ? 1.15 : 1;
    const crit = Math.random() < 0.08;
    const variance = 0.9 + Math.random() * 0.2;
    const pressure = atkStat / (atkStat + defStat * 1.15);   // 0.5 at parity
    let pct = (tech.power / 90) * pressure * eff * stab * variance;
    if (crit) pct *= 1.5;
    if (def.guarding) pct *= 0.45;
    pct = Math.min(0.7, pct); // hard ceiling — never a one-shot
    return { dmg: Math.max(1, Math.floor(ds.hp * pct)), eff, crit };
  }

  private effText(eff: number, crit: boolean): string {
    let s = '';
    if (crit) s += ' <span style="color:var(--ui-gold)">Critical!</span>';
    if (eff > 1) s += ' <span style="color:var(--ui-red)">Devastating!</span>';
    else if (eff < 1) s += ' <span style="color:var(--ui-dim)">…resisted.</span>';
    return s;
  }

  private alive(side: 'player' | 'enemy'): Unit[] {
    return this.units.filter(u => u.side === side && !u.g.fainted);
  }

  // ---------- technique execution ----------
  private async execTech(att: Unit, tech: Technique, target: Unit | null): Promise<void> {
    att.g.sp = Math.max(0, att.g.sp - tech.spCost);
    const color = TYPE_COLORS[tech.type];
    const who = att.side === 'enemy' ? `Wild ${att.g.nickname}` : att.g.nickname;
    this.log(`<b style="color:${TYPE_CSS[tech.type]}">${who}</b> uses <b>${tech.name}</b>!`);

    if (tech.effect === 'heal') {
      const tgt = target ?? att;
      await this.castFlash(att, color);
      const amount = Math.floor(tech.power + att.g.stats.wis * 0.6);
      tgt.g.hp = Math.min(tgt.g.stats.hp, tgt.g.hp + amount);
      makeFloatingDamageText(this.scene, tgt.rig.group.position.clone().setY(2), `+${amount}`, '#5ad88a');
      this.renderCards();
      await wait(500);
      return;
    }
    if (tech.effect === 'buffAtk' || tech.effect === 'buffDef') {
      await this.castFlash(att, color);
      if (tech.effect === 'buffAtk') att.mods.atk = Math.min(1.8, att.mods.atk + 0.3);
      else att.mods.def = Math.min(1.8, att.mods.def + 0.3);
      this.log(`${who}'s ${tech.effect === 'buffAtk' ? 'Attack' : 'Defense'} rose!`);
      await wait(600);
      return;
    }
    if (tech.effect === 'debuffDef' || tech.effect === 'debuffSpd') {
      await this.castFlash(att, color);
      const foes = this.alive(att.side === 'player' ? 'enemy' : 'player');
      for (const f of foes) {
        if (tech.effect === 'debuffDef') f.mods.def = Math.max(0.5, f.mods.def - 0.2);
        else f.mods.spd = Math.max(0.5, f.mods.spd - 0.2);
        if (tech.power > 0) {
          const { dmg, eff, crit } = this.computeDamage(att, f, tech);
          f.g.hp = Math.max(0, f.g.hp - dmg);
          await this.hitReact(f, dmg, eff, crit);
        }
      }
      this.log(`The foes' ${tech.effect === 'debuffDef' ? 'Defense' : 'Speed'} fell!`);
      this.renderCards();
      await this.cleanupKOs();
      await wait(500);
      return;
    }

    // damage / drain
    const targets = tech.target === 'all'
      ? this.alive(att.side === 'player' ? 'enemy' : 'player')
      : target ? [target] : [];
    if (tech.kind === 'phys' && targets.length === 1) await this.lungeAttack(att, targets[0]);
    else {
      if (targets.length === 1) this.faceTo(att, targets[0].rig.group.position);
      await this.castFlash(att, color);
    }

    for (const tgt of targets) {
      if (tgt.g.fainted) continue;
      const { dmg, eff, crit } = this.computeDamage(att, tgt, tech);
      tgt.g.hp = Math.max(0, tgt.g.hp - dmg);
      if (tech.effect === 'drain') {
        const heal = Math.floor(dmg * 0.5);
        att.g.hp = Math.min(att.g.stats.hp, att.g.hp + heal);
        makeFloatingDamageText(this.scene, att.rig.group.position.clone().setY(2), `+${heal}`, '#5ad88a');
      }
      this.log(`<b>${who}</b> uses <b>${tech.name}</b>!${this.effText(eff, crit)}`);
      await this.hitReact(tgt, dmg, eff, crit);
    }
    this.faceHome(att);
    this.renderCards();
    await this.cleanupKOs();
    await wait(420);
  }

  private async basicStrike(att: Unit, target: Unit): Promise<void> {
    const who = att.side === 'enemy' ? `Wild ${att.g.nickname}` : att.g.nickname;
    this.log(`<b>${who}</b> strikes!`);
    await this.lungeAttack(att, target);
    const as = att.g.stats, ds = target.g.stats;
    const variance = 0.9 + Math.random() * 0.2;
    const crit = Math.random() < 0.06;
    const pressure = (as.atk * att.mods.atk) / (as.atk * att.mods.atk + ds.def * target.mods.def * 1.15);
    let pct = 0.30 * pressure * variance;   // a plain strike ≈ 12–18% at parity
    if (crit) pct *= 1.5;
    if (target.guarding) pct *= 0.45;
    const dmg = Math.max(1, Math.floor(ds.hp * Math.min(0.45, pct)));
    target.g.hp = Math.max(0, target.g.hp - dmg);
    att.g.sp = Math.min(as.sp, att.g.sp + Math.max(2, Math.floor(as.sp * 0.08))); // striking builds SP
    await this.hitReact(target, dmg, 1, crit);
    this.renderCards();
    await this.cleanupKOs();
    await wait(380);
  }

  private async cleanupKOs(): Promise<void> {
    for (const u of this.units) {
      if (u.g.fainted && u.rig.group.visible) {
        this.log(`<b>${u.g.nickname}</b> is down!`);
        await this.koAnim(u);
      }
    }
  }

  // ---------- player turn ----------
  private async pickTarget(prompt: string, candidates: Unit[]): Promise<Unit | null> {
    if (candidates.length === 1) return candidates[0];
    this.log(prompt);
    const idx = await this.menu([
      ...candidates.map(u => ({
        label: `<span style="color:${TYPE_CSS[u.g.species.type]}">${u.g.nickname}</span> Lv${u.g.level} — ${u.g.hp}/${u.g.stats.hp} HP`,
      })),
      { label: '← Back', cls: 'danger' },
    ]);
    return idx < candidates.length ? candidates[idx] : null;
  }

  private async playerTurn(u: Unit): Promise<'acted' | 'fled'> {
    while (true) {
      this.log(`What will <b style="color:${TYPE_CSS[u.g.species.type]}">${u.g.nickname}</b> do?`);
      const giftItems = [...this.player.inventory.keys()].filter(id => ITEMS[id].kind === 'gift');
      const usable = [...this.player.inventory.keys()].filter(id => ['heal', 'sp', 'revive'].includes(ITEMS[id].kind));
      const choice = await this.menu([
        { label: '⚔️ Technique' },
        { label: '👊 Strike <span class="sub">(builds SP)</span>' },
        { label: '🛡️ Guard <span class="sub">(half damage, +SP)</span>' },
        { label: `🎒 Item <span class="sub">(${usable.length})</span>`, disabled: !usable.length },
        { label: `🎁 Gift <span class="sub">(bond wild Guardians)</span>`, disabled: !this.opts.wild || !giftItems.length },
        { label: '🔄 Swap <span class="sub">(reserve)</span>', disabled: !this.player.reserve.some(g => !g.fainted) },
        { label: '🏃 Flee', disabled: !!this.opts.boss, cls: 'danger' },
      ]);

      if (choice === 0) {
        const techs = u.g.techniques;
        const ti = await this.menu([
          ...techs.map(t => ({
            label: `<span style="color:${TYPE_CSS[t.type]}">${t.name}</span> <span class="sub">${t.spCost} SP · Pow ${t.power} · ${t.target}</span>`,
            disabled: u.g.sp < t.spCost,
          })),
          { label: '← Back', cls: 'danger' },
        ]);
        if (ti >= techs.length) continue;
        const tech = techs[ti];
        let target: Unit | null = null;
        if (tech.target === 'one') {
          target = await this.pickTarget('Target which foe?', this.alive('enemy'));
          if (!target) continue;
        } else if (tech.target === 'ally') {
          target = await this.pickTarget('Heal which ally?', this.alive('player'));
          if (!target) continue;
        }
        await this.execTech(u, tech, target);
        return 'acted';
      }
      if (choice === 1) {
        const target = await this.pickTarget('Strike which foe?', this.alive('enemy'));
        if (!target) continue;
        await this.basicStrike(u, target);
        return 'acted';
      }
      if (choice === 2) {
        u.guarding = true;
        u.g.sp = Math.min(u.g.stats.sp, u.g.sp + Math.max(3, Math.floor(u.g.stats.sp * 0.12)));
        this.log(`<b>${u.g.nickname}</b> braces for impact!`);
        this.renderCards();
        await wait(600);
        return 'acted';
      }
      if (choice === 3) {
        const usableIds = [...this.player.inventory.keys()].filter(id => ['heal', 'sp', 'revive'].includes(ITEMS[id].kind));
        const ii = await this.menu([
          ...usableIds.map(id => ({ label: `${ITEMS[id].name} ×${this.player.itemCount(id)} <span class="sub">${ITEMS[id].desc}</span>` })),
          { label: '← Back', cls: 'danger' },
        ]);
        if (ii >= usableIds.length) continue;
        const itemId = usableIds[ii];
        const it = ITEMS[itemId];
        const pool = it.kind === 'revive'
          ? this.units.filter(x => x.side === 'player' && x.g.fainted)
          : this.alive('player');
        if (!pool.length) { toast('No valid target.', 'red'); continue; }
        const target = await this.pickTarget(`Use ${it.name} on whom?`, pool);
        if (!target) continue;
        this.player.removeItem(itemId);
        const s = target.g.stats;
        if (it.kind === 'heal') target.g.hp = Math.min(s.hp, target.g.hp + it.value);
        else if (it.kind === 'sp') target.g.sp = Math.min(s.sp, target.g.sp + it.value);
        else if (it.kind === 'revive') {
          target.g.hp = Math.floor(s.hp * it.value);
          target.rig.group.visible = true;
          target.rig.group.rotation.z = 0;
          target.rig.group.scale.setScalar(1);
          target.rig.group.position.copy(this.slotPos('player', target.slot));
        }
        this.log(`Used <b>${it.name}</b> on ${target.g.nickname}!`);
        makeFloatingDamageText(this.scene, target.rig.group.position.clone().setY(2), '♥', '#5ad88a');
        this.renderCards();
        await wait(600);
        return 'acted';
      }
      if (choice === 4) {
        const giftIds = [...this.player.inventory.keys()].filter(id => ITEMS[id].kind === 'gift');
        const gi = await this.menu([
          ...giftIds.map(id => ({ label: `${ITEMS[id].name} ×${this.player.itemCount(id)} <span class="sub">${ITEMS[id].desc}</span>` })),
          { label: '← Back', cls: 'danger' },
        ]);
        if (gi >= giftIds.length) continue;
        const target = await this.pickTarget('Gift to which wild Guardian?', this.alive('enemy'));
        if (!target) continue;
        const it = ITEMS[giftIds[gi]];
        this.player.removeItem(giftIds[gi]);
        const gain = Math.floor(it.value * target.favor);
        target.bond += gain;
        const reaction = target.favor > 1.15 ? 'devours it joyfully!' : target.favor < 0.95 ? 'sniffs it cautiously…' : 'munches it happily.';
        this.log(`Wild <b>${target.g.nickname}</b> ${reaction} <span style="color:var(--ui-purple)">(bond +${gain})</span>`);
        makeFloatingDamageText(this.scene, target.rig.group.position.clone().setY(2.1), '♥', '#f25aa8');
        await this.castFlash(target, 0xf25aa8);
        await wait(500);
        return 'acted';
      }
      if (choice === 5) {
        const cands = this.player.reserve.filter(g => !g.fainted);
        const si = await this.menu([
          ...cands.map(g => ({ label: `${g.nickname} Lv${g.level} <span class="sub">${g.hp}/${g.stats.hp} HP</span>` })),
          { label: '← Back', cls: 'danger' },
        ]);
        if (si >= cands.length) continue;
        const incoming = cands[si];
        // swap party slot
        const pi = this.player.party.indexOf(u.g);
        const ri = this.player.reserve.indexOf(incoming);
        this.player.party[pi] = incoming;
        this.player.reserve[ri] = u.g;
        disposeRig(u.rig);
        u.g = incoming;
        u.rig = makeGuardian(incoming.speciesId);
        u.rig.group.position.copy(this.slotPos('player', u.slot));
        u.rig.group.rotation.y = Math.PI / 2;
        this.scene.add(u.rig.group);
        u.mods = { atk: 1, def: 1, spd: 1 };
        this.log(`Go, <b>${incoming.nickname}</b>!`);
        this.renderCards();
        await wait(600);
        return 'acted';
      }
      if (choice === 6) {
        const mySpd = this.alive('player').reduce((s, x) => s + x.g.stats.spd, 0) / Math.max(1, this.alive('player').length);
        const foeSpd = this.alive('enemy').reduce((s, x) => s + x.g.stats.spd, 0) / Math.max(1, this.alive('enemy').length);
        const chance = Math.min(0.95, Math.max(0.25, 0.55 + (mySpd - foeSpd) * 0.02));
        if (Math.random() < chance) {
          this.log('Got away safely!');
          await wait(700);
          return 'fled';
        }
        this.log('Couldn\'t escape!');
        await wait(700);
        return 'acted';
      }
    }
  }

  // ---------- enemy AI ----------
  private async enemyTurn(u: Unit): Promise<void> {
    const allies = this.alive('enemy');
    const foes = this.alive('player');
    if (!foes.length) return;
    const techs = u.g.techniques.filter(t => u.g.sp >= t.spCost);

    // 1. heal a hurt ally if possible
    const healTech = techs.find(t => t.effect === 'heal');
    const hurtAlly = allies.find(a => a.g.hp / a.g.stats.hp < 0.4);
    if (healTech && hurtAlly && Math.random() < 0.6) {
      await this.execTech(u, healTech, hurtAlly);
      return;
    }
    // 2. buff sometimes when healthy
    const buffTech = techs.find(t => t.effect === 'buffAtk' || t.effect === 'buffDef');
    if (buffTech && u.mods.atk < 1.3 && u.g.hp / u.g.stats.hp > 0.7 && Math.random() < 0.25) {
      await this.execTech(u, buffTech, null);
      return;
    }
    // 3. pick best damaging tech vs best target (prefer type advantage & low HP)
    const dmgTechs = techs.filter(t => t.effect === 'damage' || t.effect === 'drain' || (t.power > 0 && t.effect.startsWith('debuff')));
    if (dmgTechs.length && Math.random() < 0.8) {
      let best: { t: Technique; tgt: Unit; score: number } | null = null;
      for (const t of dmgTechs) {
        for (const f of foes) {
          const eff = elementMult(TYPE_ELEMENT[t.type], elementsOf(f.g.speciesId));
          const lowHpBias = 1 + (1 - f.g.hp / f.g.stats.hp) * 0.5;
          const score = t.power * eff * lowHpBias * (t.target === 'all' ? 1.4 : 1) * (0.9 + Math.random() * 0.2);
          if (!best || score > best.score) best = { t, tgt: f, score };
        }
      }
      if (best) {
        await this.execTech(u, best.t, best.t.target === 'one' ? best.tgt : null);
        return;
      }
    }
    // 4. guard occasionally at low HP
    if (u.g.hp / u.g.stats.hp < 0.25 && Math.random() < 0.3) {
      u.guarding = true;
      this.log(`Wild <b>${u.g.nickname}</b> turtles up!`);
      await wait(550);
      return;
    }
    // 5. fallback strike weakest foe
    const target = foes.reduce((a, b) => (a.g.hp < b.g.hp ? a : b));
    await this.basicStrike(u, target);
  }

  // ---------- rewards ----------
  private async grantRewards(): Promise<void> {
    const stageMult: Record<string, number> = { Novice: 1, Adept: 1.8, Elite: 3.2, Apex: 5.5 };
    let exp = 0, shards = 0;
    for (const e of this.units.filter(x => x.side === 'enemy')) {
      exp += Math.floor(e.g.level * 9 * stageMult[e.g.species.stage]);
      shards += Math.floor(e.g.level * (4 + Math.random() * 5));
    }
    if (this.opts.boss) { exp = Math.floor(exp * 1.6); shards = Math.floor(shards * 2.5); }
    this.player.shards += shards;
    this.player.battlesWon++;

    const winners = this.player.party.filter(g => !g.fainted && !g.isTemp);
    const share = winners.length ? Math.floor(exp / Math.max(1, Math.ceil(winners.length * 0.75))) : 0;
    await say('', `Victory! Gained ${exp} EXP and ◆${shards} Shards!`);

    for (const g of winners) {
      const levels = g.gainExp(share);
      if (levels > 0) {
        sfx('fanfare');
        toast(`${g.nickname} grew to Lv${g.level}!`, 'gold');
        await say('', `${g.nickname} grew to Level ${g.level}!`);
      }
      const evo = g.pendingEvolution;
      if (evo) {
        const pick = await choose('', `✨ ${g.nickname} is radiating power… Allow evolution into ${evo.name} (${evo.stage})?`, ['Evolve!', 'Not yet']);
        if (pick === 0) {
          const oldName = g.nickname;
          g.evolve();
          sfx('fanfare');
          await say('', `${oldName} evolved into ${g.species.name}! Its power surges!`);
          toast(`${oldName} → ${g.species.name}!`, 'gold');
        }
      }
    }

    // random item drop
    if (Math.random() < 0.45) {
      const drops = ['tonic', 'berry', 'cell', 'soda', 'plating', 'honey_roll'];
      const drop = drops[Math.floor(Math.random() * drops.length)];
      if (this.player.addItem(drop)) {
        await say('', `The foes dropped a ${ITEMS[drop].name}!`);
      }
    }

    // capture resolution (gifting bonds)
    for (const e of this.units.filter(x => x.side === 'enemy' && x.wild && x.bond > 0)) {
      const levelPenalty = Math.max(0, (e.g.level - this.maxPartyLevel()) * 0.04);
      const chance = Math.min(0.95, e.g.species.captureBase + e.bond / 90 - levelPenalty);
      if (Math.random() < chance) {
        const pick = await choose('', `💜 The wild ${e.g.species.name} nudges your Crawler… it wants to join you!`, ['Welcome it', 'Send it home']);
        if (pick === 0) {
          const newG = new Guardian(e.g.speciesId, e.g.level);
          newG.levelCap = Math.max(newG.level + 4, 15 + Math.floor(Math.random() * 12));
          const name = await askName(`Name your new ${e.g.species.name}`, e.g.species.name);
          newG.nickname = name;
          newG.healFull();
          const where = this.player.addGuardian(newG);
          this.player.capturesMade++;
          await say('', `${name} joined your ${where === 'party' ? 'party' : 'reserve'}!`);
        }
      }
    }
  }

  private maxPartyLevel(): number {
    return Math.max(1, ...this.player.party.map(g => g.level));
  }

  // ---------- main loop ----------
  async run(): Promise<BattleResult> {
    this.buildArena();
    $('battle-ui').style.display = 'block';
    setStoryInBattle(true);

    this.player.party.forEach((g, i) => this.units.push(this.spawnUnit(g, 'player', i)));
    this.enemySpecs.forEach((e, i) => {
      const g = new Guardian(e.speciesId, e.level);
      this.units.push(this.spawnUnit(g, 'enemy', i));
    });
    this.renderCards();
    this.log(this.opts.intro ?? (this.opts.boss ? '⚠️ A powerful presence blocks the way!' : 'Wild Guardians attack!'));
    await wait(1100);

    let result: BattleResult | null = null;
    let stunned = !!this.opts.firstStrike;
    if (stunned) { this.log('⚡ The Crawler\'s cannon stunned the foes — free round!'); await wait(900); }

    while (!result) {
      this.round++;
      this.units.forEach(u => { u.guarding = false; });
      const queue = [...this.units]
        .filter(u => !u.g.fainted)
        .sort((a, b) => b.g.stats.spd * b.mods.spd * (0.9 + Math.random() * 0.2) -
                        a.g.stats.spd * a.mods.spd * (0.9 + Math.random() * 0.2));

      for (const u of queue) {
        if (u.g.fainted) continue;
        if (!this.alive('enemy').length || !this.alive('player').length) break;
        this.highlight(u);
        if (u.side === 'player') {
          const r = await this.playerTurn(u);
          if (r === 'fled') { result = 'flee'; break; }
        } else {
          if (stunned) continue;
          await wait(350);
          await this.enemyTurn(u);
        }
      }
      stunned = false;
      this.highlight(null);

      if (!this.alive('enemy').length) result = 'win';
      else if (!this.alive('player').length) result = 'lose';
    }

    if (result === 'win') await this.grantRewards();
    else if (result === 'lose') await say('', 'Your party was overwhelmed…');

    // cleanup
    setStoryInBattle(false);
    this.units.forEach(u => disposeRig(u.rig));
    $('battle-ui').style.display = 'none';
    $('battle-menu').style.display = 'none';
    return result;
  }
}
