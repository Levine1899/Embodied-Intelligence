/* 前置章：石油从哪来（2D）
   独立文件，不改 immersion.js；关闭后把控制权交回三维场景。 */
(function () {
  'use strict';
  var dlg = document.getElementById('origin-dialog');
  var open = document.getElementById('open-origin');
  var close = document.getElementById('close-origin');
  var go = document.getElementById('origin-go');
  if (!dlg || !open) return;

  function show() {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function hide() {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  open.addEventListener('click', show);
  if (close) close.addEventListener('click', hide);
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); hide(); });

  if (go) go.addEventListener('click', function () {
    hide();
    var first = document.querySelector('#stages [data-stage="0"]');
    if (first) first.click();
    var live = document.getElementById('live');
    if (live) live.textContent = '已进入第一环节：地下开采。可拖动三维场景查看井筒与储层。';
  });
})();
