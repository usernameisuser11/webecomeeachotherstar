// Reuse the original Gongang 2D lookout painting, with a responsive composition.
export async function loadOverlook(wide: boolean, signal: AbortSignal) {
  const response = await fetch(wide ? "/overlook-art-wide.b64" : "/overlook-art.b64", { signal });
  if (!response.ok) throw new Error("Overlook artwork unavailable");
  const data = (await response.text()).trim();
  if (!data.startsWith("UklGR")) throw new Error("Invalid WebP artwork");
  const image = new Image();
  image.src = "data:image/webp;base64," + data;
  await image.decode();
  return image;
}
export function paintOverlook(ctx: CanvasRenderingContext2D, image: HTMLImageElement, w: number, h: number) {
  const iw = image.naturalWidth, ih = image.naturalHeight;
  // A portrait viewport keeps the center of the galactic arc and the meadow.
  // The upper part gets more room so the original normalized star positions remain usable.
  const crop = Math.min(iw, Math.max(iw * .30, ih * w / h * 1.28));
  const sx = Math.max(0, Math.min(iw - crop, iw * .56 - crop * .5));
  const horizon = ih * .53;
  const skyHeight = h * (w < h ? .70 : .66);
  ctx.drawImage(image, sx, 0, crop, horizon, 0, 0, w, skyHeight);
  ctx.drawImage(image, sx, horizon, crop, ih - horizon, 0, skyHeight, w, h - skyHeight);
  const shade = ctx.createLinearGradient(0,0,0,h);
  shade.addColorStop(0,"rgba(3,8,20,.29)");
  shade.addColorStop(.35,"rgba(3,8,20,.13)");
  shade.addColorStop(.67,"rgba(3,8,20,.02)");
  shade.addColorStop(1,"rgba(3,8,20,.28)");
  ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
}
