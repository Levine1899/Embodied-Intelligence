/* Optional browser speech narration. No audio files; requires a user gesture. */
(function (global) {
  'use strict';
  var synth = global.speechSynthesis;
  var Utterance = global.SpeechSynthesisUtterance;
  var supported = !!(synth && Utterance);
  var utter = null;
  var currentText = '';
  var playing = false;
  var paused = false;

  function label(btn, text) { if (btn) { btn.textContent = text; } }

  function ensureControls() {
    if (!supported) return;
    var tools = document.querySelector('.scene-head .tools');
    if (!tools || document.getElementById('voice-play')) return;
    var play = document.createElement('button');
    play.type = 'button';
    play.id = 'voice-play';
    play.className = 'tool';
    play.textContent = '朗读';
    play.title = '浏览器语音朗读当前讲解；再点一次暂停/继续';
    var stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.id = 'voice-stop';
    stopBtn.className = 'tool';
    stopBtn.textContent = '停止朗读';
    stopBtn.title = '停止浏览器语音';
    play.addEventListener('click', toggle);
    stopBtn.addEventListener('click', stop);
    tools.insertBefore(play, tools.firstChild);
    tools.insertBefore(stopBtn, play.nextSibling);
  }

  function sync() {
    var play = document.getElementById('voice-play');
    label(play, paused ? '继续朗读' : (playing ? '暂停朗读' : '朗读'));
    var stop = document.getElementById('voice-stop');
    if (stop) stop.disabled = !playing && !paused;
  }

  function setText(text) {
    currentText = String(text || '').replace(/\s+/g, ' ').trim();
  }

  function speak(text) {
    if (!supported) return false;
    var t = String(text || currentText || '').trim();
    if (!t) return false;
    try {
      synth.cancel();
      utter = new Utterance(t);
      utter.lang = 'zh-CN';
      utter.rate = 0.95;
      utter.pitch = 1;
      utter.onend = function () { playing = false; paused = false; sync(); };
      utter.onerror = function () { playing = false; paused = false; sync(); };
      playing = true;
      paused = false;
      synth.speak(utter);
      sync();
      return true;
    } catch (e) {
      playing = false; paused = false; sync(); return false;
    }
  }

  function toggle() {
    if (!supported) return;
    if (paused) {
      try { synth.resume(); paused = false; playing = true; } catch (e) {}
      sync();
      return;
    }
    if (playing) {
      try { synth.pause(); paused = true; playing = false; } catch (e) {}
      sync();
      return;
    }
    speak(currentText);
  }

  function pause() {
    if (!supported || !playing) return;
    try { synth.pause(); playing = false; paused = true; } catch (e) {}
    sync();
  }

  function resume() {
    if (!supported || !paused) return;
    try { synth.resume(); playing = true; paused = false; } catch (e) {}
    sync();
  }

  function stop() {
    if (!supported) return;
    try { synth.cancel(); } catch (e) {}
    playing = false; paused = false; utter = null; sync();
  }

  function state() { return { supported: supported, playing: playing, paused: paused, text: currentText }; }

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
