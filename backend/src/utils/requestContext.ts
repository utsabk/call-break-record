/** Session and host credentials are read from headers only, never from request bodies. */
type LambdaHeaders = { [name: string]: string | undefined };

function readHeader(headers: LambdaHeaders | null | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name);
  return match ? headers[match] : undefined;
}

export function readSessionId(headers: LambdaHeaders | null | undefined): string | undefined {
  return readHeader(headers, "x-session-id");
}

export function readHostToken(headers: LambdaHeaders | null | undefined): string | undefined {
  return readHeader(headers, "x-host-token");
}
