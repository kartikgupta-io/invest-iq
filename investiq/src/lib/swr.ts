/**
 * Shared SWR configuration for client-side data access.
 *
 * Every request goes straight to the live backend. There are deliberately no
 * mock fixtures or "sample" fallbacks here: if the service is down the UI
 * shows an error, never invented numbers.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export async function fetcher<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error while fetching ${url}: ${detail}`);
  }

  if (!response.ok) {
    const statusText = response.statusText || "Unknown status";
    throw new Error(`Request failed: ${response.status} ${statusText} (${url})`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from ${url}: ${detail}`);
  }
}

/**
 * Trigger a real upstream harvest on the backend. Without this, "Refresh now"
 * only re-reads the same on-disk snapshot and a stale cache stays stale.
 */
export async function syncLiveData(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/freshness/refresh`, {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error while syncing live data: ${detail}`);
  }
  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status} ${response.statusText || "Unknown status"}`);
  }
}

export const swrConfig = {
  fetcher,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  refreshInterval: 60_000,
  dedupingInterval: 30_000,
  keepPreviousData: true,
  errorRetryCount: 1,
};
