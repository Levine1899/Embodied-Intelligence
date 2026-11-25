// 测试用 HTTP 辅助：不跟随重定向、保留 Set-Cookie。
export async function request(baseUrl, pathname, options = {}) {
  const { method = 'GET', headers = {}, body, timeoutMs = 15000 } = options;
  const init = {
    method,
    redirect: 'manual',
    headers: { ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  };
  if (body !== undefined) {
    if (typeof body === 'string') {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    }
  }
  const response = await fetch(baseUrl + pathname, init);
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON */ }
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  return {
    status: response.status,
    headers: response.headers,
    text,
    json,
    setCookies
  };
}

export function sessionCookieFrom(response) {
  const raw = (response.setCookies || []).find(value => value.startsWith('yj_session='));
  if (!raw) return '';
  return raw.split(';')[0];
}

export function cookieAttributes(response) {
  const raw = (response.setCookies || []).find(value => value.startsWith('yj_session=')) || '';
  return raw;
}

export const DEV_ORIGIN = 'http://127.0.0.1:5173';

/** 生成一个带正确 Origin 的登录请求选项。 */
export function loginOptions(username, password, { origin = DEV_ORIGIN, headers = {} } = {}) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify({ username, password })
  };
}
