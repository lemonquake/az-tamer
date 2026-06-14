// ============================================================
// AZ Tamer — the Field Manual: story-mandated tutorials.
// Center-screen dialogue over a blurred world, with a living
// spotlight that lifts the UI element being taught above the
// blur and points at it. Steps can demand real actions —
// the overlay steps aside and waits until the player does it.
// ============================================================
import { Player } from './state';
import { isMenuOpen, choose } from './ui';
import { sfx } from './audio';
import { worldOrbit } from './camorbit';

const $ = (id: string) => document.getElementById(id);

export interface TutStep {
  speaker?: string;
  text: string;
  /** DOM id to spotlight above the blur (e.g. 'hud', 'minimap', 'battle-menu') */
  highlight?: string;
  /** where the bouncing pointer sits relative to the highlighted element */
  pointer?: 'top' | 'bottom' | 'left' | 'right';
  /** the step completes only when the player actually does the thing */
  action?: { hint: string; done: () => boolean };
}

// ---------------- spotlight machinery ----------------
interface Spot { el: HTMLElement; oldZ: string; oldPos: string; glow: boolean; }
let spots: Spot[] = [];
let pointerEl: HTMLDivElement | null = null;

function raise(el: HTMLElement, z: string, glow: boolean): void {
  spots.push({ el, oldZ: el.style.zIndex, oldPos: el.style.position, glow });
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.style.zIndex = z;
  if (glow) el.classList.add('tut-glow');
}

function highlightOn(id: string, side: TutStep['pointer']): void {
  highlightOff();
  const el = $(id);
  if (!el || el.style.display === 'none') return;
  // positioned ancestors form stacking contexts (e.g. #battle-ui) — lift them too
  let anc = el.parentElement;
  while (anc && anc.id !== 'app' && anc !== document.body) {
    if (getComputedStyle(anc).position !== 'static') raise(anc, '85', false);
    anc = anc.parentElement;
  }
  raise(el, '86', true);             // above the blur veil (84)

  const r = el.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'tut-pointer';
  const arrow = side === 'left' ? '👉' : side === 'right' ? '👈' : side === 'top' ? '👇' : '👆';
  p.textContent = arrow;
  document.body.appendChild(p);
  const pr = 46;
  if (side === 'left') { p.style.left = `${Math.max(4, r.left - pr - 8)}px`; p.style.top = `${r.top + r.height / 2 - pr / 2}px`; p.classList.add('h'); }
  else if (side === 'right') { p.style.left = `${Math.min(innerWidth - pr - 4, r.right + 8)}px`; p.style.top = `${r.top + r.height / 2 - pr / 2}px`; p.classList.add('h'); }
  else if (side === 'top') { p.style.left = `${r.left + r.width / 2 - pr / 2}px`; p.style.top = `${Math.max(4, r.top - pr - 8)}px`; }
  else { p.style.left = `${r.left + r.width / 2 - pr / 2}px`; p.style.top = `${Math.min(innerHeight - pr - 4, r.bottom + 8)}px`; }
  pointerEl = p;
}

function highlightOff(): void {
  for (const s of spots) {
    if (s.glow) s.el.classList.remove('tut-glow');
    s.el.style.zIndex = s.oldZ;
    s.el.style.position = s.oldPos;
  }
  spots = [];
  pointerEl?.remove();
  pointerEl = null;
}

// ---------------- the overlay ----------------
let tutActive = false;
let tutWaiting = false;   // an action step — the player is free to move and press keys
/** True while a tutorial holds the stage (action-wait phases excluded). */
export const isTutorialOpen = () => tutActive && !tutWaiting;

/**
 * Run a sequence of tutorial steps. Mandatory by design — there is no skip,
 * only forward. Resolves when the last step is acknowledged.
 */
