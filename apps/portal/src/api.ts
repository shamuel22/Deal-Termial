/**
 * Cliente de la API del portal. La sesión viaja en una cookie httpOnly; el portal nunca maneja
 * credenciales de agentes salvo en el momento de emitirlas para mostrarlas al dueño.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const error = (json as { error?: ApiErrorBody } | null)?.error ?? {
      code: `HTTP_${res.status}`,
      message: res.statusText || 'Network error',
    };
    throw new ApiError(res.status, error);
  }
  return json as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, body ?? {});
export const del = <T>(path: string) => api<T>('DELETE', path);
