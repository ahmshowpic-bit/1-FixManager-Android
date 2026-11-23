import type { IsoDateTime } from './common';

export interface SettingsData {
  shopName: string; shopPhone: string; shopAddress: string;
  /** True when the 4-digit app lock is on (the PIN itself never leaves the server). */
  pinEnabled: boolean;
  /** Minutes of no activity before the program locks itself (0 = never). */
  autoLockMinutes: number;
  /** Show the counts of ready/late devices on the lock screen (no money). */
  lockTeaser: boolean;
  backup: { available: boolean; canRestore: boolean; dir: string | null; lastBackupAt: IsoDateTime | null };
}
export interface ShopInfoBody { shopName?: string; shopPhone?: string; shopAddress?: string; autoLockMinutes?: number; lockTeaser?: boolean }
export interface BackupInfo { name: string; size: number; createdAt: IsoDateTime }