export async function runTutorial(kicker: string, steps: TutStep[]): Promise<void> {
  tutActive = true;
  const overlay = document.createElement('div');
  overlay.id = 'tut-overlay';
  overlay.innerHTML = `
    <div id="tut-box" class="panel">
      <div id="tut-kicker">✦ ${kicker} ✦</div>
      <div id="tut-speaker"></div>
      <div id="tut-text"></div>
      <div id="tut-actions">
        <button class="ui-btn primary" id="tut-next">Continue ▸</button>
      </div>
    </div>
    <div id="tut-hint" class="panel"></div>`;
  document.getElementById('app')!.appendChild(overlay);

  const box = overlay.querySelector<HTMLElement>('#tut-box')!;
  const speakerEl = overlay.querySelector<HTMLElement>('#tut-speaker')!;
  const textEl = overlay.querySelector<HTMLElement>('#tut-text')!;
  const nextBtn = overlay.querySelector<HTMLButtonElement>('#tut-next')!;
  const hintEl = overlay.querySelector<HTMLElement>('#tut-hint')!;

  const typewrite = (text: string) => new Promise<void>(done => {
    // type the plain glyphs, then land the styled markup in one piece
    const plain = text.replace(/<[^>]+>/g, '');
    textEl.textContent = '';
    let i = 0, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(iv);
      textEl.innerHTML = text;
      box.removeEventListener('click', finish);
      done();
    };
    const iv = setInterval(() => {
      i += 2;
      if (i >= plain.length) finish();
      else textEl.textContent = plain.slice(0, i);
    }, 11);
    box.addEventListener('click', finish); // click to reveal instantly
  });

  for (const step of steps) {
    sfx('blip');
    // dress the stage
    if (step.highlight) highlightOn(step.highlight, step.pointer ?? 'bottom');
    else highlightOff();
    speakerEl.style.display = step.speaker ? 'inline-block' : 'none';
    speakerEl.textContent = step.speaker ?? '';
    // keep the box off the spotlight: highlighted element above center → drop the box low
    box.classList.toggle('low', false);
    box.classList.toggle('high', false);
    if (step.highlight) {
      const r = $(step.highlight)?.getBoundingClientRect();
      if (r) {
        if (r.top + r.height / 2 < innerHeight * 0.45) box.classList.add('low');
        else box.classList.add('high');
      }
    }

    overlay.classList.remove('waiting');
    hintEl.style.display = 'none';
    nextBtn.style.display = 'none';
    await typewrite(step.text);

    if (step.action) {
      // step aside: drop the blur, free the pointer, let the player act
      overlay.classList.add('waiting');
      tutWaiting = true;
      hintEl.innerHTML = `🎯 ${step.action.hint}`;
      hintEl.style.display = 'block';
      await new Promise<void>(done => {
        const iv = setInterval(() => {
          if (step.action!.done()) { clearInterval(iv); done(); }
        }, 140);
      });
      sfx('toast');
      tutWaiting = false;
      overlay.classList.remove('waiting');
      hintEl.style.display = 'none';
    } else {
      nextBtn.style.display = 'inline-block';
      await new Promise<void>(done => {
        const onKey = (e: KeyboardEvent) => {
          if (['Enter', ' ', 'e', 'E'].includes(e.key)) { cleanup(); done(); }
        };
        const cleanup = () => {
          window.removeEventListener('keydown', onKey);
          nextBtn.onclick = null;
        };
        nextBtn.onclick = () => { cleanup(); done(); };
        window.addEventListener('keydown', onKey);
      });
    }
  }

  highlightOff();
  overlay.remove();
  tutActive = false;
  sfx('fanfare');
}

// ---------------- action helpers ----------------
/** Done once a UI panel has been opened AND closed again. */
function panelOpenedAndClosed(): () => boolean {
  let opened = false;
  return () => {
    if (isMenuOpen()) opened = true;
    return opened && !isMenuOpen();
  };
}

/** Done once the player has right-drag-rotated the camera enough to feel it. */
function cameraRotated(): () => boolean {
  const start = worldOrbit.dragTravel;
  return () => worldOrbit.dragTravel - start > 220;
}

/** Done once the player has walked a given distance from where they stood. */
function walkedFrom(getPos: () => { x: number; z: number }, dist: number): () => boolean {
  const a = getPos();
  let travelled = 0;
  let prev = a;
  return () => {
    const p = getPos();
    travelled += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
    return travelled >= dist;
  };
}

// ============================================================
// The mandated curricula
// ============================================================

/**
 * Field Manual I — runs the moment the graduate steps off the transport
 * circle into the University lobby, right after the exam. Hale insists.
 */
