/**
 * Repairs API contract: the shapes the backend returns and accepts. Shared by backend and frontend (the frontend must
 * never import from backend/). All money is integer piastres. A compile-time check in
 * backend/src/modules/devices/devices.contract.ts keeps the request shapes below in sync with the Zod schemas.
 */
import type { IsoDateTime, Piastres } from './common';
import type { RepairStatus } from './enums';

// ---- responses ------------------------------------------------------------------------------------
export interface Repair {
  id: number; repairNumber: number; deviceCode: string; customerId: number;
  deviceType: string; deviceModel: string | null; problem: string | null;
  partsTotal: Piastres; laborCost: Piastres; discount: Piastres; total: Piastres;
  status: RepairStatus; receivedAt: IsoDateTime; deliveredAt: IsoDateTime | null; notes: string | null;
  createdAt: IsoDateTime; updatedAt: IsoDateTime; deletedAt: IsoDateTime | null;
  /** «طياري»: a walk-in job delivered on the spot. Cleared when it is converted to a regular repair. */
  isQuick: boolean;
  /** Warranty on the whole repair (parts + labor) in days, from the delivery day. 0 = none. */
  warrantyDays: number;
}
export interface RepairWithFinancials extends Repair {
  /** Delivered without being repaired («تعذّر الإصلاح»): derived from the status history, so it is true for old devices too. */
  isFailed: boolean;
  paidTotal: Piastres; remaining: Piastres; partsCost: Piastres; operationProfit: Piastres;
}
export interface RepairItem {
  id: number; repairId: number; itemId: number; itemName: string; /** current company of the stock item (looked up on read, so old lines show it too) */ itemBrand?: string | null; quantity: number;
  priceAtTime: Piastres; costAtTime: Piastres; createdAt: IsoDateTime;
}
export interface RepairPayment {
  id: number; repairId: number; amount: Piastres; paidAt: IsoDateTime; note: string | null;
  createdAt: IsoDateTime; updatedAt: IsoDateTime; deletedAt: IsoDateTime | null;
}
export interface RepairStatusHistoryRow {
  id: number; repairId: number; fromStatus: RepairStatus | null; toStatus: RepairStatus; note: string | null; changedAt: IsoDateTime;
}
export interface RepairStats { repairsCount: number; totalSales: Piastres; operationsProfit: Piastres; outstandingTotal: Piastres }

export interface CustomerBrief { id: number; name: string; phone: string | null }
export interface RepairListRow extends RepairWithFinancials { customer: CustomerBrief | null }
export interface RepairItemLine extends RepairItem { lineTotal: Piastres; lineCost: Piastres }
export interface RepairDetails {
  repair: RepairWithFinancials;
  customer: CustomerBrief | null;
  items: RepairItemLine[];
  payments: RepairPayment[];
  statusHistory: RepairStatusHistoryRow[];
  /** What this repair has actually posted to capital / profit so far. */
  ledger: { capital: Piastres; profit: Piastres };
}
export interface RepairSummary extends RepairStats { byStatus: Record<RepairStatus, number> }
export interface RemoveRepairResult {
  deleted: true; repairId: number; deviceCode: string;
  restoredStock: Array<{ itemId: number; itemName: string; quantity: number }>;
  reversed: { capital: Piastres; profit: Piastres } | null;
}
/** Non-fatal notices (the operation DID succeed): delivered with a balance, profit/capital went negative. */
export interface ApiWarning { code: 'DELIVERED_WITH_BALANCE' | 'PROFIT_NEGATIVE' | 'CAPITAL_NEGATIVE'; message: string; amount?: Piastres }

// ---- requests -------------------------------------------------------------------------------------
export type CustomerRefInput = { id: number } | { name: string; phone?: string | null };
export interface PartLineInput { itemId: number; quantity: number; unitPrice?: Piastres }
export interface CreateRepairInput {
  customer: CustomerRefInput;
  deviceType?: string; deviceModel?: string | null; problem?: string | null;
  parts?: PartLineInput[]; laborCost?: Piastres; discount?: Piastres; paidNow?: Piastres;
  status?: RepairStatus; notes?: string | null; receivedAt?: IsoDateTime;
}
export interface UpdateRepairInfoInput {
  customer?: CustomerRefInput; deviceType?: string; deviceModel?: string | null; problem?: string | null; notes?: string | null; warrantyDays?: number;
}
export interface UpdatePricingInput { laborCost?: Piastres; discount?: Piastres; finalPrice?: Piastres }
export interface ChangeStatusInput { status: RepairStatus; note?: string | null }
export interface AddPaymentInput { amount: Piastres; note?: string | null; paidAt?: IsoDateTime }
export interface UpdatePaymentInput { amount?: Piastres; note?: string | null; paidAt?: IsoDateTime }

/** «طياري»: one quick sale / job. `price` is what the work is worth BEFORE the discount; the server splits it into part / labor / discount. */
export interface QuickRepairInput {
  /** Both optional. A balance (price − discount − paidNow > 0) requires a real name and phone (or an existing customer id). */
  customer?: { id: number } | { name?: string | null; phone?: string | null };
  /** The part sold (stock is consumed). Omit for hand-work only. */
  itemId?: number; quantity?: number;
  deviceType?: string; deviceModel?: string | null; work?: string | null;
  price: Piastres; discount?: Piastres; paidNow?: Piastres;
  notes?: string | null; receivedAt?: IsoDateTime;
}
/** Turn a «طياري» into a regular repair (back to «تحت الصيانة», same DV code; nothing is deducted or charged again). */
export interface ConvertQuickInput { customer?: CustomerRefInput; deviceModel?: string | null; problem?: string | null; note?: string | null }

export interface RepairListQuery {
  status?: RepairStatus; customerId?: number; q?: string; owing?: boolean; quick?: boolean; from?: IsoDateTime; to?: IsoDateTime;
  page?: number; pageSize?: number;
}
