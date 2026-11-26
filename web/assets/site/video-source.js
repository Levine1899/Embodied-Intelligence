// 部署了独立视频服务后填入其 Origin，例如 https://media.example.com。
// 留空时从当前站点获取视频。
const videoOrigin = '';

export function videoUrl(id) {
  const path = `assets/videos/${encodeURIComponent(id)}.mp4`;
  return videoOrigin ? new URL(`/${path}`, videoOrigin).href : path;
}
