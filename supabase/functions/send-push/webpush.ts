// Web Push for the send-push Edge Function, using only WebCrypto (runs in Deno, Node 20+ and
// browsers): VAPID request signing (RFC 8292) and aes128gcm payload encryption (RFC 8291).
// Kept free of Deno-only APIs so the unit tests in src/lib/webpush.test.ts can run it in Node.

export interface PushTarget {
  endpoint: string;
  /** Browser's P-256 public key, base64url (65 bytes uncompressed). */
  p256dh: string;
  /** Browser's auth secret, base64url (16 bytes). */
  auth: string;
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point (what the browser gets as applicationServerKey). */
  publicKey: string;
  /** base64url, 32-byte private scalar. */
  privateKey: string;
  /** "mailto:you@example.com" or an https URL; push services contact this if something goes wrong. */
  subject: string;
}

export interface PushOptions {
  /** Seconds the push service keeps an undelivered message. */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Newer TypeScript DOM types only accept ArrayBuffer-backed views as BufferSource; ours always are.
const buf = (b: Uint8Array) => b as BufferSource;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** JWK for a P-256 key from its raw public point (and private scalar, for private keys). */
function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("invalid P-256 public key");
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(publicKey.slice(1, 33)),
    y: b64urlEncode(publicKey.slice(33, 65)),
    ext: true,
  };
  if (privateKey) {
    if (privateKey.length !== 32) throw new Error("invalid P-256 private key");
    jwk.d = b64urlEncode(privateKey);
  }
  return jwk;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) }, key, bytes * 8));
}

/** Fixed sender key and salt, for the RFC 8291 known-answer test only. */
export interface EncryptOverrides {
  salt?: Uint8Array;
  senderPublicKey?: Uint8Array;
  senderPrivateKey?: Uint8Array;
}

const RECORD_SIZE = 4096;

/** Encrypts one message for one browser (RFC 8291, aes128gcm, single record). */
export async function encryptPayload(
  target: Pick<PushTarget, "p256dh" | "auth">,
  plaintext: Uint8Array,
  overrides: EncryptOverrides = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(target.p256dh);
  const authSecret = b64urlDecode(target.auth);
  if (authSecret.length !== 16) throw new Error("invalid auth secret");
  // One record: plaintext + 0x02 delimiter + 16-byte tag must fit in the record size.
  if (plaintext.length + 17 > RECORD_SIZE) throw new Error("payload too large");

  const curve = { name: "ECDH", namedCurve: "P-256" } as const;
  const uaKey = await crypto.subtle.importKey("jwk", p256Jwk(uaPublic), curve, false, []);
  let asPublic: Uint8Array;
  let asPrivate: CryptoKey;
  if (overrides.senderPrivateKey && overrides.senderPublicKey) {
    asPublic = overrides.senderPublicKey;
    asPrivate = await crypto.subtle.importKey(
      "jwk", p256Jwk(asPublic, overrides.senderPrivateKey), curve, false, ["deriveBits"]);
  } else {
    const pair = await crypto.subtle.generateKey(curve, true, ["deriveBits"]) as CryptoKeyPair;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    asPrivate = pair.privateKey;
  }
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  const padded = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce), tagLength: 128 }, aes, buf(padded)));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service origin (RFC 8292). */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  if (!/^(mailto:|https:\/\/)/.test(vapid.subject)) throw new Error("VAPID subject must be a mailto: or https: URL");
  const publicKey = b64urlDecode(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk", p256Jwk(publicKey, b64urlDecode(vapid.privateKey)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 60 * 60,
    sub: vapid.subject,
  })));
  const signed = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, buf(enc.encode(signed))));
  return `vapid t=${signed}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

/** The fetch() arguments that deliver `payload` to one browser. */
export async function buildPushRequest(
  target: PushTarget,
  payload: string,
  vapid: VapidKeys,
  options: PushOptions = {},
): Promise<{ url: string; init: RequestInit }> {
  const body = await encryptPayload(target, enc.encode(payload));
  return {
    url: target.endpoint,
    init: {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(target.endpoint, vapid),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(Math.max(0, Math.round(options.ttl ?? 86400))),
        Urgency: options.urgency ?? "normal",
      },
      body: buf(body),
    },
  };
}

// Browsers' push services. The function only ever calls these, so a stored endpoint can't be
// used to make it send requests anywhere else. Add a host here if a browser uses a new one.
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Samsung Internet, Opera, Brave
  "android.googleapis.com", // older Chrome
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "push.apple.com", // Safari on iPhone, iPad and Mac (web.push.apple.com)
  "notify.windows.com", // Edge on Windows (*.notify.windows.com)
];

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:" || url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Compares secrets without leaking where they differ through timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
