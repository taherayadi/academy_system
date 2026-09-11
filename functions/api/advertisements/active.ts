import { Env, json } from '../_lib';

// Migration 0031 resilience: without the positions column the query skips
// it (ads still render; every ad then behaves as a standard-placement ad).
async function hasAdPositionsColumn(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT positions FROM platform_advertisements LIMIT 1').first();
    return true;
  } catch {
    return false;
  }
}

// Helper to parse JSON safely
function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

// GET /api/advertisements/active - Public endpoint for fetching active ads
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const url = new URL(request.url);
    const location = url.searchParams.get('location');
    const centerId = url.searchParams.get('centerId');

    if (!location) {
      return json({ error: 'Emplacement d’annonce requis.' }, 400);
    }

    // Ads placed on « both » are visible on the two known surfaces: the
    // public landing page and the center dashboards.
    const isPlatformSurface = location === 'landing_page' || location === 'center_admin';
    const locationCond = isPlatformSurface ? `(a.location = ? OR a.location = 'both')` : 'a.location = ?';

    if (location === 'center_admin' && !centerId) {
      // Center-scoped placements need a center context to be resolved.
      return json({ advertisements: [] });
    }

    const now = Date.now();
    const hasPositionsCol = await hasAdPositionsColumn(env.DB);
    const positionsCol = hasPositionsCol ? ', a.positions' : '';

    let query: string;
    let binds: any[];

    if (centerId) {
      // Fetch ads for specific center
      query = `
        SELECT DISTINCT
          a.id, a.title, a.date_start, a.date_end, a.location,
          a.image_urls, a.link_url, a.priority${positionsCol}
        FROM platform_advertisements a
        INNER JOIN advertisement_centers ac ON a.id = ac.advertisement_id
        WHERE ${locationCond}
          AND ac.center_id = ?
          AND a.is_active = 1
          AND a.is_published = 1
          AND a.date_start <= ?
          AND a.date_end >= ?
        ORDER BY a.priority ASC, a.created_at DESC
      `;
      binds = [location, centerId, now, now];
    } else {
      // Fetch ads for public landing page (no center restriction)
      query = `
        SELECT
          a.id, a.title, a.date_start, a.date_end, a.location,
          a.image_urls, a.link_url, a.priority${positionsCol}
        FROM platform_advertisements a
        WHERE ${locationCond}
          AND a.is_active = 1
          AND a.is_published = 1
          AND a.date_start <= ?
          AND a.date_end >= ?
        ORDER BY a.priority ASC, a.created_at DESC
      `;
      binds = [location, now, now];
    }

    const { results } = await env.DB.prepare(query).bind(...binds).all<any>();

    const advertisements = (results || []).map(row => ({
      id: row.id,
      title: row.title,
      dateStart: Number(row.date_start),
      dateEnd: Number(row.date_end),
      location: row.location,
      imageUrls: parseJson(row.image_urls, []),
      linkUrl: row.link_url || '',
      priority: Number(row.priority),
      positions: parseJson(row.positions ?? '[]', [] as string[])
    }));

    return json({ advertisements });
  } catch (err) {
    console.error('Error fetching active advertisements:', err);
    return json({ error: 'Erreur lors du chargement des annonces.' }, 500);
  }
};
