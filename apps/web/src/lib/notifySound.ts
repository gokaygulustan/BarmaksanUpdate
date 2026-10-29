let audioCtx: AudioContext | null = null;

function context() {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

export function unlockNotifyAudio() {
  const ctx = context();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

/** Kısa iki tonlu bildirim; mesaj içeriği taşımaz. */
export function playNotifyChime() {
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  const tones = [784, 1046];
  tones.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  });
}
