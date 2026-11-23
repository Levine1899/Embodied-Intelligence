/* 轻量合成环境音：不加载任何音频资产，WebAudio 现场合成。
 * 默认关闭，必须用户点击开启；失败静默降级，不影响三维与知识内容。
 * 说明：这是氛围示意，不是现场录音，也不代表真实设备声级。
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var noise = null;
  var filter = null;
  var hum = null;
  var on = false;
  var stage = 0;
  var volume = 0.05;

  var STAGE_FREQ = [180, 280, 220, 380, 460];

  function build() {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 低频噪声：模拟厂房/风道底噪
    var len = Math.floor(ctx.sampleRate * 2);
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i += 1) {
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = STAGE_FREQ[stage];
    filter.Q.value = 0.6;
    var noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.7;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);

    // 轻微机械嗡鸣
    hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 48;
    var humGain = ctx.createGain();
    humGain.gain.value = 0.09;
    hum.connect(humGain);
    humGain.connect(master);

    noise.start(0);
    hum.start(0);
    return true;
  }

  function ramp(param, value, time) {
    if (!ctx) return;
    var now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + (time || 0.6));
  }

  function cue(kind) {
    if (!on || !ctx || !master) return;
    try {
      var f = kind === 'pump' ? 90 : kind === 'tower' ? 260 : kind === 'separator' ? 170 : 140;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = kind === 'tower' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.55), ctx.currentTime + 0.16);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  }

  function toggle() {
    if (!ctx) {
      if (!build()) return { supported: false, on: false };
    }
    if (ctx.state === 'suspended') ctx.resume();
    on = !on;
    ramp(master.gain, on ? volume : 0, 0.5);
    return { supported: true, on: on };
  }

  function setStage(index) {
    stage = Math.max(0, Math.min(STAGE_FREQ.length - 1, Number(index) || 0));
    if (filter) ramp(filter.frequency, STAGE_FREQ[stage], 1.2);
  }

  function setVolume(value) {
    volume = Math.max(0, Math.min(0.16, Number(value) || 0.05));
    if (master) ramp(master.gain, on ? volume : 0, 0.25);
    return volume;
  }

  function setMuted(muted) {
    on = !muted;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (master) ramp(master.gain, on ? volume : 0, 0.25);
    return { supported: !!ctx, on: on };
  }

  function getVolume() { return volume; }

  function blip() {
    if (!ctx || !on) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 760;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(master);
    var t = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  global.Ambient = {
    toggle: toggle,
    cue: cue,
    setStage: setStage,
    setVolume: setVolume,
    getVolume: getVolume,
    setMuted: setMuted,
    blip: blip,
    state: function () { return { on: on, stage: stage, volume: volume, supported: !!ctx }; }
  };
})(window);
