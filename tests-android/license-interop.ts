// Verifies: WebCrypto-signed license (owner tool style) verifies under the app's node:crypto verifier,
// and node:crypto-signed license verifies under WebCrypto (the Android WebView path).
import crypto from 'node:crypto';
import { verifyLicenseText, evaluateLicense } from '../backend/src/core/license/license';
import { makeDeviceId } from '../backend/src/core/license/deviceId';

const b64u = (b: ArrayBuffer | Buffer) => Buffer.from(b as any).toString('base64url');

async function main() {
  const kp = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await globalThis.crypto.subtle.exportKey('jwk', kp.publicKey) as { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  const payload = { v: 1, d: makeDeviceId('test-android-id-1234'), n: 'Test Shop', i: '2026-11-23', e: '2027-11-23', k: 1 };
  const p = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));

  // 1. sign with WebCrypto (owner tool), verify with app node verifier
  const sigWeb = await globalThis.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(p, 'utf8'));
  const licWeb = `LIC1.${p}.${b64u(sigWeb)}`;
  const v1 = verifyLicenseText(licWeb, pubJwk);
  console.log('web-sign -> node-verify:', v1.ok ? 'OK' : `FAIL ${v1.reason}`);

  // 2. sign with node, verify with WebCrypto (Android path)
  const nodeKey = crypto.createPrivateKey({ key: await globalThis.crypto.subtle.exportKey('jwk', kp.privateKey), format: 'jwk' });
  const sigNode = crypto.sign('sha256', Buffer.from(p, 'utf8'), { key: nodeKey, dsaEncoding: 'ieee-p1363' });
  const licNode = `LIC1.${p}.${b64u(sigNode)}`;
  const ok2 = await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, Buffer.from(b64u(sigNode), 'base64url'), Buffer.from(p, 'utf8'));
  console.log('node-sign -> web-verify:', ok2 ? 'OK' : 'FAIL');

  // 3. extraction from a pasted WhatsApp message + device binding + expiry/clock evaluation
  const pasted = `تفعيل النسخة بتاعتك:\n${licWeb}\nصالح لجهازك بس`;
  const v3 = verifyLicenseText(pasted, pubJwk);
  console.log('paste-extract:', v3.ok ? 'OK' : 'FAIL');
  const active = evaluateLicense({ licenseText: licWeb, deviceId: payload.d, now: new Date('2026-11-23T10:00:00'), lastSeenMs: null, pub: pubJwk });
  console.log('evaluate active:', active.state === 'active' ? `OK (${active.daysLeft} days)` : `FAIL ${active.state}`);
  const wrongDev = evaluateLicense({ licenseText: licWeb, deviceId: makeDeviceId('other-device'), now: new Date(), lastSeenMs: null, pub: pubJwk });
  console.log('wrong-device rejected:', wrongDev.state === 'mismatch' ? 'OK' : 'FAIL');
  const expired = evaluateLicense({ licenseText: licWeb, deviceId: payload.d, now: new Date('2027-12-01'), lastSeenMs: null, pub: pubJwk });
  console.log('expiry enforced:', expired.state === 'expired' ? 'OK' : 'FAIL');
  const rollback = evaluateLicense({ licenseText: licWeb, deviceId: payload.d, now: new Date('2026-11-20'), lastSeenMs: Date.parse('2026-11-25'), pub: pubJwk });
  console.log('clock-rollback caught:', rollback.state === 'clock' ? 'OK' : 'FAIL');
  const tampered = evaluateLicense({ licenseText: licWeb.slice(0, -4) + 'AAAA', deviceId: payload.d, now: new Date(), lastSeenMs: null, pub: pubJwk });
  console.log('tampered rejected:', tampered.state === 'invalid' ? 'OK' : 'FAIL');
  console.log('deviceId format:', /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(payload.d) ? 'OK' : 'FAIL', payload.d);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
