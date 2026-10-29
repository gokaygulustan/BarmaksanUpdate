import type { Metadata } from 'next';

/** Kök `title.template` ile: "Konu // Uğur Promilling - Tedarik Portalı" */
export function tabMeta(topic: string): Metadata {
  return { title: topic };
}
