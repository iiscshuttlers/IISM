import { describe, expect, it } from "vitest";
import {
  b64urlDecode, b64urlEncode, buildPushRequest, encryptPayload, isPushEndpoint, timingSafeEqual, vapidAuthorization,
} from "../../supabase/functions/send-push/webpush";

// RFC 8291 Appendix A (and the Section 5 example body).
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

const enc = new TextEncoder();

/** The browser's side of RFC 8291, written out separately so a round trip checks the sender. */
async function decrypt(body: Uint8Array, uaPublicB64: string, uaPrivateB64: string, authB64: string): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);

  const uaPublic = b64urlDecode(uaPublicB64);
  const jwk = (pub: Uint8Array, d?: string): JsonWebKey => ({
    kty: "EC", crv: "P-256", x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33)), ...(d ? { d } : {}),
  });
  const curve = { name: "ECDH", namedCurve: "P-256" };
  const uaKey = await crypto.subtle.importKey("jwk", jwk(uaPublic, uaPrivateB64), curve, false, ["deriveBits"]);
  const asKey = await crypto.subtle.importKey("jwk", jwk(asPublic), curve, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, uaKey, 256));

  const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) => {
    const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info }, k, n * 8));
  };
  const keyInfo = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(b64urlDecode(authB64), shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, ciphertext));
  expect(padded[padded.length - 1]).toBe(2); // last-record delimiter
  return new TextDecoder().decode(padded.slice(0, -1));
}

describe("base64url", () => {
  it("round-trips bytes without padding", () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1]);
    expect(b64urlEncode(bytes)).not.toMatch(/[+/=]/);
    expect(Array.from(b64urlDecode(b64urlEncode(bytes)))).toEqual(Array.from(bytes));
  });
});

describe("encryptPayload (RFC 8291)", () => {
  it("matches the RFC's worked example byte for byte", async () => {
    const body = await encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.auth }, enc.encode(RFC.plaintext), {
      salt: b64urlDecode(RFC.salt),
      senderPublicKey: b64urlDecode(RFC.asPublic),
      senderPrivateKey: b64urlDecode(RFC.asPrivate),
    });
    expect(b64urlEncode(body)).toBe(RFC.body);
  });

  it("produces a message the browser can decrypt, with a fresh key and salt each time", async () => {
    const target = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const message = JSON.stringify({ title: "Match recorded", body: "A match you played was recorded.", url: "/matches?match=x" });
    const a = await encryptPayload(target, enc.encode(message));
    const b = await encryptPayload(target, enc.encode(message));
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b));
    expect(await decrypt(a, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe(message);
  });

  it("refuses payloads that don't fit in one record, and bad keys", async () => {
    await expect(encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.auth }, new Uint8Array(4080))).rejects.toThrow("payload too large");
    await expect(encryptPayload({ p256dh: RFC.uaPublic, auth: "AAAA" }, enc.encode("x"))).rejects.toThrow("invalid auth secret");
    await expect(encryptPayload({ p256dh: "AAAA", auth: RFC.auth }, enc.encode("x"))).rejects.toThrow("invalid P-256 public key");
  });
});

async function newVapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
  return { publicKey, privateKey, verifyKey: pair.publicKey };
}

describe("vapidAuthorization (RFC 8292)", () => {
  it("signs a JWT for the push service's origin that verifies with the public key", async () => {
    const keys = await newVapidKeys();
    const now = Date.UTC(2026, 10, 16, 12, 0, 0);
    const header = await vapidAuthorization(
      "https://fcm.googleapis.com/fcm/send/abc:def",
      { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:camp@example.com" },
      now,
    );
    const m = header.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
    expect(m).not.toBeNull();
    const [, h, c, sig, k] = m!;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:camp@example.com");
    expect(claims.exp).toBe(now / 1000 + 3600);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, keys.verifyKey, b64urlDecode(sig), enc.encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it("requires a contact subject", async () => {
    const keys = await newVapidKeys();
    await expect(vapidAuthorization("https://web.push.apple.com/x", { ...keys, subject: "camp@example.com" }))
      .rejects.toThrow(/subject/);
  });
});

describe("buildPushRequest", () => {
  it("sets the Web Push headers and an encrypted body", async () => {
    const keys = await newVapidKeys();
    const { url, init } = await buildPushRequest(
      { endpoint: "https://web.push.apple.com/QGuR", p256dh: RFC.uaPublic, auth: RFC.auth },
      '{"title":"Hi"}',
      { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "https://camp.example" },
      { ttl: 3600, urgency: "high" },
    );
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://web.push.apple.com/QGuR");
    expect(init.method).toBe("POST");
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("3600");
    expect(headers.Urgency).toBe("high");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(await decrypt(init.body as Uint8Array, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe('{"title":"Hi"}');
  });
});

describe("isPushEndpoint", () => {
  it("accepts the browsers' push services", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGuR",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) expect(isPushEndpoint(e)).toBe(true);
  });
  it("rejects anything else", () => {
    for (const e of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/x",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/x",
      "https://notfcm.googleapis.com/x",
      "not a url",
    ]) expect(isPushEndpoint(e)).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("matches only identical strings", () => {
    expect(timingSafeEqual("s3cret", "s3cret")).toBe(true);
    expect(timingSafeEqual("s3cret", "s3creT")).toBe(false);
    expect(timingSafeEqual("s3cret", "s3cret!")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
  });
});
