"use client";

import type { useClerk } from "@clerk/nextjs";
import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Access } from "./smart-match.types";
import {
  readAnswerStream,
  SmartMatchRequestError,
} from "./smart-match.transport";

type SmartMatchRequestOptions = {
  clerk: ReturnType<typeof useClerk>;
  userId: string;
  sessionId: string;
  mounted: RefObject<boolean>;
  controllers: RefObject<Set<AbortController>>;
  setAccess: Dispatch<SetStateAction<Access | null>>;
};

export function useSmartMatchRequest({
  clerk,
  userId,
  sessionId,
  mounted,
  controllers,
  setAccess,
}: SmartMatchRequestOptions) {
  return useCallback(
    async <T>(
      path: string,
      method = "GET",
      body?: unknown,
      cancellation?: AbortSignal,
      onAnswerDelta?: (delta: string) => void,
    ): Promise<T> => {
      const session = clerk.session;

      function ensureCurrent() {
        if (
          cancellation?.aborted ||
          !mounted.current ||
          clerk.user?.id !== userId ||
          clerk.session?.id !== sessionId
        ) {
          throw new Error("Your account changed. Please try again.");
        }
      }

      ensureCurrent();

      if (session?.id !== sessionId) {
        throw new Error("Please sign in again.");
      }

      const token = await session.getToken();

      ensureCurrent();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const controller = new AbortController();
      controllers.current.add(controller);

      const timeout = setTimeout(() => controller.abort(), 45_000);

      try {
        const url = new URL(
          `/api/smart-match${path}`,
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
        );

        const response = await fetch(url, {
          method,
          cache: "no-store",
          signal: cancellation
            ? AbortSignal.any([controller.signal, cancellation])
            : controller.signal,

          headers: {
            Authorization: `Bearer ${token}`,

            ...(body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),

            ...(onAnswerDelta ? { Accept: "application/x-ndjson" } : {}),
          },

          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        ensureCurrent();

        if (!response.ok) {
          const value: unknown = await response.json();
          ensureCurrent();

          if (response.status === 403) {
            setAccess((previous) =>
              previous ? { ...previous, premium: false } : previous,
            );
          }

          const message =
            typeof value === "object" &&
            value !== null &&
            "message" in value &&
            typeof value.message === "string"
              ? value.message
              : "SmartMatch couldn’t complete this request.";

          throw new SmartMatchRequestError(response.status, message);
        }

        if (
          onAnswerDelta &&
          response.headers.get("content-type")?.includes("application/x-ndjson")
        ) {
          return await readAnswerStream<T>(
            response,
            (delta) => {
              ensureCurrent();
              onAnswerDelta(delta);
            },
            ensureCurrent,
          );
        }

        const value: unknown = await response.json();
        ensureCurrent();

        return value as T;
      } finally {
        clearTimeout(timeout);
        controllers.current.delete(controller);
      }
    },
    [clerk, controllers, mounted, sessionId, setAccess, userId],
  );
}
