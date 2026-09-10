import { Env, json, readBody, validateSession } from './_lib';

// Helper to parse JSON safely
function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

// Helper to convert DB row to API format
function formatAdvertisement(row: any, centerIds: string[] = []): any {
  return {
    id: row.id,
    title: row.title,
    dateStart: Number(row.date_start),
    dateEnd: Number(row.date_end),
    location: row.location,
    imageUrls: parseJson(row.image_urls, []),
    linkUrl: row.link_url || '',
    priority: Number(row.priority),
    isActive: !!row.is_active,
    isPublished: !!row.is_published,
    centerIds,
    positions: parseJson(row.positions, [] as string[]),
    createdBy: row.created_by || '',
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

// Display formats (see migration 0031). Unknown ids are dropped, duplicates merged.
const AD_POSITION_IDS = new Set([
  'leaderboard_728x90',
  'medium_rectangle_300x250',
  'mobile_leaderboard_320x50',
  'skyscraper_160x600',
]);
function sanitizeAdPositions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(p => String(p)) : [];
  return Array.from(new Set(list.filter(p => AD_POSITION_IDS.has(p))));
}

// Landing-page ads target no center; center dashboard / both placements are
// scoped to the selected centers (at least one).
const CENTER_SCOPED_ADS_LOCATIONS = new Set(['center_admin', 'both']);
function adsRequireCenters(location: unknown): boolean {
  return CENTER_SCOPED_ADS_LOCATIONS.has(String(location || '').trim());
}

// GET /api/platform-advertisements - List all advertisements with center assignments
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'Accès refusé à la console plateforme.' }, 403);
    }

    // Fetch all advertisements with their assigned centers
    const { results } = await env.DB.prepare(`
      SELECT
        a.*,
        GROUP_CONCAT(ac.center_id) as center_ids
      FROM platform_advertisements a
      LEFT JOIN advertisement_centers ac ON a.id = ac.advertisement_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `).all<any>();

    const advertisements = (results || []).map(row => {
      const centerIds = row.center_ids ? String(row.center_ids).split(',') : [];
      return formatAdvertisement(row, centerIds);
    });

    return json({ advertisements });
  } catch (err) {
    console.error('Error fetching advertisements:', err);
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب الإعلانات.' }, 500);
  }
};

