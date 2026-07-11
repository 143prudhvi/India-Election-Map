// Thin same-origin fetch wrapper. All API access goes through here so that
// 401s can trigger a global "logged out" handler registered by AuthContext.

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler = null;
let mustChangePasswordHandler = null;

export function onUnauthorized(callback) {
  unauthorizedHandler = callback;
}

export function onMustChangePassword(callback) {
  mustChangePasswordHandler = callback;
}

async function request(method, url, body) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (res.status === 204) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const message = (payload && payload.error) || `Request failed (${res.status})`;
    const code = payload && payload.code;
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    if (res.status === 403 && code === 'MUST_CHANGE_PASSWORD' && mustChangePasswordHandler) {
      // Shouldn't happen mid-app (the gate handles it) — refresh auth state.
      mustChangePasswordHandler();
    }
    throw new ApiError(res.status, message, code);
  }

  return payload;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
