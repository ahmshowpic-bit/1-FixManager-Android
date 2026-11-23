import type { IsoDateTime, Piastres } from './common';
import type { CapitalKind, ProfitKind } from './enums';

export const CAPITAL_KIND_LABEL: Record<CapitalKind, string> = {
  deposit: 'إيداع', withdraw: 'سحب', adjustment: 'ضبط الرصيد', stock_purchase: 'شراء مخزون',
  supplier_payment: 'دفعة لمورد', repair_collection: 'تحصيل صيانة', repair_adjustment: 'تعديل صيانة',
  repair_reversal: 'عكس صيانة', profit_transfer: 'تحويل من الأرباح',
};
export const PROFIT_KIND_LABEL: Record<ProfitKind, string> = {
  repair_collection: 'ربح صيانة', repair_adjustment: 'تعديل صيانة', repair_reversal: 'عكس صيانة',
  withdraw: 'سحب أرباح', transfer_to_capital: 'تحويل إلى رأس المال', adjustment: 'ضبط الرصيد',
};

/** One ledger row. amount is signed (+ in, − out). refLabel = what it refers to (repair code / supplier / item) when known. */
export interface LedgerEntry<K extends string> {
  id: number; amount: Piastres; kind: K; note: string | null;
  refType: 'repair' | 'supplier_payment' | 'stock_movement' | 'profit_transaction' | 'capital_transaction' | null; refId: number | null;
  refLabel: string | null; createdAt: IsoDateTime;
  /** Balance right after this row (running total of the whole ledger). */
  balanceAfter: Piastres;
}
export type CapitalEntry = LedgerEntry<CapitalKind>;
export type ProfitEntry = LedgerEntry<ProfitKind>;

export interface LedgerQuery { kind?: string; from?: IsoDateTime; to?: IsoDateTime; page?: number; pageSize?: number }

/** The current month is in Africa/Cairo time; all money in piastres, positive numbers (direction is in the name). */
export interface TreasurySummary {
  monthStart: IsoDateTime;
  capital: { balance: Piastres; monthDeposits: Piastres; monthWithdrawals: Piastres; monthStockSpend: Piastres };
  profit: { balance: Piastres; monthEarned: Piastres; monthWithdrawn: Piastres; monthTransferred: Piastres };
  /** The shop's capital as a FIXED number the owner sets (رأس المال). null until it is set. Not a ledger: the drawer + the goods are compared with it on the screen. */
  shopCapital: Piastres | null;
}

export interface ShopCapitalBody { amount: Piastres }

export interface MoneyBody { amount: Piastres; note?: string | null }
export interface AdjustBalanceBody { newBalance: Piastres; note?: string | null }
export interface TreasuryResult { entryId: number; capital: Piastres; profit: Piastres }

/**
 * The drawer (رأس المال السائل) pays for stock and suppliers. When it does not cover a spend the server refuses with
 * INSUFFICIENT_BALANCE + these details; the owner then picks where the missing money comes from and the SAME request is sent again with `fundFrom`.
 *  'external' = money from outside the shop (booked as a visible deposit) · 'profit' = moved from the profits balance (booked as a transfer).
 */
export type FundSource = 'external' | 'profit';
export interface DrawerShortDetails { reason: 'drawer_short'; shortfall: Piastres; drawer: Piastres; profit: Piastres }
