// Dört pervane kanadı bir göbek çevresinde: Uğur Promilling değirmeni. Renk currentColor.
// Boş alanda büyük ve soluk durur; kanatlar çok yavaş döner (hareket azaltılınca durur).
import { cn } from '@/lib/utils';

const SAIL = (
  <g fill="none" stroke="currentColor" strokeLinecap="square">
    <rect x="14" y="14" width="92" height="372" strokeWidth="14" />
    <path d="M60 14V386" strokeWidth="9" />
    <path d="M14 88H106M14 162H106M14 236H106M14 310H106" strokeWidth="9" />
  </g>
);

// Dönüş SVG'nin içindeki gruba değil svg öğesinin kendisine verilir: SVG içi dönüş tarayıcıda her
// karede yeniden çizim demek (dizüstünde sürekli işlemci yükü); svg kutusunun dönüşü bileşik
// katmanda, çizimsiz akar. Değirmen tam ortada olduğu için görünüş aynı.
export function Windmill({ className, spinning = true }: { className?: string; spinning?: boolean }) {
  return (
    <svg
      className={cn(spinning && 'windmill-spin', className)}
      viewBox="0 0 1000 1000"
      aria-hidden="true"
      focusable="false"
    >
      <g>
        {[0, 90, 180, 270].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 500 500)`}>
            <path d="M500 500V40" stroke="currentColor" strokeWidth="12" strokeLinecap="square" />
            <g transform="translate(506 40) scale(1 1.05)">{SAIL}</g>
          </g>
        ))}
        <circle cx="500" cy="500" r="34" fill="none" stroke="currentColor" strokeWidth="12" />
      </g>
    </svg>
  );
}
