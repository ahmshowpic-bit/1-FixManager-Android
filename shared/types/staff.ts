import type { IsoDateTime } from './common';

export type StaffRole = 'manager' | 'technician';

/** The lock screen's list: the manager is always there, technicians are the active ones. */
export interface LoginPeople { technicians: Array<{ id: number; name: string }> }
export interface LoginResult {
  token: string; role: StaffRole; name: string; technicianId: number | null;
  /** Manager only: wrong-PIN attempts since his previous login. */
  alert: { count: number; last: IsoDateTime; targets: string[] } | null;
}
/** Counts only (never money): what the lock screen may show before anyone logs in. */
export interface LockInfo { shopName: string; teaser: boolean; ready: number; late: number }

export interface TechnicianInfo { id: number; name: string; active: boolean; createdAt: IsoDateTime; opsToday: number; lastActionAt: IsoDateTime | null }
export interface ActivityRow { at: IsoDateTime; actorName: string; action: string }

/** What one person did today. «غير مسجّل» (unrecorded) holds what the log cannot attribute (before technicians existed, lock off). */
export interface TeamRow { name: string; received: number; ready: number; delivered: number; collected: number | null; ops: number; unrecorded?: boolean }
export interface ShiftSummary {
  date: string; role: StaffRole; name: string;
  /** The whole shop today (counts only). */
  devices: { received: number; ready: number; delivered: number };
  /** The current person's own numbers (collected is null for a technician). */
  mine: TeamRow;
  /** Money and the other people's numbers: manager only. */
  collected: number | null;
  team: TeamRow[] | null;
  logins: Array<{ name: string; at: IsoDateTime }> | null;
}
