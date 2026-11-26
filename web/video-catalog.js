const pageSize = 12;

function listingRank(video) {
  // 用 UUID 的随机部分打散时长接近的视频，翻页和刷新时顺序仍然一致。
  const shuffle = (Number.parseInt(video.id.slice(0, 8), 16) || 0) / 0x100000000;
  return video.duration * (1 + 0.5 * shuffle);
}

export async function loadVideoGroups() {
  const response = await fetch('video-catalog.json');
  if (!response.ok) throw new Error('Could not load the video catalog');
  const catalog = await response.json();
  return catalog.filter(group => group.videos.length).map(group => ({
    name: group.name,
    videos: group.videos.map(video => ({ ...video, category: group.name }))
  }));
}

export function readListing(groups, params) {
  const group = groups.find(group => group.name === params.get('category'));
  const videos = group ? group.videos : groups.flatMap(group => group.videos);
  const pageCount = Math.max(1, Math.ceil(videos.length / pageSize));
  const requested = Number(params.get('page'));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pageCount) : 1;
  const orderedVideos = [...videos].sort((left, right) => listingRank(left) - listingRank(right));
  return {
    category: group?.name ?? '',
    page,
    pageCount,
    videos: orderedVideos.slice((page - 1) * pageSize, page * pageSize)
  };
}

function listingParams(category, page) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (page > 1) params.set('page', page);
  return params;
}

export function listingUrl(category = '', page = 1) {
  const query = listingParams(category, page).toString();
  return query ? `videos.html?${query}` : 'videos.html';
}

export function watchUrl(id, listing, collection = listing.category) {
  const params = listingParams(listing.category, listing.page);
  params.set('id', id);
  if (collection !== listing.category) params.set('collection', collection);
  return `video.html?${params}`;
}

export function createCategoryControl(tag, name, count) {
  const control = document.createElement(tag);
  control.className = 'category-button';
  const total = document.createElement('span');
  total.className = 'category-count';
  total.textContent = count;
  control.append(name, total);
  return control;
}

export function posterUrl(video) {
  return `assets/videos/posters/${video.id}.webp`;
}

export function durationLabel(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  if (minutes < 60) return `${String(minutes).padStart(2, '0')}:${remainder}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}`;
}

export function createVideoCover(video) {
  const cover = document.createElement('span');
  cover.className = 'video-cover';
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => { image.hidden = true; });
  image.src = posterUrl(video);
  const length = document.createElement('span');
  length.className = 'cover-duration';
  length.textContent = durationLabel(video.duration);
  cover.append(image, length);
  return cover;
}
