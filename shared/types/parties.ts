import type { FundSource } from './treasury';
import type { IsoDateTime, Piastres } from './common';

// ---- customers ----------------------------------------------------------------------------------------------
export interface CustomerRow {
  id: number; name: string; phone: string | null; notes: string | null; createdAt: IsoDateTime; updatedAt: IsoDateTime;
  /** When the owner pinned him (null = not pinned). Pinned customers always come first; at most PIN_LIMIT of them. */
  pinnedAt: IsoDateTime | null;
  /** From the live repairs of this customer: number of repairs, total billed, total paid, still owed. */
  repairsCount: number; totalBilled: Piastres; totalPaid: Piastres; remaining: Piastres;
}
/** How many customers can be pinned (تثبيت) at once. */
export const PIN_LIMIT = 3;
export interface CustomerSummary { count: number; owingCount: number; totalRemaining: Piastres }
export interface CustomerListQuery { q?: string; owing?: boolean; page?: number; pageSize?: number }
export interface CustomerBody { name: string; phone?: string | null; notes?: string | null }

// ---- suppliers ----------------------------------------------------------------------------------------------
export interface SupplierRow {
  id: number; name: string; phone: string | null; notes: string | null; createdAt: IsoDateTime; updatedAt: IsoDateTime;
  totalPurchases: Piastres; totalPaid: Piastres; outstanding: Piastres;
}
export interface SupplierSummary { count: number; owingCount: number; totalPurchases: Piastres; totalPaid: Piastres; outstanding: Piastres }
export interface SupplierListQuery { q?: string; owing?: boolean }
export interface SupplierBody { name: string; phone?: string | null; notes?: string | null }

export interface SupplierPurchaseRow {
  id: number; supplierId: number; itemId: number | null; itemName: string; itemBrand?: string | null; quantity: number; unitCost: Piastres;
  totalCost: Piastres; paidAmount: Piastres; remaining: Piastres; purchasedAt: IsoDateTime; note: string | null;
}
export interface SupplierPaymentRow { id: number; supplierId: number; amount: Piastres; paidAt: IsoDateTime; note: string | null }
export interface SupplierStatement { supplier: SupplierRow; purchases: SupplierPurchaseRow[]; payments: SupplierPaymentRow[] }

/** One invoice line. Pass itemId to receive the stock into inventory (itemName then defaults to the item's name). */
export interface NewPurchaseBody {
  itemId?: number | null; itemName?: string; quantity: number; unitCost: Piastres;
  /** Paid at once (0 = all on credit). Leaves capital in the same transaction. */
  paidNow?: Piastres; purchasedAt?: IsoDateTime; note?: string | null;
  /** Only when the drawer does not cover `paidNow` (see FundSource). */
  fundFrom?: FundSource;
}
export interface PurchaseResult { purchase: SupplierPurchaseRow; payment: SupplierPaymentRow | null }

export interface PaymentBody { amount: Piastres; note?: string | null; paidAt?: IsoDateTime; fundFrom?: FundSource }
export interface PaymentResult { payment: SupplierPaymentRow; allocations: Array<{ purchaseId: number; itemName: string; amount: Piastres }>; outstanding: Piastres }

// ---- multi-line invoice ---------------------------------------------------------------------------------------
/** A product that is not in the inventory yet: it is created there (stock 0) and then receives the line's quantity. */
export interface NewItemBody { name: string; categoryId: number; brand?: string | null; sellPrice: Piastres; minQuantity?: number }
/** Exactly one of itemId / newItem / itemName. */
export interface InvoiceLineBody { itemId?: number | null; newItem?: NewItemBody; itemName?: string; quantity: number; unitCost: Piastres }
export interface NewInvoiceBody { lines: InvoiceLineBody[]; paidNow?: Piastres; purchasedAt?: IsoDateTime; note?: string | null; fundFrom?: FundSource }
export interface InvoiceResult { purchases: SupplierPurchaseRow[]; payment: SupplierPaymentRow | null }
