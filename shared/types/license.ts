export type LicenseStateName = 'none' | 'invalid' | 'mismatch' | 'active' | 'expired' | 'clock';

/** What the UI shows. `message` is Arabic and ready to display. */
export interface LicenseStatus {
  state: LicenseStateName;
  message: string;
  deviceId: string;
  owner: string | null;
  /** last day label from the license, YYYY-MM-DD (the license stops working at the start of this day) */
  expiresAt: string | null;
  daysLeft: number | null;
  /** how many licenses were issued to this device so far (1 = first activation) */
  activations: number | null;
}
export interface ActivateBody { code: string }
