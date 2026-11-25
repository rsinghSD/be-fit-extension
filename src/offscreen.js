/* global ext, playSound */
ext.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== "offscreen" || msg.type !== "play-sound") return false;
  playSound(msg.kind, msg.volume, msg.customUrl).catch(() => {});
  return false;
});
