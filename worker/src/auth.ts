export async function bearerMatches(
  authorization: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const match = authorization?.match(/^Bearer\s+(\S+)\s*$/i);
  const token = match?.[1] ?? "";
  if (!token) return false;

  const encoder = new TextEncoder();
  const [tokenDigest, secretDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(token)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const actual = new Uint8Array(tokenDigest);
  const expected = new Uint8Array(secretDigest);
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}
