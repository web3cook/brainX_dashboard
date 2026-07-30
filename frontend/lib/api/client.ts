/** Thin REST wrapper over the backend's surface (docs/API.md). Every call
 * except bootstrap needs the operator's email — there's no signed
 * cross-service token in this pass (see docs/DB_SCHEMA.md's explicit note),
 * so the caller passes it through explicitly rather than this module reading
 * a session itself.
 */

import type {
  ArtifactOut,
  AutonomyMode,
  BootstrapResponse,
  LedgerRow,
  Plan,
  RunCreateResponse,
  RunDetailResponse,
  RunEventEnvelope,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { userEmail?: string } = {},
): Promise<T> {
  const { userEmail, headers, ...rest } = init;
  const method = rest.method ?? "GET";
   
  console.info(`[api] -> ${method} ${path}`, rest.body ? JSON.parse(rest.body as string) : undefined);
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(userEmail ? { "X-User-Email": userEmail } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail ?? res.statusText;
    // A 409 usually just means a state transition already happened (a
    // double-click, or the run moved on before this request landed) — log
    // it at warn, not error, so it doesn't read as a crash in the console.
     
    console[res.status === 409 ? "warn" : "error"](
      `[api] <- ${method} ${path} failed: ${res.status} ${detail}`,
    );
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) {
     
    console.info(`[api] <- ${method} ${path}: 204`);
    return undefined as T;
  }
  const json = await res.json();
   
  console.info(`[api] <- ${method} ${path}: ${res.status}`, json);
  return json as T;
}

export const api = {
  bootstrap: (email: string, name?: string) =>
    request<BootstrapResponse>("/bootstrap", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    }),

  createRun: (
    userEmail: string,
    body: { title: string; brief: string; autonomy_mode: AutonomyMode },
  ) =>
    request<RunCreateResponse>("/runs", {
      method: "POST",
      userEmail,
      body: JSON.stringify(body),
    }),

  getRun: (runId: string) => request<RunDetailResponse>(`/runs/${runId}`),

  getEvents: (runId: string, since: number) =>
    request<{ events: RunEventEnvelope[] }>(`/runs/${runId}/events?since=${since}`),

  approvePlan: (runId: string, editedPlan?: Plan) =>
    request<RunDetailResponse>(`/runs/${runId}/plan/approve`, {
      method: "POST",
      body: JSON.stringify(editedPlan ? { edited_plan: editedPlan } : {}),
    }),

  rejectPlan: (runId: string, note: string) =>
    request<RunDetailResponse>(`/runs/${runId}/plan/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  stopRun: (runId: string) =>
    request<{ run: { state: string } }>(`/runs/${runId}/stop`, { method: "POST" }),

  resumeRun: (runId: string, redirect?: string) =>
    request<RunDetailResponse>(`/runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({ redirect: redirect ?? null }),
    }),

  patchAutonomy: (runId: string, autonomyMode: AutonomyMode) =>
    request<unknown>(`/runs/${runId}/autonomy`, {
      method: "PATCH",
      body: JSON.stringify({ autonomy_mode: autonomyMode }),
    }),

  listArtifacts: (runId: string) =>
    request<{ artifacts: ArtifactOut[] }>(`/runs/${runId}/artifacts`),

  downloadArtifactUrl: (artifactId: string) => `${BASE}/artifacts/${artifactId}/download`,

  getLedger: (runId: string) => request<{ ledger: LedgerRow[] }>(`/runs/${runId}/ledger`),
};

export { ApiError };
export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
