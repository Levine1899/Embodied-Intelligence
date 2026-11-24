/* iFlytek super-smart TTS narration. Keys stay on the server. */
(function (global) {
  'use strict';
  var supported = !!(global.fetch && global.Audio && global.URL && URL.createObjectURL);
  var audio = null;
  var audioUrl = '';
  var abort = null;
  var token = 0;
  var currentText = '';
  var playing = false;
  var paused = false;
  var loading = false;
  var cache = new Map();

  function label(btn, text) { if (btn) { btn.textContent = text; } }

  function pageText() {
    var chapter = document.getElementById('chapter');
    var explanation = document.getElementById('explanation');
    var parts = [];
    if (chapter && chapter.textContent.trim()) parts.push(chapter.textContent.trim());
    if (explanation && explanation.textContent.trim()) parts.push(explanation.textContent.trim());
    if (!parts.length) {
      var h1 = document.querySelector('.heading h1');
      if (h1) parts.push(h1.textContent.trim());
    }
    return parts.join('。');
  }

  function ensureControls() {
    if (!supported) return;
    if (!currentText) currentText = pageText();
    var tools = document.querySelector('.scene-head .tools');
    if (!tools || document.getElementById('voice-play')) return;
    var play = document.createElement('button');
    play.type = 'button';
    play.id = 'voice-play';
    play.className = 'tool';
    play.textContent = '朗读';
    play.title = '讯飞超拟人语音朗读当前讲解；再点一次暂停/继续';
    var stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.id = 'voice-stop';
    stopBtn.className = 'tool';
    stopBtn.textContent = '停止朗读';
    stopBtn.title = '停止讯飞语音';
    play.addEventListener('click', toggle);
    stopBtn.addEventListener('click', stop);
    tools.insertBefore(play, tools.firstChild);
    tools.insertBefore(stopBtn, play.nextSibling);
    sync();
  }

  function sync() {
    var play = document.getElementById('voice-play');
    label(play, loading ? '合成中…' : (paused ? '继续朗读' : (playing ? '暂停朗读' : '朗读')));
    var stop = document.getElementById('voice-stop');
    if (stop) stop.disabled = !loading && !playing && !paused;
  }

  function setText(text) {
    if (global.Voice) global.Voice.text = String(text || '');
    currentText = String(text || '').replace(/\s+/g, ' ').trim();
    try { global.VoiceCurrentText = currentText; } catch (e) {}
  }

  function clearAudio() {
    if (audio) { try { audio.pause(); } catch (e) {} audio.onended = null; audio.onerror = null; audio = null; }
    if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) {} audioUrl = ''; }
  }

  function stop() {
    token += 1;
    if (abort) { try { abort.abort(); } catch (e) {} abort = null; }
    clearAudio();
    loading = false; playing = false; paused = false; sync();
  }

  function fail(message) {
    loading = false; playing = false; paused = false; sync();
    var live = document.getElementById('live');
    if (live) live.textContent = message || '语音合成失败，请稍后重试。';
  }

  function speak(text) {
    if (!supported) return false;
    var t = String(text || currentText || pageText() || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    currentText = t.slice(0, 1200);
    var my = ++token;
    if (abort) { try { abort.abort(); } catch (e) {} }
    clearAudio();
    paused = false; playing = false; loading = true; sync();

    var cached = cache.get(currentText);
    if (cached) { loading = false; playBlob(cached, my); return true; }

    abort = new AbortController();
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: currentText }),
      signal: abort.signal
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.error || ('语音合成失败（' + res.status + '）'));
        });
      }
      return res.blob();
    }).then(function (blob) {
      if (my !== token) return;
      if (!blob || !blob.size) throw new Error('语音合成返回空音频');
      cache.set(currentText, blob);
      if (cache.size > 6) cache.delete(cache.keys().next().value);
      loading = false;
      playBlob(blob, my);
    }).catch(function (err) {
      if (my !== token || (err && err.name === 'AbortError')) return;
      fail(err && err.message);
    });
    return true;
  }

  function playBlob(blob, my) {
    audioUrl = URL.createObjectURL(blob);
    audio = new Audio(audioUrl);
    audio.onended = function () { playing = false; paused = false; sync(); };
    audio.onerror = function () { fail('音频播放失败，请重试。'); };
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) {
      if (my !== token) return;
      fail('浏览器阻止了自动播放，请再点一次朗读。');
    });
    playing = true; paused = false; sync();
  }

  function toggle() {
    if (!supported) return;
    if (loading) return;
    if (paused && audio) {
      audio.play().then(function () { playing = true; paused = false; sync(); }).catch(function () {});
      return;
    }
    if (playing && audio) {
      audio.pause(); playing = false; paused = true; sync();
      return;
    }
    speak(currentText);
  }

  function pause() {
    if (!supported || !playing || !audio) return;
    audio.pause(); playing = false; paused = true; sync();
  }

  function resume() {
    if (!supported || !paused || !audio) return;
    audio.play().then(function () { playing = true; paused = false; sync(); }).catch(function () {});
  }

  function state() { return { supported: supported, playing: playing, paused: paused, loading: loading, text: currentText }; }

  global.Voice = {
    supported: supported,
    ensureControls: ensureControls,
    setText: setText,
    speak: speak,
    toggle: toggle,
    pause: pause,
    resume: resume,
    stop: stop,
    sync: sync,
    state: state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureControls);
  } else {
    ensureControls();
  }
  global.addEventListener('pagehide', stop);
})(window);
