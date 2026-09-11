import type { TokenSigner, TokenVerifier } from "@application/ports";
import type { TokenClaims, TokenPurpose } from "@domain/auth/access-token";

/**
 * HS256 only, matching what the Python service signs with. Narrow on purpose:
 * accepting whatever `alg` the token names is how JWT verification gets
 * bypassed, so the header is checked against this rather than obeyed.
 */
const ALGORITHM = "HS256";

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
  } catch {
    return null;
  }
}

function toClaims(payload: Record<string, unknown>): TokenClaims {
  const number = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    sub: typeof payload.sub === "string" ? payload.sub : null,
    purpose: typeof payload.purpose === "string" ? (payload.purpose as TokenPurpose) : null,
    issuedAt: number(payload.iat),
    expiresAt: number(payload.exp),
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/**
 * Claim order matches PyJWT's, so a token minted here is byte-identical to
 * one the Python service would mint for the same session.
 */
export function hs256Signer(secret: string): TokenSigner {
  const key = hmacKey(secret, "sign");

  return {
    async sign(claims): Promise<string> {
      const encode = (value: unknown) =>
        bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));

      const body = [
        encode({ alg: ALGORITHM, typ: "JWT" }),
        encode({
          sub: claims.sub,
          purpose: claims.purpose,
          exp: claims.expiresAt,
          iat: claims.issuedAt,
        }),
      ].join(".");

      const signature = await crypto.subtle.sign("HMAC", await key, new TextEncoder().encode(body));
      return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
    },
  };
}

export function hs256Verifier(secret: string, now: () => Date): TokenVerifier {
  const key = hmacKey(secret, "verify");

  return {
    async verify(token: string): Promise<TokenClaims | null> {
      const [encodedHeader, encodedPayload, encodedSignature, ...extra] = token.split(".");
      if (!encodedHeader || !encodedPayload || !encodedSignature || extra.length) return null;

      const header = decodeJson(encodedHeader);
      if (header?.alg !== ALGORITHM) return null;

      const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
      const valid = await crypto.subtle
        .verify("HMAC", await key, base64UrlToBytes(encodedSignature), signed)
        .catch(() => false);
      if (!valid) return null;

      const payload = decodeJson(encodedPayload);
      if (!payload) return null;

      const claims = toClaims(payload);
      // Expiry is part of what the signature vouches for, so it is checked
      // here rather than left to a caller that might forget.
      if (claims.expiresAt !== null && claims.expiresAt * 1000 <= now().getTime()) return null;

      return claims;
    },
  };
}
