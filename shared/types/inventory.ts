import type { FundSource } from './treasury';
import type { Piastres } from './common';
import type { ItemCondition, ItemOrigin, StockReason, StockStatus } from './enums';

export interface Category { id: number; name: string; isScreen: boolean; sortOrder: number; isSystem: boolean; isActive: boolean; createdAt: string }

/** One row of GET /inventory/items/search (what the part picker shows). */
export interface ItemSearchResult {
  id: number; name: string; categoryId: number; categoryName: string; brand: string | null;
  internalCode: string | null; quantity: number; minQuantity: number; sellPrice: Piastres; purchasePrice: Piastres;
  screenType: string | null; hasFrame: boolean | null; stockStatus: StockStatus;
  /** names of the device models this part fits */ compatibleModels?: string[];
}
export interface ItemSearchQuery { q?: string; categoryId?: number; inStockOnly?: boolean; limit?: number }

// ---- full inventory section (list / details / writes) ---------------------------------------------------------

export interface DeviceModel { id: number; name: string; nameNorm: string; brand: string | null; createdAt: string }

export interface InventoryItem {
  id: number; name: string; categoryId: number; categoryName?: string; brand: string | null; internalCode: string | null;
  quantity: number; minQuantity: number; purchasePrice: Piastres; sellPrice: Piastres;
  condition: ItemCondition; origin: ItemOrigin | null; screenType: string | null; hasFrame: boolean | null; notes: string | null;
  usageCount: number; createdAt: string; updatedAt: string; compatibleModels?: DeviceModel[];
}

export interface ItemListQuery { q?: string; categoryId?: number; status?: StockStatus; page?: number; pageSize?: number }

/** Body of POST /inventory/items (stock is never sent directly: openingQuantity becomes an 'opening_balance' movement). */
export interface CreateInventoryItem {
  name: string; categoryId: number; brand?: string | null; internalCode?: string | null; minQuantity?: number;
  purchasePrice: Piastres; sellPrice: Piastres; condition?: ItemCondition; origin?: ItemOrigin | null;
  screenType?: string | null; hasFrame?: boolean | null; notes?: string | null; compatibleModels?: string[]; openingQuantity?: number;
}
export type UpdateInventoryItem = Partial<Omit<CreateInventoryItem, 'openingQuantity'>>;

export interface AdjustStockBody { newQuantity: number; note?: string | null }
export interface PurchaseFromCapitalBody { quantity: number; unitCost: Piastres; updatePurchasePrice: boolean; note?: string | null; fundFrom?: FundSource }

export interface StockMovementRow {
  id: number; itemId: number; changeQty: number; reason: StockReason; priceAtTime: Piastres | null;
  refType: 'repair' | 'supplier_purchase' | 'manual' | null; refId: number | null; note: string | null; createdAt: string;
}
export interface StockStats {
  distinctItems: number; totalPieces: number; inventoryValue: Piastres; outOfStock: number; lowStock: number; screenPieces: number; screenModels: number;
}
export interface StockAlert { itemId: number; name: string; brand?: string | null; quantity: number; minQuantity: number; stockStatus: 'out' | 'low' }
