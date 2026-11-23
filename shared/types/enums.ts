// Stored as stable English codes; Arabic labels live here for the UI/PDF only.
export const REPAIR_STATUSES = ['in_repair', 'ready', 'delivered'] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];
export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  in_repair: 'تحت الصيانة', ready: 'جاهز', delivered: 'تم التسليم',
};

export type ItemCondition = 'new' | 'refurbished' | 'used';
export const ITEM_CONDITION_LABEL: Record<ItemCondition, string> = {
  new: 'جديدة', refurbished: 'مجددة', used: 'مستعملة',
};
export type ItemOrigin = 'original' | 'commercial';
export const ITEM_ORIGIN_LABEL: Record<ItemOrigin, string> = { original: 'أصلية', commercial: 'تجارية' };

export type StockReason = 'opening_balance' | 'purchase_receipt' | 'repair_usage' | 'repair_return' | 'adjustment';
export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  opening_balance: 'رصيد افتتاحي', purchase_receipt: 'استلام مشتريات',
  repair_usage: 'استخدام في صيانة', repair_return: 'إرجاع من صيانة محذوفة', adjustment: 'تصحيح',
};
export type StockStatus = 'out' | 'low' | 'ok';

export type CapitalKind = 'deposit' | 'withdraw' | 'adjustment' | 'stock_purchase' | 'supplier_payment'
  | 'repair_collection' | 'repair_adjustment' | 'repair_reversal' | 'profit_transfer';
export type ProfitKind = 'repair_collection' | 'repair_adjustment' | 'repair_reversal'
  | 'withdraw' | 'transfer_to_capital' | 'adjustment';