export async function runBasicsTutorial(player: Player, getPos: () => { x: number; z: number }, replay = false): Promise<void> {
  if (!replay && player.flags['tut_basics']) return;
  const H = 'Instructor Hale (radio)';
  let steps: TutStep[] = [
    { speaker: H, text: `*kssht* — ${player.tamerName}! Hale here. Yes, the radio reaches the University; no, you cannot escape me by graduating. Before they let you loose on the continent, we run ORIENTATION. It's mandatory, it's painless, and I wrote it myself, so it's also delightful.` },
    {
      speaker: H,
      text: `First: legs. <b>W A S D</b> — or the arrow keys — move you around. You've done this in the caverns with the Crawler; on foot it's the same, minus the fuel bill.`,
      action: { hint: 'Walk around with W / A / S / D', done: walkedFrom(getPos, 7) },
    },
    {
      speaker: H,
      text: `Now your NECK. Hold the <b>RIGHT mouse button</b> and drag to swing the camera around yourself — any direction, any angle. Let go and stop fiddling for ten seconds, and the camera glides home on its own. Try it. Admire yourself. You've earned it.`,
      action: { hint: 'Hold RIGHT-CLICK and drag to rotate the camera', done: cameraRotated() },
    },
    {
      speaker: H,
      text: `Top-left: your <b>identity panel</b>. Name, rank, and your Shard purse — ◆ Shards are the coin of all four continents. Your portrait sits there too: once you join a guild, clicking it presents your Guild Card. Your party's chips live underneath — click a chip anytime to open that Guardian's full card.`,
      highlight: 'hud', pointer: 'right',
    },
    {
      speaker: H,
      text: `Top-right: the <b>minimap</b>. Doors, masters, trouble — all labeled. In dungeons it becomes your survey chart, and a better Crawler scanner reveals more of it. Glance at it the way you'd glance at the sky: often.`,
      highlight: 'minimap', pointer: 'left',
    },
    {
      speaker: H,
      text: `Bottom-right: your <b>hotkeys</b>, always on duty. <b>P</b> tamer data · <b>I</b> inventory · <b>G</b> Guardians · <b>C</b> Crawler · <b>J</b> quest journal · <b>V</b> evolutions · <b>Esc</b> the field menu. Everything you own is one keypress away.`,
      highlight: 'hotkeys', pointer: 'top',
    },
    {
      speaker: H,
      text: `Drill time. Open your <b>Tamer Data</b> with <b>P</b> — that's your whole career on one page: rank ladder, conquests, achievements. Close it with <b>Esc</b> (or P again) when you've finished admiring the empty trophy shelf. It won't stay empty.`,
      action: { hint: 'Press P to open Tamer Data, then Esc to close it', done: panelOpenedAndClosed() },
    },
    {
      speaker: H,
      text: `Now the <b>Quest Journal</b> — press <b>J</b>. The Chronicle tab is your story; guild orders and side work get their own tabs. If you're ever lost, the journal knows where you should be standing. Open it, then close it.`,
      action: { hint: 'Press J to open the Journal, then Esc to close it', done: panelOpenedAndClosed() },
    },
    {
      speaker: H,
      text: `Talking to people: walk up and press <b>E</b> when the prompt appears. And here's a graduate privilege — <b>left-click ANY person</b> you see, anywhere in the world, to read their identity card. Guild members carry their full Guild Card, sigil and service record included. Citizens carry city papers. Everyone is somebody, ${player.tamerName}. Nosiness is a tamer's core skill.`,
    },
    {
      speaker: H,
      text: `Geography, quickly. You are in the <b>Leodones University of Aurel</b>. Through the great NORTH door is the <b>Officers' Hall</b> — five Grand Houses keep recruiting officers there. Pledge to one: you'll receive your first true partner Guardian and your guild Sigil. That is your next step, and yes, it's also mandatory. Wonderful things usually are.`,
    },
    {
      speaker: H,
      text: `When you're sworn in, the <b>Grand Doors to the south</b> lead out to <b>HAVEN CITY</b> — shops, your Crawler garage, the healing Sanctum, and the <b>Expedition Gate</b> to the wide world. You can always ride the shuttle back here from the city's west side. The University and the city are the two poles of your life now.`,
    },
    { speaker: H, text: `Orientation complete. Explore the halls, take the notice-board work, talk to everyone, click everyone. And ${player.tamerName} — the Academy is proud of you. *kssht* — Hale out.` },
  ];
  // replays from the menu are watch-only — drop the hands-on drills
  if (replay) steps = steps.map(({ action: _action, ...rest }) => rest);
  await runTutorial('FIELD MANUAL · I — GRADUATE ORIENTATION', steps);
  if (!replay) {
    player.flags['tut_basics'] = true;
    player.save();
  }
}

