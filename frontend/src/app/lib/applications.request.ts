import type { ApplicationUpdate } from "./applications.types";

type ApplicationRequestOptions = {
  path?: string;
  method?: string;
  body?: ApplicationUpdate;
  signedIn: boolean;
  getToken: () => Promise<string | null>;
  isActive: () => boolean;
};

export async function requestApplications({
  path = "",
  method = "GET",
  body,
  signedIn,
  getToken,
  isActive,
}: ApplicationRequestOptions): Promise<Response> {
  if (!isActive() || !signedIn) {
    throw new Error("This application session is no longer active.");
  }

  const token = await getToken();

  if (!isActive()) {
    throw new Error("This application session is no longer active.");
  }

  if (!token) {
    throw new Error("Sign in to manage applications.");
  }

  const response = await fetch(
    new URL(
      `/api/applications${path}`,
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
    ),
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  // The provider handles the latest record returned with a stale-save conflict.
  if (response.status === 409 && method === "PATCH") {
    return response;
  }

  if (!response.ok) {
    if (response.status === 404 && method === "PUT") {
      throw new Error("This listing is no longer available to track.");
    }

    throw new Error(
      "We couldn’t confirm the change. Try again or refresh your applications.",
    );
  }

  return response;
}
