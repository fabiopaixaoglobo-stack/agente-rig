export function openInWaze(lat, lng) {
  const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  window.open(url, "_blank", "noopener,noreferrer");
}