/**
 * Field Manual II — first steps into Haven City. Guide Mara walks the
 * graduate through the capital's anatomy.
 */
export async function runCityTutorial(player: Player, replay = false): Promise<void> {
  if (!replay && player.flags['tut_city']) return;
  const M = 'Guide Mara';
  await runTutorial('FIELD MANUAL · II — HAVEN CITY', [
    { speaker: M, text: `Hold, graduate! Welcome to <b>Haven City</b> — heart of the Tamer Guilds, capital of Olivar, and the best-smelling city on four continents around bread-time. I'm Mara, guild guide. Short tour, walk with me — eyes on your minimap.`, highlight: 'minimap', pointer: 'left' },
    {
      speaker: M,
      text: `NORTH, up the grand stairs: the <b>terrace of the five Grand Houses</b>. Your house hall is there — masters give orders, attendants give tips, and the hall's hearth Guardian gives excellent nuzzles. The <b>Grand Coliseum</b> stands up there too, when you're ready to be famous.`,
      highlight: 'minimap', pointer: 'left',
    },
    {
      speaker: M,
      text: `SOUTH side, the working city: <b>Pina's provisions</b> (tonics, treats — west lane), <b>Dax's garage</b> (Crawler parts and paint — east lane), the <b>healing Sanctum</b> straight south (rest your whole team, free of charge), and the <b>Bounty Board</b> kiosk for honest shard-work.`,
      highlight: 'minimap', pointer: 'left',
    },
    {
      speaker: M,
      text: `EAST: the <b>Expedition Gate</b> — the wide world, dungeons, the overworld globe. Guild members only, so wear your sigil proudly. WEST: the <b>Aetherline Skyport</b> — board the floating Pod whenever the old halls call you back. East to adventure, west to academia. My whole job in one sentence.`,
      highlight: 'minimap', pointer: 'left',
    },
    {
      speaker: M,
      text: `Two city habits worth keeping: <b>right-click and drag</b> to look around — the camera minds its own way home — and <b>left-click anyone</b> to read their card. Half this city has a story worth a click. The other half has TWO.`,
    },
    { speaker: M, text: `That's the tour! Check your journal with <b>J</b> if you lose the thread, save at any menu, and mind the ducks by the pond — they own the pier, legally speaking. Good luck, graduate. Haven City is glad you're here.` },
  ]);
  if (!replay) {
    player.flags['tut_city'] = true;
    player.save();
  }
}

/**
 * Field Manual III — the first time battle is joined, Alex breaks down
 * the whole combat doctrine over the Crawler radio.
 */
