// "Pervane": Uğur Promilling görsel kılavuzundaki desen (Barmaksan'dan) — logodaki değirmen
// kanadının tek başına hâli: dış çerçeve, ortada direk, aralarında çıtalar. Renk currentColor.
// Süs değil marka dili: boş alanlarda büyük ve soluk, köşelerden taşarak kullanılır.
import { useId, type CSSProperties } from 'react';

export function Pervane({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 120 400" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="square">
        <rect x="14" y="14" width="92" height="372" strokeWidth="16" />
        <path d="M60 14V386" strokeWidth="10" />
        <path d="M14 88H106M14 162H106M14 236H106M14 310H106" strokeWidth="10" />
      </g>
    </svg>
  );
}

/** Desende tekrarlanan küçük kanat: 40×140, sol üst köşesi (x, y). */
function Sail({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="40" height="140" strokeWidth="5" />
      <path d="M20 0V140M0 28H40M0 56H40M0 84H40M0 112H40" strokeWidth="3.5" />
    </g>
  );
}

/** Tek kanat sütunu: karo başına bir kanat, karonun tam içinde. Karo sınırında kesilip komşu
 * karoda devam eden kanat olmadığı için ölçekli/döndürülmüş çizimde dikiş izi kalmaz. */
function Column({ id, scale, x, offset }: { id: string; scale: number; x: number; offset: number }) {
  return (
    <>
      <defs>
        <pattern id={id} y={offset} width="128" height="176" patternUnits="userSpaceOnUse" patternTransform={`rotate(-40) scale(${scale})`}>
          <g fill="none" stroke="currentColor" strokeLinecap="square">
            <Sail x={x} y={18} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </>
  );
}

/** Şaşırtmalı iki sütun: ikinci sütun yarım karo (88) aşağıda. */
function Tile({ id, scale, columns }: { id: string; scale: number; columns: 'both' | 'a' | 'b' }) {
  return (
    <>
      {columns !== 'b' && <Column id={`${id}a`} scale={scale} x={12} offset={0} />}
      {columns !== 'a' && <Column id={`${id}b`} scale={scale} x={76} offset={88} />}
    </>
  );
}

const TRAVEL = 36;
const ANGLE = (-40 * Math.PI) / 180;

/**
 * Pervane deseni: kanatlar çapraz, şaşırtmalı sıralar hâlinde. Hareketli hâlde komşu kanat
 * sütunları ters yönlerde gidip gelir (iki ayrı katman; yalnızca transform, boyama yok).
 */
export function PervanePattern({
  className,
  scale = 1,
  animated = false,
}: {
  className?: string;
  scale?: number;
  animated?: boolean;
}) {
  const id = `pervane-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!animated) {
    return (
      <svg className={className} aria-hidden="true" focusable="false">
        <Tile id={id} scale={scale} columns="both" />
      </svg>
    );
  }
  const travel = {
    ['--tx' as string]: `${(-TRAVEL * scale * Math.sin(ANGLE)).toFixed(2)}px`,
    ['--ty' as string]: `${(TRAVEL * scale * Math.cos(ANGLE)).toFixed(2)}px`,
    ['--bleed' as string]: `${Math.ceil(TRAVEL * scale * 1.2)}px`,
  } as CSSProperties;
  return (
    <span className={`pervane-layers ${className ?? ''}`} style={travel} aria-hidden="true">
      <svg className="pervane-layer pervane-forward" focusable="false">
        <Tile id={`${id}a`} scale={scale} columns="a" />
      </svg>
      <svg className="pervane-layer pervane-backward" focusable="false">
        <Tile id={`${id}b`} scale={scale} columns="b" />
      </svg>
    </span>
  );
}
