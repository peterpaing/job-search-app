type SessionIdentitySource = {
  user?: {
    id: string;
  } | null;
  session?: {
    id: string;
    getToken: () => Promise<string | null>;
  } | null;
};

export async function readOwnedSessionToken(
  clerk: SessionIdentitySource,
  userId: string | null | undefined,
  sessionId: string | null | undefined,
): Promise<string | null> {
  const session = clerk.session;

  if (
    !userId ||
    !sessionId ||
    !session ||
    session.id !== sessionId ||
    clerk.user?.id !== userId
  ) {
    return null;
  }

  // Call the captured session's method, preserving its receiver.
  const token = await session.getToken();

  // The active account may have changed while token retrieval was pending.
  if (clerk.session?.id !== sessionId || clerk.user?.id !== userId) {
    return null;
  }

  return token;
}
