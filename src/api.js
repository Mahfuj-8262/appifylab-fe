// API client for the Appifylab .NET backend.
// - Access token (short-lived JWT) is kept in memory only.
// - The durable credential is the httpOnly `refreshToken` cookie the backend sets
//   on /api/auth/*; we send it with `credentials: 'include'`.
// - On a 401 we transparently refresh once and retry the request.
//
// The dev backend allows CORS only from http://localhost:3000, so run the CRA
// dev server on port 3000 (its default).

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5049';

let accessToken = null;

function setSession(auth) {
  accessToken = auth.accessToken;
  const user = {
    userId: auth.userId,
    firstName: auth.firstName,
    lastName: auth.lastName,
    email: auth.email,
  };
  localStorage.setItem('bs_user', JSON.stringify(user));
  localStorage.setItem('bs_auth', '1');
}

function clearSession() {
  accessToken = null;
  localStorage.removeItem('bs_user');
  localStorage.removeItem('bs_auth');
}

export function isLoggedIn() {
  return localStorage.getItem('bs_auth') === '1';
}

export function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem('bs_user'));
  } catch {
    return null;
  }
}

// export function mediaUrl(path) {
//   return path ? API_BASE + path : null;
// }

async function toError(res, fallback) {
  let message = fallback;
  try {
    const data = await res.json();
    if (data && data.message) message = data.message;
  } catch {
    /* non-JSON body — keep the fallback message */
  }
  return new Error(message);
}

function redirectToLogin() {
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

export async function refreshSession() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      clearSession();
      return false;
    }
    setSession(await res.json());
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function rawFetch(path, opts, token) {
  const headers = new Headers(opts.headers || {});
  const isForm = opts.body instanceof FormData;
  if (!isForm && opts.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...opts, headers, credentials: 'include' });
}

// Authenticated request with a single transparent refresh-and-retry on 401.
async function authFetch(path, opts = {}) {
  if (!accessToken) await refreshSession();
  let res = await rawFetch(path, opts, accessToken);
  if (res.status === 401) {
    const ok = await refreshSession();
    if (!ok) {
      redirectToLogin();
      throw new Error('Your session has expired. Please log in again.');
    }
    res = await rawFetch(path, opts, accessToken);
  }
  return res;
}

// ---- Auth ----

export async function register(payload) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await toError(res, res.status === 409 ? 'That email is already registered.' : 'Registration failed.');
  }
  const data = await res.json();
  setSession(data);
  return data;
}

export async function login(payload) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await toError(res, res.status === 401 ? 'Invalid email or password.' : 'Login failed.');
  }
  const data = await res.json();
  setSession(data);
  return data;
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } finally {
    clearSession();
  }
}

// ---- Posts / comments ----

export async function getFeed(cursor) {
  const qs = new URLSearchParams();
  if (cursor) qs.set('cursor', cursor);
  qs.set('pageSize', '20');
  const res = await authFetch(`/api/posts/?${qs.toString()}`, { method: 'GET' });
  if (!res.ok) throw await toError(res, 'Failed to load the feed.');
  return res.json();
}

export async function createPost({ content, visibility, imageFile }) {
  const fd = new FormData();
  fd.append('content', content);
  fd.append('visibility', visibility);
  if (imageFile) fd.append('image', imageFile);
  const res = await authFetch('/api/posts/', { method: 'POST', body: fd });
  if (!res.ok) throw await toError(res, 'Could not create the post.');
  return res.json();
}

export async function togglePostLike(postId) {
  const res = await authFetch(`/api/posts/${postId}/like`, { method: 'POST' });
  if (!res.ok) throw await toError(res, 'Could not update like.');
  return res.json(); // { liked: boolean }
}

export async function getComments(postId) {
  const res = await authFetch(`/api/posts/${postId}/comments`, { method: 'GET' });
  if (!res.ok) throw await toError(res, 'Could not load comments.');
  return res.json();
}

export async function addComment(postId, content, parentCommentId) {
  const res = await authFetch(`/api/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, parentCommentId: parentCommentId || null }),
  });
  if (!res.ok) throw await toError(res, 'Could not add comment.');
  return res.json();
}

export async function toggleCommentLike(commentId) {
  const res = await authFetch(`/api/comments/${commentId}/like`, { method: 'POST' });
  if (!res.ok) throw await toError(res, 'Could not update like.');
  return res.json(); // { liked: boolean }
}

export async function deletePost(postId) {
  const res = await authFetch(`/api/posts/${postId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw await toError(res, 'Could not delete the post.');
}

export async function deleteComment(commentId) {
  const res = await authFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw await toError(res, 'Could not delete the comment.');
}
