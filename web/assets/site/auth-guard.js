// 受保护页面的认证 guard：只负责体验（待定态、当前用户、退出、BFCache 复查）。
// 真正的访问控制由服务端完成（dev.mjs 的 /api/auth/verify 子请求 / Nginx auth_request）。
(function () {
  'use strict';

  // 登录页不加载本脚本；这里再做一次防御，避免误引用造成循环
  if (/\/login\.html?$/i.test(window.location.pathname)) return;

  var root = document.documentElement;
  var hasShell = root.hasAttribute('data-auth-shell');
  var authTimeout = 10000;
  var finished = false;
  var verificationId = 0;
  var domReady = document.readyState === 'loading' ? new Promise(function (resolve) {
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  }) : Promise.resolve();

  root.classList.add('auth-pending');
  if (!hasShell) {
    var hideStyle = document.createElement('style');
    hideStyle.setAttribute('data-auth-guard', '');
    hideStyle.textContent = 'html.auth-pending body{opacity:0!important}';
    (document.head || root).appendChild(hideStyle);
  }

  function loginUrl() {
    return '/login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
  }

  function goLogin() {
    if (/\/login\.html?$/i.test(window.location.pathname)) return;
    window.location.replace(loginUrl());
  }

  function reveal() {
    finished = true;
    root.classList.remove('auth-pending');
  }

  function requestMe() {
    var controller = hasShell ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, authTimeout) : undefined;
    return fetch('/api/auth/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (controller && controller.signal.aborted) return { status: 0, body: {} };
        return { status: response.status, body: body };
      });
    }).catch(function () {
      return { status: 0, body: {} };
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  /* ---------- 服务不可用：遮住页面，不把未知状态当成已登录 ---------- */
  function showUnavailable(status) {
    reveal();
    root.classList.add('auth-blocked');
    var existing = document.getElementById('auth-guard-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'auth-guard-overlay';
    overlay.className = 'auth-guard-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'auth-guard-title');

    var dialog = document.createElement('div');
    dialog.className = 'auth-guard-dialog';
    dialog.innerHTML = ''
      + '<h2 id="auth-guard-title">认证服务暂不可用</h2>'
      + '<p></p>'
      + '<div class="auth-guard-actions">'
      + '<button type="button" data-auth-retry>重新检查</button>'
      + '<a href="/login.html">返回登录页</a>'
      + '</div>';

    dialog.querySelector('p').textContent = status
      ? '无法确认当前登录状态（认证服务返回 ' + status + '），为避免使用失效会话，本页内容暂不可用。请稍后重试。'
      : '无法连接认证服务，为避免使用失效会话，本页内容暂不可用。请检查网络后重试。';

    var retry = dialog.querySelector('[data-auth-retry]');
    retry.addEventListener('click', function () {
      retry.disabled = true;
      retry.textContent = '检查中…';
      verify();
    });

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function clearUnavailable() {
    var existing = document.getElementById('auth-guard-overlay');
    if (existing) existing.parentNode.removeChild(existing);
    root.classList.remove('auth-blocked');
  }

  /* ---------- 当前用户 / 退出 ---------- */
  function pickMount() {
    var selectors = ['.site-head', '.cover .top .wrap', 'header.top .wrap', 'header.top', 'header', 'nav.site-nav', 'nav.main', 'nav'];
    for (var i = 0; i < selectors.length; i += 1) {
      var node = document.querySelector(selectors[i]);
      if (node) return node;
    }
    return null;
  }

  function mountUser(user) {
    var old = document.querySelector('[data-auth-user]');
    if (old) old.parentNode.removeChild(old);
    var mount = pickMount();
    if (!mount) return;

    var box = document.createElement('div');
    box.className = 'auth-user';
    box.setAttribute('data-auth-user', '');

    var name = document.createElement('span');
    name.className = 'auth-user__name';
    name.textContent = user.displayName || user.username || '已登录';
    name.title = (user.displayName ? user.displayName + ' · ' : '') + (user.username || '');

    var logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'auth-user__logout';
    logout.textContent = '退出登录';
    logout.addEventListener('click', function () {
      logout.disabled = true;
      logout.textContent = '退出中…';
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      }).then(function (response) {
        if (!response.ok) throw new Error('logout failed');
        window.location.replace('/login.html');
      }).catch(function () {
        logout.disabled = false;
        logout.textContent = '退出失败，重试';
      });
    });

    box.appendChild(name);
    box.appendChild(logout);
    mount.appendChild(box);
  }

  function onVerified(user) {
    window.__authUser = user;
    clearUnavailable();
    reveal();
    mountUser(user);
  }

  /* ---------- 校验 ---------- */
  function verify() {
    var id = ++verificationId;
    var request = hasShell ? requestMe() : domReady.then(requestMe);
    return Promise.all([request, domReady]).then(function (results) {
      if (id !== verificationId) return;
      var result = results[0];
      if (result.status === 200 && result.body && result.body.authenticated && result.body.user) {
        onVerified(result.body.user);
        return;
      }
      if (result.status === 401) {
        goLogin();
        return;
      }
      // 503 / 0 / 其他：不能当作已登录继续使用
      showUnavailable(result.status);
    });
  }

  verify();

  // 兜底：认证服务无响应时不要让页面永远空白（内容仍由服务端授权交付）
  if (!hasShell) {
    setTimeout(function () {
      if (finished || !document.body) return;
      showUnavailable(0);
    }, authTimeout);
  }

  if (hasShell) {
    window.addEventListener('pagehide', function (event) {
      if (!event.persisted) return;
      verificationId += 1;
      root.classList.add('auth-pending');
    });
  }

  // BFCache 恢复（浏览器后退）必须重新校验：退出/被禁用后不能靠缓存继续看
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    root.classList.add('auth-pending');
    finished = false;
    if (hasShell) clearUnavailable();
    verify();
  });

  window.__authGuard = { verify: verify, loginUrl: loginUrl };
})();
