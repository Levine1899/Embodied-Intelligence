// 登录后跳转目标（next）白名单校验。
// 只允许当前站点 Origin + 受保护页面清单内的路径；其余一律回退入口页。
// 以 window.AuthNext 暴露，便于用 node:vm 直接测试真实浏览器代码。
(function (global) {
  'use strict';

  var DEFAULT_PAGE = '/index.html';
  // 与 server/protected-pages.json 的 protected 列表保持一致（tests/auth-pages.test.mjs 会校验）
  var ALLOWED_PAGES = [
    '/index.html',
    '/sandbox.html',
    '/explore.html',
    '/chapter.html',
    '/tower.html',
    '/ask.html',
    '/write.html',
    '/kb.html',
    '/videos.html',
    '/video.html',
    '/_spike-separator.html'
  ];

  function pickNext(raw, origin) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return DEFAULT_PAGE;
    // 控制字符、反斜杠、编码斜杠/反斜杠：直接拒绝，不做“猜测式修复”
    if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_PAGE;
    if (raw.indexOf('\\') !== -1) return DEFAULT_PAGE;
    if (/%2f|%5c/i.test(raw)) return DEFAULT_PAGE;

    var url;
    try {
      url = new URL(raw, origin);
    } catch (error) {
      return DEFAULT_PAGE;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_PAGE;
    if (url.origin !== origin) return DEFAULT_PAGE;
    if (url.username || url.password) return DEFAULT_PAGE;

    var page = url.pathname.toLowerCase();
    if (ALLOWED_PAGES.indexOf(page) === -1) return DEFAULT_PAGE;

    var search = '';
    if (page === '/chapter.html') {
      var id = url.searchParams.get('id');
      if (id && /^[a-z0-9-]{1,32}$/.test(id)) search = '?id=' + id;
    }
    var hash = '';
    if (page === '/sandbox.html') {
      var match = /^#stage=([0-4])$/.exec(url.hash || '');
      if (match) hash = '#stage=' + match[1];
    }
    return page + search + hash;
  }

  function loginUrlFor(locationLike) {
    var target = locationLike.pathname + locationLike.search;
    return '/login.html?next=' + encodeURIComponent(target);
  }

  global.AuthNext = {
    DEFAULT_PAGE: DEFAULT_PAGE,
    ALLOWED_PAGES: ALLOWED_PAGES,
    pickNext: pickNext,
    loginUrlFor: loginUrlFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
