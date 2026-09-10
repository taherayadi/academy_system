import { Env, json } from '../_lib';

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
      return json({ error: 'موقع الإعلان مطلوب.' }, 400);
    }

    const now = Date.now();

    let query: string;
    let binds: any[];

    if (centerId) {
      // Fetch ads for specific center
      query = `
        SELECT DISTINCT
          a.id, a.title, a.date_start, a.date_end, a.location,
          a.image_urls, a.link_url, a.priority
        FROM platform_advertisements a
        INNER JOIN advertisement_centers ac ON a.id = ac.advertisement_id
        WHERE a.location = ?
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
          a.image_urls, a.link_url, a.priority
        FROM platform_advertisements a
        WHERE a.location = ?
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
      priority: Number(row.priority)
    }));

    return json({ advertisements });
  } catch (err) {
    console.error('Error fetching active advertisements:', err);
    return json({ error: 'خطأ في جلب الإعلانات.' }, 500);
  }
};
