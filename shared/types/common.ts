/** Integer number of piastres (1 EGP = 100). Never a float. */
export type Piastres = number;
/** ISO-8601 UTC string, e.g. 2026-10-01T09:30:00.000Z */
export type IsoDateTime = string;

export interface ApiMeta { page?: number; pageSize?: number; total?: number; [k: string]: unknown }
export interface ApiOk<T> { success: true; data: T; meta?: ApiMeta }
export interface ApiErr { success: false; error: { code: string; message: string; details?: unknown } }
export type ApiResponse<T> = ApiOk<T> | ApiErr;
