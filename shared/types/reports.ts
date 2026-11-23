import type { IsoDateTime, Piastres } from './common';
import type { RepairStatus } from './enums';

export interface StockAlertRow { itemId: number; name: string; brand?: string | null; quantity: number; minQuantity: number; stockStatus: 'out' | 'low' }
export interface DebtorRow { customerId: number; name: string; outstanding: Piastres; repairsCount: number }
export interface SupplierDebtRow { supplierId: number; name: string; outstanding: Piastres }

/** The home screen. "Today" and "this month" are Africa/Cairo calendar periods; money in piastres. */
export interface DashboardData {
  generatedAt: IsoDateTime;
  /** The Cairo month the month-scoped figures describe ("2026-10"); `isCurrent` = it is the month we are in. */
  month: { key: string; isCurrent: boolean; from: IsoDateTime; to: IsoDateTime };
  /** Work and money of the whole month: devices received, devices delivered (by delivery date), payments collected. */
  activity: { received: number; delivered: number; collected: Piastres };
  repairs: { inRepair: number; ready: number; delivered: number; /** delivered without being repaired («تعذّر الإصلاح»); not counted in `delivered` */ failed: number; outstanding: Piastres; receivedToday: number; deliveredToday: number; collectedToday: Piastres };
  stock: { distinctItems: number; totalPieces: number; inventoryValue: Piastres; outOfStock: number; lowStock: number };
  alerts: StockAlertRow[];
  treasury: { capital: Piastres; profit: Piastres; monthProfit: Piastres };  // monthProfit = profit of the shown month; capital / profit are balances right now
  debtors: DebtorRow[];
  suppliers: { outstanding: Piastres; owingCount: number };
  /** When the last portable backup was taken (null = never). The home screen nags when it is old. */
  lastBackupAt: IsoDateTime | null;
  recent: Array<{ id: number; deviceCode: string; customerName: string | null; device: string; status: RepairStatus; isFailed: boolean; total: Piastres; remaining: Piastres; receivedAt: IsoDateTime }>;
}

export const PERIOD_KINDS = ['today', 'yesterday', 'last7', 'month', 'last_month', 'custom'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
export const PERIOD_LABEL: Record<PeriodKind, string> = {
  today: 'اليوم', yesterday: 'أمس', last7: 'آخر 7 أيام', month: 'هذا الشهر', last_month: 'الشهر الماضي', custom: 'فترة مخصصة',
};

export interface ReportSummary {
  period: { kind: PeriodKind; from: IsoDateTime; to: IsoDateTime; days: number };
  repairs: { received: number; delivered: number; sales: Piastres; partsCost: Piastres; operationProfit: Piastres; collected: Piastres };
  treasury: {
    capital: { deposits: Piastres; withdrawals: Piastres; stockSpend: Piastres };
    profit: { earned: Piastres; withdrawn: Piastres; transferred: Piastres };
  };
  daily: Array<{ day: string; received: number; collected: Piastres; profit: Piastres }>;
  topItems: Array<{ itemId: number; name: string; brand?: string | null; quantity: number; revenue: Piastres; profit: Piastres }>;
  stock: DashboardData['stock'];
  lowStock: StockAlertRow[];
  debtors: DebtorRow[];
  supplierDebts: SupplierDebtRow[];
}

// ---------------------------------------------------------------- forecast & month comparison
/** One Cairo calendar month. Profit = what entered the profit ledger from repairs that month; sales = invoices of devices RECEIVED that month. */
export interface MonthStat {
  key: string; received: number; delivered: number; collected: Piastres; sales: Piastres; profit: Piastres;
  /** (sales − parts cost) / sales as a whole percent; null when there were no sales. */
  marginPct: number | null;
  isCurrent: boolean;
}
export interface ForecastPoint { key: string; expected: Piastres; low: Piastres; high: Piastres }
export type AdviceLevel = 'good' | 'warn' | 'info';
export interface Advice { id: string; level: AdviceLevel; text: string }
export type ForecastConfidence = 'low' | 'medium' | 'high';

export interface ForecastData {
  generatedAt: IsoDateTime;
  /** Oldest → newest; the last one is the month in progress. Months before the shop's first device are left out. */
  months: MonthStat[];
  current: {
    key: string; day: number; daysInMonth: number;
    profitSoFar: Piastres; projected: Piastres; projectedLow: Piastres; projectedHigh: Piastres;
    /** The same point (day of month) of the previous month, so a half month is never compared with a whole one. */
    vsPrevious: { profitNow: Piastres; profitPrevSamePoint: Piastres; receivedNow: number; receivedPrevSamePoint: number } | null;
    /** Average profit of the finished months, next to this month's projection. */
    vsAverage: { average: Piastres; projected: Piastres } | null;
  };
  next: ForecastPoint[];
  completeMonths: number;
  confidence: ForecastConfidence;
  advice: Advice[];
}
