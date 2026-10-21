type ApiRequestOptions = {
  path: `/api/${string}`;
  token: string;
  method?: string;
  body?: unknown;
  signal: AbortSignal;
  accept?: string;
};

export async function apiRequest({
  path,
  token,
  method = "GET",
  body,
  signal,
  accept,
}: ApiRequestOptions): Promise<Response> {
  return fetch(
    new URL(
      path,
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
    ),
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accept ? { Accept: accept } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal,
    },
  );
}
