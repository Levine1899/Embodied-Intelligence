import { createCategoryControl, createVideoCover, listingUrl, loadVideoGroups, readListing, watchUrl } from './video-catalog.js';

const status = document.getElementById('catalog-status');
const content = document.getElementById('library-content');
const categories = document.getElementById('categories');
const grid = document.getElementById('video-grid');
const pagination = document.getElementById('pagination');

function categoryLink(name, count, category, active) {
  const link = createCategoryControl('a', name, count);
  link.href = listingUrl(category);
  if (active) link.setAttribute('aria-current', 'page');
  return link;
}

function videoCard(video, listing) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'video-card';
  link.href = watchUrl(video.id, listing);
  link.setAttribute('aria-label', video.title);

  const caption = document.createElement('div');
  caption.className = 'video-card-caption';
  const title = document.createElement('h2');
  title.textContent = video.title;
  caption.append(title);
  if (!listing.category) {
    const category = document.createElement('span');
    category.textContent = video.category;
    caption.append(category);
  }
  link.append(createVideoCover(video), caption);
  item.append(link);
  return item;
}

function pageLink(label, page, listing) {
  const inRange = page >= 1 && page <= listing.pageCount;
  const link = document.createElement(inRange ? 'a' : 'span');
  link.textContent = label;
  if (inRange) link.href = listingUrl(listing.category, page);
  else link.setAttribute('aria-disabled', 'true');
  return link;
}

function renderPagination(listing) {
  if (listing.pageCount <= 1) return;
  pagination.append(pageLink('上一页', listing.page - 1, listing));
  for (let page = 1; page <= listing.pageCount; page++) {
    const link = pageLink(String(page), page, listing);
    link.setAttribute('aria-label', `第 ${page} 页`);
    if (page === listing.page) link.setAttribute('aria-current', 'page');
    pagination.append(link);
  }
  pagination.append(pageLink('下一页', listing.page + 1, listing));
  pagination.hidden = false;
}

async function renderLibrary() {
  const groups = await loadVideoGroups();
  if (!groups.length) {
    status.textContent = '暂无科普视频。';
    return;
  }

  const listing = readListing(groups, new URLSearchParams(location.search));
  const total = groups.reduce((count, group) => count + group.videos.length, 0);
  categories.append(categoryLink('全部视频', total, '', !listing.category));
  for (const group of groups) {
    categories.append(categoryLink(group.name, group.videos.length, group.name, group.name === listing.category));
  }
  grid.append(...listing.videos.map(video => videoCard(video, listing)));
  renderPagination(listing);
  status.hidden = true;
  content.hidden = false;
}

renderLibrary().catch(() => {
  status.textContent = '视频目录加载失败，请刷新页面重试。';
});
