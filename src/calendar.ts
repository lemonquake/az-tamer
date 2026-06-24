// ============================================================
// AZ Tamer — the Calendar. The world clock (daynight.ts) tells the
// HOUR; the Calendar tells the DAY. A seven-day week (Monday→Sunday),
// a twelve-hour clock, and an Age-of-Embers date — the spine the
// Tournament Circuit hangs its brackets on. The date is per-save
// (Player.calendarDay); the hour is the shared world clock.
// ============================================================
import { worldClock } from './daynight';
import { Player } from './state';
import { ensureBounties } from './bounties';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Weekday = typeof WEEKDAYS[number];

/** 52 seven-day weeks to an Age-turn. */
const YEAR_LEN = 364;
/** The campaign's "present" on the Age of Embers calendar (the Big Three's titles were AE 17–28). */
const AE_EPOCH = 30;

export const calendarDayOf = (p: Player | null = Player.activeInstance): number => p?.calendarDay ?? 0;

export const weekdayIndex = (day = calendarDayOf()): number => ((day % 7) + 7) % 7;
export const weekdayName = (day = calendarDayOf()): Weekday => WEEKDAYS[weekdayIndex(day)];
export const time12 = (): string => worldClock.label12;

export const aeYear = (day = calendarDayOf()): number => AE_EPOCH + Math.floor(day / YEAR_LEN);
export const weekOfYear = (day = calendarDayOf()): number =>
  Math.floor((((day % YEAR_LEN) + YEAR_LEN) % YEAR_LEN) / 7) + 1;

export const dateLabel = (day = calendarDayOf()): string => `AE ${aeYear(day)} · Week ${weekOfYear(day)}`;
export const fullDateLabel = (day = calendarDayOf()): string =>
  `${weekdayName(day)} · ${dateLabel(day)} · Day ${day + 1}`;

/** The HUD calendar chip — weekday + 12-hour time, full date on hover. */
export function calendarHudHTML(): string {
  return `<div class="cal-chip" title="${fullDateLabel()}">
    <span class="cal-day">🗓️ ${weekdayName()}</span>
    <span class="cal-dot">•</span>
    <span class="cal-time">${time12()}</span>
  </div>`;
}

/**
 * The Tournament time-jump: roll the campaign date forward to `targetDay`
 * and set the clock to `hour` (24h). Never travels backward in time.
 */
export function jumpToDay(targetDay: number, hour = 8): void {
  const p = Player.activeInstance;
  if (!p) return;
  p.calendarDay = Math.max(p.calendarDay, Math.floor(targetDay));
  worldClock.t = (((hour / 24) % 1) + 1) % 1;
  p.save(false);
  (window as any).__refreshHUD?.();
  (window as any).__onCalendarChange?.();
}

let inited = false;
/** Wire the day-rollover. Call once after the player is loaded (from main.ts). */
export function initCalendar(): void {
  if (inited) return;
  inited = true;
  worldClock.onRollover(() => {
    const p = Player.activeInstance;
    if (!p) return;
    p.calendarDay = (p.calendarDay ?? 0) + 1;
    // A day's incubation warms every egg; refresh the Bounty Board rotation.
    const hatched = p.tickEggs(30);
    ensureBounties(p);
    p.save();
    const toast = (window as any).__azToast as ((m: string, c?: string, d?: number) => void) | undefined;
    if (toast) for (const e of hatched) toast(`🥚 Your ${e.label} is ready to hatch at the Hatchery!`, 'gold', 4000);
    (window as any).__refreshHUD?.();
    (window as any).__onCalendarChange?.();
  });
}