export async function runBattleTutorial(player: Player, replay = false): Promise<void> {
  if (!replay && player.flags['tut_battle']) return;
  const A = 'Alex (radio)';

  // stage a preview of the command menu so the spotlight has something to teach;
  // outside a real battle (menu replay) also stage the frame and sample cards
  const bui = $('battle-ui') as HTMLElement;
  const prevUiDisplay = bui.style.display;
  bui.style.display = 'block';
  const parties = $('battle-parties') as HTMLElement;
  const prevParties = parties.innerHTML;
  if (!parties.children.length) {
    parties.innerHTML = `
      <div class="unit-card"><div class="nm"><span style="color:var(--ui-purple)"><span style="color:var(--ui-red)">FOE</span> Gloomite</span><span>🌑🪨 Lv4</span></div>
        <div class="minibar hp"><div style="width:78%"></div></div><div class="minibar sp"><div style="width:55%"></div></div>
        <div class="minibar bond"><div style="width:42%"></div></div><div class="bond-label">💜 Bond 14 · <b>42%</b> join chance</div></div>
      <div class="unit-card active"><div class="nm"><span style="color:var(--ui-green)">Your Guardian</span><span>Lv5</span></div>
        <div class="minibar hp"><div style="width:92%"></div></div><div class="minibar sp"><div style="width:64%"></div></div></div>`;
  }
  const menu = $('battle-menu') as HTMLElement;
  const prevHTML = menu.innerHTML;
  const prevDisplay = menu.style.display;
  menu.innerHTML = [
    '👊 Attack <span class="sub">(normal · builds SP)</span>', '⚔️ Technique', '🛡️ Guard <span class="sub">(half damage, +SP)</span>',
    '🎒 Item', '🎁 Gift <span class="sub">(bond wild Guardians)</span>', '🔄 Swap',
    '⚡ Auto-Action <span class="sub">(repeat last orders · A)</span>', '🏃 Flee',
  ].map(l => `<button class="ui-btn" disabled style="display:block;width:100%;margin-bottom:5px">${l}</button>`).join('');
  menu.style.display = 'block';

  await runTutorial('FIELD MANUAL · III — BATTLE DOCTRINE', [
    { speaker: A, text: `*kssht* Contact! Easy, ${player.tamerName} — first real battle. Radio's open, I'll talk you through the whole doctrine. Win this and every fight after it gets easier, because you'll know exactly what you're doing.` },
    {
      speaker: A,
      text: `Bottom-right: the <b>battle cards</b>. Green bar is <b>HP</b> — empty means down. Blue bar is <b>SP</b> — your technique fuel. Foes are marked in red, your team below them. The glowing card is whoever acts right now — turn order runs on <b>Speed</b>, so fast Guardians act first.`,
      highlight: 'battle-parties', pointer: 'left',
    },
    {
      speaker: A,
      text: `Bottom-left: your <b>command menu</b>, the heart of it all. <b>👊 Attack</b> sits up top — it's your free normal hit and it BUILDS SP. <b>⚔️ Technique</b> spends SP for elemental power. <b>🛡️ Guard</b> halves damage AND recovers SP. See the rhythm? <b>Attack and Guard charge you up — Techniques cash it in.</b> Navigate with <b>W/S</b>, confirm with <b>Space</b> — or just click.`,
      highlight: 'battle-menu', pointer: 'right',
    },
    {
      speaker: A,
      text: `<b>🎒 Item</b> uses tonics, sodas and revives from your cargo. <b>🎁 Gift</b> — listen closely — throw treats to WILD Guardians to build <b>Bond</b>. The <span style="color:#f28ac4">pink meter on their card</span> shows the live chance they ask to JOIN you after you win. <b>🔄 Swap</b> brings reserves in. And <b>⚡ Auto-Action</b> (or press <b>A</b>) re-issues your whole team's last orders — targets and all — for breezing through easy fights; press <b>A</b> again to stop. The <b>speed chip</b> top-right (or <b>F</b>) fast-forwards to 2× or 3×. <b>🏃 Flee</b> is honest cowardice (blocked against bosses, sorry).`,
      highlight: 'battle-menu', pointer: 'right',
    },
    {
      speaker: A,
      text: `Doctrine, then: <b>elements decide battles</b>. Blaze burns Verdant, Tide drowns Blaze, Verdant roots Tide; Volt shocks both Gale and Tide, Gale cuts Verdant, Umbra devours Volt. A super-effective hit is <span style="color:var(--ui-red)">Devastating!</span> — a resisted one barely tickles. Read the foe before you commit.`,
      highlight: 'battle-log', pointer: 'bottom',
    },
    {
      speaker: A,
      text: `Last thing — the top line narrates everything: crits, effectiveness, who's down. Win for EXP, Shards and the occasional dropped treasure; level-ups can trigger <b>Evolution</b>, and you should almost always say yes to those. Right! Menu's live. Open with an Attack to bank some SP, then make something explode. Go! *kssht*`,
      highlight: 'battle-log', pointer: 'bottom',
    },
  ]);

  menu.innerHTML = prevHTML;
  menu.style.display = prevDisplay;
  parties.innerHTML = prevParties;
  bui.style.display = prevUiDisplay;
  if (!replay) {
    player.flags['tut_battle'] = true;
    player.save();
  }
}

// ============================================================
// Replay — every chapter of the Field Manual can be revisited
// from the field menu (Esc), watch-only (no drills).
// ============================================================
export async function openTutorialReplayMenu(player: Player): Promise<void> {
  const pick = await choose('Field Manual', 'Replay which chapter? Hale insists the material never goes stale.', [
    '📗 Manual I — Graduate Orientation',
    '📘 Manual II — Haven City',
    '📕 Manual III — Battle Doctrine',
    'Close',
  ]);
  if (pick === 0) await runBasicsTutorial(player, () => ({ x: 0, z: 0 }), true);
  else if (pick === 1) await runCityTutorial(player, true);
  else if (pick === 2) await runBattleTutorial(player, true);
}
