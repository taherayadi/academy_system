import { Env, json, readBody, validateSession, sha256Hex, DEFAULT_CENTER_ID } from './_lib';

const DEFAULT_ACADEMIC_YEARS = [
  '2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'
];

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session) {
      return json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' }, 401);
    }

    const isPlatformAdmin = session.role === 'super_admin' || session.role === 'platform_super_admin';

    if (isPlatformAdmin) {
      const { results } = await env.DB.prepare(`
        SELECT 
          c.id, c.name, c.slug, c.phone_number, c.location_city, c.plan, 
          c.enabled_modules, c.meal_operating_mode, c.status, 
          c.trial_ends_at, c.subscription_ends_at, c.created_at,
          (SELECT COUNT(*) FROM students s WHERE s.center_id = c.id) as student_count,
          (SELECT email FROM users u WHERE u.center_id = c.id AND u.role IN ('admin', 'super_admin') LIMIT 1) as admin_email
        FROM centers c
        ORDER BY c.created_at DESC
      `).all<any>();

      const formatted = (results || []).map(c => {
        let modules: string[] = [];
        try {
          modules = typeof c.enabled_modules === 'string' ? JSON.parse(c.enabled_modules) : (c.enabled_modules || []);
        } catch {
          modules = [];
        }
        return {
          id: c.id,
          name: c.name,
          slug: c.slug || '',
          phoneNumber: c.phone_number || '',
          locationCity: c.location_city || '',
          plan: c.plan || 'starter',
          enabledModules: modules,
          mealOperatingMode: c.meal_operating_mode || 'external_traiteur',
          status: c.status || 'active',
          trialEndsAt: c.trial_ends_at || null,
          subscriptionEndsAt: c.subscription_ends_at || null,
          createdAt: c.created_at || Date.now(),
          studentCount: Number(c.student_count) || 0,
          adminEmail: c.admin_email || ''
        };
      });

      return json({ centers: formatted });
    } else {
      const centerId = session.centerId || DEFAULT_CENTER_ID;
      const center = await env.DB.prepare('SELECT * FROM centers WHERE id = ?').bind(centerId).first<any>();
      if (!center) return json({ error: 'المركز غير موجود.' }, 404);

      let modules: string[] = [];
      try {
        modules = typeof center.enabled_modules === 'string' ? JSON.parse(center.enabled_modules) : (center.enabled_modules || []);
      } catch {
        modules = [];
      }

      return json({
        centers: [{
          id: center.id,
          name: center.name,
          slug: center.slug || '',
          phoneNumber: center.phone_number || '',
          locationCity: center.location_city || '',
          plan: center.plan || 'starter',
          enabledModules: modules,
          mealOperatingMode: center.meal_operating_mode || 'external_traiteur',
          status: center.status || 'active',
          trialEndsAt: center.trial_ends_at || null,
          subscriptionEndsAt: center.subscription_ends_at || null,
          createdAt: center.created_at || Date.now()
        }]
      });
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب بيانات المراكز.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح لك بإنشاء مراكز جديدة.' }, 403);
    }

    const body = await readBody(request);
    const name = String(body.name || '').trim();
    const slug = String(body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || '').trim();
    const phoneNumber = String(body.phoneNumber || body.phone || '').trim();
    const locationCity = String(body.locationCity || body.city || 'تونس').trim();
    const plan = String(body.plan || 'trial').trim();
    const status = String(body.status || (plan === 'trial' ? 'trial' : 'active')).trim();
    const mealOperatingMode = String(body.mealOperatingMode || 'external_traiteur').trim();
    const trialDays = Number(body.trialDays) || 14;
    const adminName = String(body.adminName || `مدير ${name}`).trim();
    const adminEmail = String(body.adminEmail || '').trim().toLowerCase();
    const adminPassword = String(body.adminPassword || '').trim();
    const demoRequestId = body.demoRequestId ? String(body.demoRequestId).trim() : null;

    if (!name) return json({ error: 'اسم المركز مطلوب.' }, 400);
    if (!adminEmail || !adminPassword) {
      return json({ error: 'البريد الإلكتروني وكلمة السر لحساب مدير المركز مطلوبان.' }, 400);
    }

    const existingUser = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(adminEmail).first();
    if (existingUser) {
      return json({ error: 'البريد الإلكتروني مسجل مسبقاً لمستخدم آخر.' }, 400);
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const trialEndsAt = (status === 'trial' || plan === 'trial') ? (createdAt + trialDays * 86400000) : null;

    const defaultModules = [
      'scolaire', 'finance', 'etude', 'coursParticuliers', 'revision', 
      'formations', 'cantine', 'transport', 'events', 'bibliotheque', 
      'studentTimeSheets', 'staff'
    ];
    const enabledModules = Array.isArray(body.enabledModules) ? body.enabledModules : defaultModules;
    const modulesJson = JSON.stringify(enabledModules);

    const passwordHash = await sha256Hex(adminPassword);

    const stmts: D1PreparedStatement[] = [];

    // 1. Center
    stmts.push(env.DB.prepare(`
      INSERT INTO centers (
        id, name, slug, phone_number, location_city, plan, enabled_modules, 
        meal_operating_mode, status, trial_ends_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name, slug, phoneNumber, locationCity, plan, modulesJson, 
      mealOperatingMode, status, trialEndsAt, createdAt
    ));

    // 2. Center Settings
    stmts.push(env.DB.prepare(`
      INSERT INTO center_settings (
        center_id, center_name, phone_number, location_city, meal_operating_mode
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(id, name, phoneNumber, locationCity, mealOperatingMode));

    // 3. Fee Sets
    for (const yr of DEFAULT_ACADEMIC_YEARS) {
      stmts.push(env.DB.prepare(`
        INSERT INTO center_fee_sets (
          center_id, year, frais_annuel_suivi, frais_mensuel_suivi, 
          frais_annuel_bibliotheque, frais_mensuel_bibliotheque, 
          frais_abonnement_repas, frais_par_repas, frais_abonnement_repas_traiteur,
          frais_annuel_etude, frais_mensuel_etude, frais_assurance_cours_externes,
          frais_gouter_matin_mensuel, frais_gouter_matin_unitaire,
          frais_gouter_soir_mensuel, frais_gouter_soir_unitaire, frais_deux_gouters_mensuel
        ) VALUES (?, ?, 50, 40, 30, 20, 150, 8, 6, 60, 50, 25, 30, 2.5, 30, 2.5, 50)
      `).bind(id, yr));
    }

    // 4. Admin User
    stmts.push(env.DB.prepare(`
      INSERT INTO users (
        email, name, role, description, password_hash, center_id
      ) VALUES (?, ?, 'admin', 'مدير المركز', ?, ?)
    `).bind(adminEmail, adminName, passwordHash, id));

    // 5. Update demo request if converted
    if (demoRequestId) {
      stmts.push(env.DB.prepare(`
        UPDATE demo_requests SET status = 'converted', notes = ? WHERE id = ?
      `).bind(`تم تحويل الطلب إلى مركز (${name}) بنجاح بتاريخ ${new Date().toLocaleDateString('fr-FR')}`, demoRequestId));
    }

    await env.DB.batch(stmts);

    return json({ 
      success: true, 
      centerId: id, 
      message: `تم إنشاء مركز (${name}) وتعيين حساب المدير (${adminEmail}) بنجاح!` 
    }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في إنشاء المركز.' }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = await readBody(request);
    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'معرف المركز مطلوب.' }, 400);

    const updates: string[] = [];
    const binds: any[] = [];

    if (body.name !== undefined) { updates.push('name = ?'); binds.push(String(body.name).trim()); }
    if (body.phoneNumber !== undefined) { updates.push('phone_number = ?'); binds.push(String(body.phoneNumber).trim()); }
    if (body.locationCity !== undefined) { updates.push('location_city = ?'); binds.push(String(body.locationCity).trim()); }
    if (body.plan !== undefined) { updates.push('plan = ?'); binds.push(String(body.plan).trim()); }
    if (body.status !== undefined) { updates.push('status = ?'); binds.push(String(body.status).trim()); }
    if (body.mealOperatingMode !== undefined) { updates.push('meal_operating_mode = ?'); binds.push(String(body.mealOperatingMode).trim()); }
    if (body.enabledModules !== undefined) {
      updates.push('enabled_modules = ?');
      binds.push(Array.isArray(body.enabledModules) ? JSON.stringify(body.enabledModules) : String(body.enabledModules));
    }
    if (body.trialEndsAt !== undefined) { updates.push('trial_ends_at = ?'); binds.push(body.trialEndsAt ? Number(body.trialEndsAt) : null); }
    if (body.subscriptionEndsAt !== undefined) { updates.push('subscription_ends_at = ?'); binds.push(body.subscriptionEndsAt ? Number(body.subscriptionEndsAt) : null); }

    if (updates.length > 0) {
      binds.push(id);
      await env.DB.prepare(`UPDATE centers SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    }

    // Also update admin password if requested
    if (body.newAdminPassword && body.adminEmail) {
      const newHash = await sha256Hex(String(body.newAdminPassword).trim());
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ? AND center_id = ?')
        .bind(newHash, String(body.adminEmail).trim().toLowerCase(), id).run();
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تحديث المركز.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'معرف المركز مطلوب.' }, 400);

    if (id === DEFAULT_CENTER_ID) {
      return json({ error: 'لا يمكن حذف المركز الرئيسي الافتراضي للنظام.' }, 400);
    }

    await env.DB.prepare('DELETE FROM centers WHERE id = ?').bind(id).run();
    return json({ success: true, message: 'تم حذف المركز بنجاح.' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في حذف المركز.' }, 500);
  }
};
