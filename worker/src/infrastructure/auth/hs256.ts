import type { TokenVerifier } from "@application/ports";
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

export function hs256Verifier(secret: string, now: () => Date): TokenVerifier {
  const key = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

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