// POST /api/platform-advertisements - Create new advertisement
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'Accès refusé.' }, 403);
    }

    const body = await readBody(request);
    const title = String(body.title || '').trim();
    const dateStart = Number(body.dateStart);
    const dateEnd = Number(body.dateEnd);
    const location = String(body.location || '').trim();
    const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
    const linkUrl = String(body.linkUrl || '').trim();
    const priority = Number(body.priority) || 100;
    const isActive = body.isActive !== undefined ? !!body.isActive : true;
    const isPublished = body.isPublished !== undefined ? !!body.isPublished : false;
    const positions = sanitizeAdPositions(body.positions);
    let centerIds = Array.isArray(body.centerIds) ? body.centerIds : [];

    // Validation
    if (!title) {
      return json({ error: 'Le titre de l’annonce est requis.' }, 400);
    }
    if (!location) {
      return json({ error: 'L’emplacement de l’annonce est requis.' }, 400);
    }
    if (imageUrls.length === 0) {
      return json({ error: 'Ajoutez au moins une image.' }, 400);
    }
    // A landing-page ad belongs to no center — anything sent is ignored.
    if (location === 'landing_page') {
      centerIds = [];
    } else if (adsRequireCenters(location) && centerIds.length === 0) {
      return json({ error: 'Choisissez au moins un centre cible.' }, 400);
    }
    if (!dateStart || !dateEnd) {
      return json({ error: 'Dates de début et de fin requises.' }, 400);
    }
    if (dateEnd < dateStart) {
      return json({ error: 'La date de fin doit suivre la date de début.' }, 400);
    }

    const id = 'ADV_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
    const now = Date.now();

    // Prepare batch statements for atomic transaction
    const statements = [
      // Insert advertisement
      env.DB.prepare(`
        INSERT INTO platform_advertisements (
          id, title, date_start, date_end, location, image_urls,
          link_url, priority, is_active, is_published, positions,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, title, dateStart, dateEnd, location, JSON.stringify(imageUrls),
        linkUrl, priority, isActive ? 1 : 0, isPublished ? 1 : 0, JSON.stringify(positions),
        session.email, now, now
      ),
      // Insert center assignments
      ...centerIds.map((centerId: string) =>
        env.DB.prepare(
          'INSERT INTO advertisement_centers (advertisement_id, center_id) VALUES (?, ?)'
        ).bind(id, centerId)
      )
    ];

    await env.DB.batch(statements);

    return json({ success: true, id }, 201);
  } catch (err) {
    console.error('Error creating advertisement:', err);
    return json({ error: err instanceof Error ? err.message : 'خطأ في إنشاء الإعلان.' }, 500);
  }
};

// PATCH /api/platform-advertisements - Update advertisement
export const onRequestPatch: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'Accès refusé.' }, 403);
    }

    const body = await readBody(request);
    const id = String(body.id || '').trim();

    if (!id) {
      return json({ error: 'Identifiant d’annonce manquant.' }, 400);
    }

    // Check if advertisement exists
    const existing = await env.DB.prepare(
      'SELECT id, location FROM platform_advertisements WHERE id = ?'
    ).bind(id).first<any>();

    if (!existing) {
      return json({ error: 'Annonce introuvable.' }, 404);
    }

    const statements = [];

    // Build update query for advertisement
    const updates: string[] = [];
    const binds: any[] = [];

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return json({ error: 'Le titre de l’annonce est requis.' }, 400);
      }
      updates.push('title = ?');
      binds.push(title);
    }

    if (body.dateStart !== undefined) {
      updates.push('date_start = ?');
      binds.push(Number(body.dateStart));
    }

    if (body.dateEnd !== undefined) {
      updates.push('date_end = ?');
      binds.push(Number(body.dateEnd));
    }

    if (body.location !== undefined) {
      const location = String(body.location).trim();
      if (!location) {
        return json({ error: 'L’emplacement de l’annonce est requis.' }, 400);
      }
      updates.push('location = ?');
      binds.push(location);
    }

    if (body.imageUrls !== undefined) {
      const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
      if (imageUrls.length === 0) {
        return json({ error: 'Ajoutez au moins une image.' }, 400);
      }
      updates.push('image_urls = ?');
      binds.push(JSON.stringify(imageUrls));
    }

    if (body.linkUrl !== undefined) {
      updates.push('link_url = ?');
      binds.push(String(body.linkUrl).trim());
    }

    if (body.positions !== undefined) {
      updates.push('positions = ?');
      binds.push(JSON.stringify(sanitizeAdPositions(body.positions)));
    }
    if (body.priority !== undefined) {
      updates.push('priority = ?');
      binds.push(Number(body.priority));
    }

    if (body.isActive !== undefined) {
      updates.push('is_active = ?');
      binds.push(body.isActive ? 1 : 0);
    }

    if (body.isPublished !== undefined) {
      updates.push('is_published = ?');
      binds.push(body.isPublished ? 1 : 0);
    }

    // Always update updated_at
    updates.push('updated_at = ?');
    binds.push(Date.now());

    if (updates.length > 0) {
      binds.push(id);
      statements.push(
        env.DB.prepare(
          `UPDATE platform_advertisements SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...binds)
      );
    }

    // Update center assignments if provided
    if (body.centerIds !== undefined) {
      const centerIds = Array.isArray(body.centerIds) ? body.centerIds : [];
      const finalLocation = body.location !== undefined
        ? String(body.location).trim()
        : String(existing?.location || '');

      if (finalLocation === 'landing_page') {
        // Landing page ads are never center-scoped: drop the assignments.
        statements.push(
          env.DB.prepare('DELETE FROM advertisement_centers WHERE advertisement_id = ?').bind(id)
        );
      } else if (centerIds.length === 0) {
        if (adsRequireCenters(finalLocation)) {
          return json({ error: 'Choisissez au moins un centre cible.' }, 400);
        }
      } else {
        // Replace assignments
        statements.push(
          env.DB.prepare('DELETE FROM advertisement_centers WHERE advertisement_id = ?').bind(id)
        );
        centerIds.forEach((centerId: string) => {
          statements.push(
            env.DB.prepare(
              'INSERT INTO advertisement_centers (advertisement_id, center_id) VALUES (?, ?)'
            ).bind(id, centerId)
          );
        });
      }
    } else if (body.location !== undefined && String(body.location).trim() === 'landing_page') {
      // Switching an existing ad to the landing page clears its centers.
      statements.push(
        env.DB.prepare('DELETE FROM advertisement_centers WHERE advertisement_id = ?').bind(id)
      );
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Error updating advertisement:', err);
    return json({ error: err instanceof Error ? err.message : 'خطأ في تحديث الإعلان.' }, 500);
  }
};

// DELETE /api/platform-advertisements - Delete advertisement
export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'Accès refusé.' }, 403);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return json({ error: 'Identifiant d’annonce manquant.' }, 400);
    }

    // Delete advertisement (CASCADE will handle advertisement_centers)
    await env.DB.prepare('DELETE FROM platform_advertisements WHERE id = ?').bind(id).run();

    return json({ success: true });
  } catch (err) {
    console.error('Error deleting advertisement:', err);
    return json({ error: err instanceof Error ? err.message : 'خطأ في حذف الإعلان.' }, 500);
  }
};
