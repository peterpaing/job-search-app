type PendingFocus = {
  destination: string;
  initiator: Element | null;
  expiresAt: number;
};

let pendingFocus: PendingFocus | null = null;

function navigationKey(value: string) {
  const url = new URL(value, window.location.origin);

  url.searchParams.sort();

  return `${url.pathname}${url.search}`;
}

export function requestPaginationFocus(destination: string) {
  pendingFocus = {
    destination: navigationKey(destination),
    initiator: document.activeElement,
    expiresAt: Date.now() + 30_000,
  };
}

export function clearPaginationFocus() {
  pendingFocus = null;
}

export function restorePaginationFocus(target: HTMLElement) {
  const pending = pendingFocus;

  if (!pending) {
    return;
  }

  if (Date.now() > pending.expiresAt) {
    clearPaginationFocus();
    return;
  }

  if (navigationKey(window.location.href) !== pending.destination) {
    return;
  }

  clearPaginationFocus();

  const active = document.activeElement;

  // Do not interrupt someone who moved to another control while loading.
  if (
    active !== null &&
    active !== document.body &&
    active !== document.documentElement &&
    active !== pending.initiator
  ) {
    return;
  }

  target.focus({ preventScroll: true });

  // Align the newly loaded results without another animated movement.
  target.scrollIntoView({
    behavior: "instant",
    block: "start",
  });
}
