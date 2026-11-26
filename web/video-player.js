import { createCategoryControl, createVideoCover, durationLabel, listingUrl, loadVideoGroups, posterUrl, readListing, watchUrl } from './video-catalog.js';
import { videoUrl } from './assets/site/video-source.js?v=1';

const status = document.getElementById('catalog-status');
const content = document.getElementById('watch-content');
const back = document.getElementById('back-to-list');
const categories = document.getElementById('watch-categories');
const queue = document.getElementById('queue-items');
const queueTitle = document.getElementById('queue-title');
const queueCount = document.getElementById('queue-count');
const frame = document.getElementById('video-frame');
const player = document.getElementById('video-player');
const start = document.getElementById('video-start');
const title = document.getElementById('video-title');
const category = document.getElementById('video-category');
const duration = document.getElementById('video-duration');
const notice = document.getElementById('video-error');
const slowBufferingDelay = 8000;

let selectedVideo;
let bufferingTimer;
let resumeTime = 0;

function clearPlaybackNotice() {
  clearTimeout(bufferingTimer);
  bufferingTimer = undefined;
  notice.hidden = true;
}

function hidePlayButton() {
  if (document.activeElement === start) player.focus({ preventScroll: true });
  start.hidden = true;
}

function showBuffering() {
  if (!selectedVideo || player.paused || bufferingTimer !== undefined) return;
  hidePlayButton();
  notice.textContent = '正在缓冲视频…';
  notice.hidden = false;
  bufferingTimer = setTimeout(() => {
    notice.textContent = '视频缓冲较慢，可以继续等待或切换到其他视频。';
  }, slowBufferingDelay);
}

function selectVideo(video) {
  if (selectedVideo === video) return;
  selectedVideo = video;
  document.title = '石油科普智能体';
  title.textContent = video.title;
  category.textContent = video.category;
  duration.textContent = durationLabel(video.duration);
  duration.dateTime = `PT${video.duration}S`;
  clearPlaybackNotice();
  start.hidden = false;
  start.setAttribute('aria-label', `播放${video.title}`);
  player.poster = posterUrl(video);
  player.src = videoUrl(video.id);

  queue.querySelector('[aria-current]')?.removeAttribute('aria-current');
  queue.querySelector(`[data-video-id="${video.id}"]`)?.setAttribute('aria-current', 'true');
}

function showPlaybackError() {
  clearPlaybackNotice();
  start.hidden = false;
  start.setAttribute('aria-label', `重试播放${selectedVideo.title}`);
  notice.textContent = '视频暂时无法播放，请重试或选择其他视频。';
  notice.hidden = false;
}

function playSelected() {
  const video = selectedVideo;
  if (player.error) {
    clearPlaybackNotice();
    player.load();
  }
  player.play().catch(error => {
    if (video !== selectedVideo || !player.hasAttribute('src') || ['AbortError', 'NotAllowedError'].includes(error.name)) return;
    showPlaybackError();
  });
}

start.addEventListener('click', playSelected);
player.addEventListener('waiting', showBuffering);
player.addEventListener('pause', () => {
  if (bufferingTimer !== undefined) clearPlaybackNotice();
});
player.addEventListener('playing', () => {
  hidePlayButton();
  clearPlaybackNotice();
});
player.addEventListener('error', () => {
  if (player.error && selectedVideo && player.hasAttribute('src')) showPlaybackError();
});

function releaseVideo() {
  if (!player.hasAttribute('src')) return;
  resumeTime = player.currentTime;
  player.pause();
  player.removeAttribute('src');
  player.load();
  clearPlaybackNotice();
}

back.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  releaseVideo();
});
window.addEventListener('pagehide', releaseVideo);
window.addEventListener('pageshow', event => {
  if (!event.persisted || !selectedVideo || player.hasAttribute('src')) return;
  player.src = videoUrl(selectedVideo.id);
  player.currentTime = resumeTime;
  start.hidden = false;
  start.setAttribute('aria-label', `播放${selectedVideo.title}`);
});

function queueItem(video, listing, collection) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'queue-item';
  button.dataset.videoId = video.id;
  button.setAttribute('aria-label', `播放${video.title}`);
  if (selectedVideo === video) button.setAttribute('aria-current', 'true');

  const caption = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'queue-title';
  name.textContent = video.title;
  caption.append(name);
  if (!collection) {
    const label = document.createElement('span');
    label.className = 'queue-category';
    label.textContent = video.category;
    caption.append(label);
  }
  button.append(createVideoCover(video), caption);
  button.addEventListener('click', () => {
    if (selectedVideo !== video) {
      selectVideo(video);
      history.replaceState(null, '', watchUrl(video.id, listing, collection));
    }
    playSelected();
    if (frame.getBoundingClientRect().top < 0) frame.scrollIntoView({ block: 'start' });
  });
  item.append(button);
  return item;
}

function renderQueue(group, listing) {
  if (!group.videos.includes(selectedVideo)) selectVideo(group.videos[0]);
  queueTitle.textContent = group.name;
  queueCount.textContent = `${group.videos.length} 部`;
  queue.replaceChildren(...group.videos.map(video => queueItem(video, listing, group.key)));
  queue.scrollTop = 0;
  const current = queue.querySelector('[aria-current]');
  queue.scrollTop = current.getBoundingClientRect().top - queue.getBoundingClientRect().top;
}

async function renderPlayer() {
  const groups = await loadVideoGroups();
  const params = new URLSearchParams(location.search);
  const listing = readListing(groups, params);
  back.href = listingUrl(listing.category, listing.page);

  const all = { key: '', name: '全部视频', videos: groups.flatMap(group => group.videos) };
  const id = params.get('id');
  const video = all.videos.find(video => video.id === id);
  if (!video) {
    status.textContent = '未找到该视频。';
    return;
  }

  const collections = [all, ...groups.map(group => ({ ...group, key: group.name }))];
  const preferred = params.get('collection') ?? listing.category;
  const initialCollection = collections.find(group => group.key === preferred && group.videos.includes(video)) ?? all;

  for (const group of collections) {
    const button = createCategoryControl('button', group.name, group.videos.length);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(group === initialCollection));
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') === 'true') return;
      categories.querySelector('[aria-pressed="true"]').setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      renderQueue(group, listing);
      history.replaceState(null, '', watchUrl(selectedVideo.id, listing, group.key));
    });
    categories.append(button);
  }

  selectVideo(video);
  status.hidden = true;
  content.hidden = false;
  renderQueue(initialCollection, listing);
  playSelected();
}

renderPlayer().catch(() => {
  status.textContent = '视频加载失败，请刷新页面重试。';
});
