// 登录页交互：状态检查、登录提交、错误提示、密码显隐。
// 不做注册、不做找回密码、不把任何凭据写入浏览器存储。
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var usernameInput = document.getElementById('username');
  var passwordInput = document.getElementById('password');
  var toggleButton = document.getElementById('toggle-password');
  var submitButton = document.getElementById('submit');
  var errorBox = document.getElementById('error');
  var noticeBox = document.getElementById('status-notice');
  var initHint = document.getElementById('init-hint');
  var adminCmd = document.getElementById('admin-cmd');

  if (!form || !usernameInput || !passwordInput || !submitButton) return;

  var AuthNext = window.AuthNext || {};
  var origin = window.location.origin;
  var nextTarget = typeof AuthNext.pickNext === 'function'
    ? AuthNext.pickNext(new URLSearchParams(window.location.search).get('next'), origin)
    : '/index.html';

  var busy = false;

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = '';
    errorBox.hidden = true;
  }

  function showNotice(message, kind, withCode) {
    if (!noticeBox) return;
    noticeBox.className = 'notice' + (kind ? ' notice--' + kind : '');
    noticeBox.textContent = message;
    if (withCode) {
      var code = document.createElement('code');
      code.textContent = 'node server/auth-cli.mjs init-admin';
      noticeBox.appendChild(document.createElement('br'));
      noticeBox.appendChild(code);
    }
    noticeBox.hidden = false;
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    submitButton.disabled = nextBusy;
    submitButton.textContent = nextBusy ? '登录中…' : '登录系统';
    submitButton.setAttribute('aria-busy', nextBusy ? 'true' : 'false');
    usernameInput.readOnly = nextBusy;
    passwordInput.readOnly = nextBusy;
  }

  function lockForm() {
    submitButton.disabled = true;
    usernameInput.disabled = true;
    passwordInput.disabled = true;
    if (toggleButton) toggleButton.disabled = true;
  }

  function markNotInitialized() {
    if (initHint) initHint.hidden = false;
    if (adminCmd) adminCmd.hidden = false;
    showNotice('系统尚未初始化管理员账号，请联系部署管理员完成初始化。', 'warn');
    lockForm();
  }

  /* ---------- 密码显隐 ---------- */
  if (toggleButton) {
    toggleButton.addEventListener('click', function () {
      var show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      toggleButton.setAttribute('aria-pressed', show ? 'true' : 'false');
      toggleButton.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      toggleButton.querySelector('.toggle-text').textContent = show ? '隐藏' : '显示';
      passwordInput.focus();
    });
  }

  /* ---------- 初始化状态 ---------- */
  function fetchJson(url, options) {
    return fetch(url, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        return { status: response.status, body: body };
      });
    });
  }

  fetchJson('/api/auth/status', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(function (result) {
      if (result.status === 200 && result.body && result.body.initialized === false) {
        markNotInitialized();
        return;
      }
      if (result.status !== 200) {
        showNotice('认证服务暂不可用，暂时无法登录。请稍后刷新；若持续出现请联系管理员。', 'warn');
        lockForm();
        return;
      }
      // 已登录时直接进入目标页（服务端仍会独立校验）
      fetchJson('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (me) {
          if (me.status === 200 && me.body && me.body.authenticated) {
            window.location.replace(nextTarget);
          }
        })
        .catch(function () { /* 忽略：未登录或网络抖动时留在登录页 */ });
    })
    .catch(function () {
      showNotice('无法连接认证服务，暂时无法登录。请检查网络后刷新重试。', 'warn');
      lockForm();
    });

  /* ---------- 提交 ---------- */
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) return;
    clearError();

    var username = usernameInput.value;
    var password = passwordInput.value;
    if (!username.trim()) {
      showError('请输入用户名');
      usernameInput.focus();
      return;
    }
    if (!password) {
      showError('请输入密码');
      passwordInput.focus();
      return;
    }

    setBusy(true);
    fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (result.status === 200 && result.body && result.body.authenticated) {
          passwordInput.value = '';
          window.location.replace(nextTarget);
          return;
        }
        setBusy(false);
        if (result.status === 401) {
          showError('用户名或密码错误');
        } else if (result.status === 429) {
          showError('尝试次数过多，请稍后再试');
        } else if (result.status === 403) {
          showError('请求来源不被允许，请从系统入口重新打开登录页');
        } else if (result.status === 503 && result.body && result.body.error === 'auth_not_initialized') {
          markNotInitialized();
        } else if (result.status === 503) {
          showError('认证服务暂不可用，请稍后再试');
        } else if (result.status === 415 || result.status === 400) {
          showError('登录请求格式异常，请刷新页面后重试');
        } else {
          showError('登录失败，请稍后再试');
        }
        passwordInput.value = '';
        passwordInput.focus();
      })
      .catch(function () {
        setBusy(false);
        showError('无法连接认证服务，请检查网络后重试');
      });
  });

  /* ---------- 初始焦点：桌面端聚焦用户名；移动端不强制弹键盘 ---------- */
  try {
    var finePointer = window.matchMedia('(pointer: fine)').matches;
    var wideEnough = window.innerWidth >= 900;
    if (finePointer && wideEnough && !window.navigator.webdriver) {
      usernameInput.focus({ preventScroll: true });
    }
  } catch (error) { /* 忽略 */ }

  usernameInput.addEventListener('input', clearError);
  passwordInput.addEventListener('input', clearError);
})();
