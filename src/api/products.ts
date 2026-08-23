import { request } from './client';

export interface Product {
  id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating?: { rate: number; count: number };
}

/**
 * Normalisation défensive : on ne fait jamais confiance à la forme d'une réponse
 * d'API tierce. Un champ manquant ne doit pas faire planter le rendu.
 */
function normalize(raw: unknown): Product | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'number' || typeof p.title !== 'string') return null;
  return {
    id: p.id,
    title: p.title,
    price: typeof p.price === 'number' ? p.price : 0,
    description: typeof p.description === 'string' ? p.description : '',
    category: typeof p.category === 'string' ? p.category : 'divers',
    image: typeof p.image === 'string' && /^https?:\/\//.test(p.image) ? p.image : '',
    rating:
      typeof p.rating === 'object' && p.rating !== null
        ? (p.rating as Product['rating'])
        : undefined,
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const raw = await request<unknown[]>('/products');
  return Array.isArray(raw) ? raw.map(normalize).filter((p): p is Product => p !== null) : [];
}

export async function fetchCategories(): Promise<string[]> {
  const raw = await request<unknown[]>('/products/categories');
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : [];
}
