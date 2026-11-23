// Verifies the WebCrypto mirrors (licenseWeb.ts, makeDeviceIdAsync) against the desktop node:crypto path.
import crypto from 'node:crypto';
import { verifyLicenseText, evaluateLicense, type PublicJwk } from '../backend/src/core/license/license';
import { verifyLicenseTextAsync, evaluateLicenseAsync, makeDeviceIdAsync } from '../backend/src/core/license/licenseWeb';
import { makeDeviceId } from '../backend/src/core/license/deviceId';

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');

const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pub = kp.publicKey.export({ format: 'jwk' }) as unknown as PublicJwk;

function signCode(payload: object): string {
  const p = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(p, 'utf8'), { key: crypto.createPrivateKey({ key: kp.privateKey.export({ format: 'jwk' }), format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return `LIC1.${p}.${b64u(sig)}`;
}

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); cond ? pass++ : fail++; };

const payload = { v: 1, d: 'AAAA-BBBB-CCCC-DDDD-EEEE', n: 'أحمد', i: '2026-11-01', e: '2027-11-01', k: 1 };
const code = signCode(payload);

// 1. node-signed code -> WebCrypto verifier
const vw = await verifyLicenseTextAsync(code, pub);
check('node-sign -> licenseWeb verify', vw.ok === true && vw.ok && vw.payload.n === 'أحمد');

// 2. WebCrypto verifier agrees with node verifier on tampered code
const bad = code.slice(0, -4) + (code.endsWith('AAAA') ? 'BBBB' : 'AAAA');
const [v1, v2] = [verifyLicenseText(bad, pub), await verifyLicenseTextAsync(bad, pub)];
check('tampered rejected by both', !v1.ok && !v2.ok);

// 3. evaluate parity: same inputs -> same status
const input = { licenseText: code, deviceId: 'AAAA-BBBB-CCCC-DDDD-EEEE', now: new Date('2026-11-23T12:00:00'), lastSeenMs: null, pub };
const [e1, e2] = [evaluateLicense(input), await evaluateLicenseAsync(input)];
check('evaluate parity (active)', e1.state === 'active' && e2.state === 'active' && e1.daysLeft === e2.daysLeft && e1.message === e2.message);

const inputNone = { ...input, licenseText: null };
const [n1, n2] = [evaluateLicense(inputNone), await evaluateLicenseAsync(inputNone)];
check('evaluate parity (none)', n1.state === 'none' && n2.state === 'none' && n1.message === n2.message);

const inputClock = { ...input, lastSeenMs: new Date('2026-12-01').getTime() };
const [c1, c2] = [evaluateLicense(inputClock), await evaluateLicenseAsync(inputClock)];
check('evaluate parity (clock rollback)', c1.state === 'clock' && c2.state === 'clock');

const inputMismatch = { ...input, deviceId: 'ZZZZ-YYYY-XXXX-WWWW-VVVV' };
const [m1, m2] = [evaluateLicense(inputMismatch), await evaluateLicenseAsync(inputMismatch)];
check('evaluate parity (device mismatch)', m1.state === 'mismatch' && m2.state === 'mismatch');

// 4. device id parity
const [d1, d2] = [makeDeviceId('test-raw-id-123'), await makeDeviceIdAsync('test-raw-id-123')];
check('device id parity', d1 === d2 && /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(d2));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
