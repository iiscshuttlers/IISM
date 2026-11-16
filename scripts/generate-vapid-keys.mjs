// Generates everything phone alerts need: a VAPID key pair and the shared secret the database
// uses to call the send-push function. Run once:  node scripts/generate-vapid-keys.mjs
// Prints the values; nothing is written to disk. Keep the private key and secret private.
import { webcrypto as crypto } from "node:crypto";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;
const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));

console.log(`VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
PUSH_WEBHOOK_SECRET=${secret}

1. Function secrets (replace the email with yours):
   npx supabase secrets set VAPID_PUBLIC_KEY=${publicKey} VAPID_PRIVATE_KEY=${privateKey} PUSH_WEBHOOK_SECRET=${secret} VAPID_SUBJECT=mailto:you@example.com

2. Supabase SQL editor (replace <project-ref>):
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-push', 'push_function_url');
   select vault.create_secret('${secret}', 'push_webhook_secret');

3. GitHub repo → Settings → Secrets and variables → Actions → Variables, and your local .env:
   VITE_VAPID_PUBLIC_KEY=${publicKey}`);
