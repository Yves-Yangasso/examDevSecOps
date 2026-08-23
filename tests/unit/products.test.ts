import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProducts } from '@/api/products';

function mockJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('fetchProducts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockJson([]));
  });

  it('écarte les entrées malformées au lieu de planter', async () => {
    vi.stubGlobal(
      'fetch',
      mockJson([
        {
          id: 1,
          title: 'Valide',
          price: 9.99,
          description: 'd',
          category: 'c',
          image: 'https://x/y.png',
        },
        { id: 'pas-un-nombre', title: 'Invalide' },
        null,
        'chaîne',
      ]),
    );
    const products = await fetchProducts();
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe('Valide');
  });

  it('neutralise une URL dimage non http(s) (protection javascript:)', async () => {
    vi.stubGlobal(
      'fetch',
      // eslint-disable-next-line no-script-url
      mockJson([{ id: 1, title: 'Piégé', image: 'javascript:alert(1)' }]),
    );
    const products = await fetchProducts();
    expect(products[0]?.image).toBe('');
  });

  it('applique des valeurs par défaut aux champs manquants', async () => {
    vi.stubGlobal('fetch', mockJson([{ id: 7, title: 'Minimal' }]));
    const [product] = await fetchProducts();
    expect(product).toMatchObject({ price: 0, description: '', category: 'divers' });
  });

  it('propage une ApiError sur réponse HTTP en erreur', async () => {
    vi.stubGlobal('fetch', mockJson({}, 500));
    await expect(fetchProducts()).rejects.toThrow(/HTTP 500/);
  });
});
