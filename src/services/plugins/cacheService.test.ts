import { beforeEach, describe, expect, it } from 'vitest';

import { fetchPluginsFromCache, resetPluginsCache, savePluginsToCache, shouldCachePlugin } from './cacheService';

describe('plugins cacheService', () => {
  beforeEach(() => {
    resetPluginsCache();
  });

  it('saves and retrieves plugins with a cache key', () => {
    const cacheKey = 'plugins?page=1';
    const plugins = [
      { id: '1', favoritesCount: 0 },
      { id: '2', favoritesCount: 3 },
    ] as any;

    expect(fetchPluginsFromCache(cacheKey)).toBeUndefined();

    savePluginsToCache(cacheKey, plugins);

    expect(fetchPluginsFromCache(cacheKey)).toEqual(plugins);
  });

  it('clears cached plugins via reset', () => {
    const cacheKey = 'plugins?page=2';
    savePluginsToCache(cacheKey, [{ id: '10' }] as any);

    resetPluginsCache();

    expect(fetchPluginsFromCache(cacheKey)).toBeUndefined();
  });

  it('avoids caching when sorted by favorites count', () => {
    expect(shouldCachePlugin('/api/plugins', 'favoritesCount')).toBe(false);
    expect(shouldCachePlugin('/api/plugins', 'updatedAt')).toBe(true);
    expect(shouldCachePlugin('/api/plugins')).toBe(true);
  });
});
