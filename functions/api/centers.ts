import { Env, json, readBody, validateSession, sha256Hex, DEFAULT_CENTER_ID, getCenterAccessState } from './_lib';

const DEFAULT_ACADEMIC_YEARS = [
  '2022/2023', '2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'
];
const BUNDLED_MODULE_KEY = 'studentTimeSheets';
const REQUIRED_MODULE_KEYS = ['scolaire', 'finance', BUNDLED_MODULE_KEY];
const ALL_MODULE_KEYS = [
  'scolaire', 'finance', 'etude', 'coursParticuliers', 'revision',
  'formations', 'cantine', 'transport', 'events', 'bibliotheque',
  BUNDLED_MODULE_KEY, 'staff'
];
const ANNUAL_DISCOUNT = 0.2;
const AUTO_PRICED_PLANS = new Set(['starter', 'growth', 'pro']);

function normalizeEnabledModules(value: unknown, plan?: string): string[] {
  const requested = Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : [];
  const modules = plan === 'pro' ? ALL_MODULE_KEYS : requested;
  return Array.from(new Set([...REQUIRED_MODULE_KEYS, ...modules]));
}

function currentSchoolYear(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const schoolStartYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${schoolStartYear}/${schoolStartYear + 1}`;
}

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
          c.trial_ends_at, c.subscription_ends_at, c.billing_cycle, c.monthly_price,
          c.center_type, c.logo_url, c.created_at,
          (SELECT COUNT(*) FROM students s WHERE s.center_id = c.id) as student_count,
          (SELECT email FROM users u WHERE u.center_id = c.id AND u.role IN ('admin', 'super_admin') LIMIT 1) as admin_email
        FROM centers c
        ORDER BY c.created_at DESC
      `).all<any>();

      // Older centers may predate the billing columns being populated. Compute
      // their current subscription total from the enabled modules so the edit
      // form does not show a misleading zero for an active paid center.
      const { results: priceRows } = await env.DB.prepare(
        'SELECT module_key, price FROM module_prices WHERE school_year = ?'
      ).bind(currentSchoolYear()).all<any>();
      const modulePrices = new Map<string, number>((priceRows || []).map(row => [row.module_key, Number(row.price) || 0]));

      // Keep lifecycle status in sync for centers whose trial or paid period
      // elapsed without a login attempt. This also makes the admin card badge
      // and the login gate agree on the same state.
      const expiredUpdates = (results || [])
        .filter(c => {
          const state = getCenterAccessState(c);
          return (state === 'trial_expired' || state === 'subscription_expired') && c.status !== 'expired';
        })
        .map(c => env.DB.prepare('UPDATE centers SET status = ? WHERE id = ?').bind('expired', c.id));
      if (expiredUpdates.length > 0) await env.DB.batch(expiredUpdates);

      const formatted = (results || []).map(c => {
        let modules: string[] = [];
        try {
          modules = typeof c.enabled_modules === 'string' ? JSON.parse(c.enabled_modules) : (c.enabled_modules || []);
        } catch {
          modules = [];
        }
        const storedMonthlyPrice = c.monthly_price === null || c.monthly_price === undefined
          ? 0
          : Number(c.monthly_price) || 0;
        const calculatedMonthlyPrice = modules.reduce(
          (total, moduleKey) => total + (moduleKey === BUNDLED_MODULE_KEY ? 0 : (modulePrices.get(moduleKey) || 0)),
          0
        );
        const storedStatus = c.status || 'active';
        const accessState = getCenterAccessState(c);
        const status = accessState === 'trial_expired' || accessState === 'subscription_expired'
          ? 'expired'
          : storedStatus;
        const billingCycle = c.billing_cycle || 'monthly';
        const monthlyPrice = storedMonthlyPrice > 0 || storedStatus === 'trial' || !AUTO_PRICED_PLANS.has(c.plan || 'starter')
          ? storedMonthlyPrice
          : calculatedMonthlyPrice * (billingCycle === 'annual' ? 12 * (1 - ANNUAL_DISCOUNT) : 1);

        return {
          id: c.id,
          name: c.name,
          slug: c.slug || '',
          phoneNumber: c.phone_number || '',
          locationCity: c.location_city || '',
          plan: c.plan || 'starter',
          enabledModules: modules,
          mealOperatingMode: c.meal_operating_mode || 'external_traiteur',
          status,
          trialEndsAt: c.trial_ends_at || null,
          subscriptionEndsAt: c.subscription_ends_at || null,
          billingCycle,
          monthlyPrice,
          centerType: c.center_type || '',
          logoUrl: c.logo_url || '',
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
          billingCycle: center.billing_cycle || 'monthly',
          monthlyPrice: center.monthly_price !== null ? Number(center.monthly_price) : 0,
          centerType: center.center_type || '',
          logoUrl: center.logo_url || '',
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
    if (!/^[0-9]{8}$/.test(phoneNumber)) {
      return json({ error: 'رقم الهاتف مطلوب ويجب أن يتكون من 8 أرقام.' }, 400);
    }
    const locationCity = String(body.locationCity || body.city || 'تونس').trim();
    // "trial" is not a valid `plan` value (CHECK constraint only allows starter/growth/pro/custom),
    // so a trial center is stored as plan='starter' with status='trial'.
    // Basic is stored as 'starter' because the DB CHECK constraint does not include 'basic'.
    // Growth, Pro, and Custom retain their storage values.
    const rawPlan = String(body.plan || 'trial').trim();
    const requestedStatus = String(body.status || '').trim();
    const isTrial = rawPlan === 'trial' || requestedStatus === 'trial';
    const normalizedPlan = rawPlan === 'basic' ? 'starter' : rawPlan; // basic → starter (storage)
    const plan = isTrial ? 'starter' : (normalizedPlan === '' ? 'starter' : normalizedPlan);
    const isCustomPlan = plan === 'custom';
    const autoPrice = !isTrial && AUTO_PRICED_PLANS.has(plan);
    const status = requestedStatus || (isTrial ? 'trial' : 'active');
    const mealOperatingMode = String(body.mealOperatingMode || 'external_traiteur').trim();
    const trialDays = Number(body.trialDays) || 14;
    const adminName = String(body.adminName || `مدير ${name}`).trim();
    const adminEmail = String(body.adminEmail || '').trim().toLowerCase();
    const adminPassword = String(body.adminPassword || '').trim();
    const demoRequestId = body.demoRequestId
      ? String(body.demoRequestId).trim()
      : (body.convertFromRequestId ? String(body.convertFromRequestId).trim() : null);

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
    const trialEndsAt = isTrial ? (createdAt + trialDays * 86400000) : null;

    const billingCycle = isTrial ? 'monthly' : (String(body.billingCycle || 'monthly').trim() === 'annual' ? 'annual' : 'monthly');

    // Pro starts with the complete catalogue selected; the backend enforces
    // this preset even when a caller does not send the module list.
    const enabledModules = normalizeEnabledModules(body.enabledModules, plan);
    const modulesJson = JSON.stringify(enabledModules);

    // Compute the automatic tariff from module_prices for the current school year
    const billingMonth = new Date(createdAt).getMonth(); // 0-indexed
    const billingYear = new Date(createdAt).getFullYear();
    // School year: months Sep (8) – Jul (6) → start year; Aug (7) + first days Sep → same academic year as start
    const schoolStartYear = billingMonth >= 8 ? billingYear : billingYear - 1;
    const currentSchoolYear = `${schoolStartYear}/${schoolStartYear + 1}`;

    let monthlyPrice = isCustomPlan ? (Number(body.monthlyPrice) || 0) : 0;
    if (autoPrice) {
      const placeholders = enabledModules.map(() => '?').join(',');
      const { results: priceRows } = await env.DB.prepare(
        `SELECT module_key, price FROM module_prices WHERE school_year = ? AND module_key IN (${placeholders})`
      ).bind(currentSchoolYear, ...enabledModules).all<any>();
      monthlyPrice = priceRows.reduce(
        (sum, r) => sum + (r.module_key === BUNDLED_MODULE_KEY ? 0 : (Number(r.price) || 0)),
        0
      );
      if (billingCycle === 'annual') {
        monthlyPrice = monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT);
      }
    }

    // subscription_ends_at: 30 days for monthly, 365 days for annual.
    let subscriptionEndsAt = null;
    if (!isTrial) {
      const periodMs = billingCycle === 'annual' ? 365 * 86400000 : 30 * 86400000;
      subscriptionEndsAt = createdAt + periodMs;
    }

    const passwordHash = await sha256Hex(adminPassword);

    const stmts: D1PreparedStatement[] = [];

    // 1. Center
    stmts.push(env.DB.prepare(`
      INSERT INTO centers (
        id, name, slug, phone_number, location_city, plan, enabled_modules,
        meal_operating_mode, status, trial_ends_at, subscription_ends_at, billing_cycle, monthly_price, center_type, logo_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name, slug, phoneNumber, locationCity, plan, modulesJson,
      mealOperatingMode, status, trialEndsAt, subscriptionEndsAt, billingCycle, monthlyPrice,
      String(body.centerType || '').trim(), String(body.logoUrl || '').trim(), createdAt
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

    if (body.phoneNumber !== undefined && !/^[0-9]{8}$/.test(String(body.phoneNumber).trim())) {
      return json({ error: 'رقم الهاتف يجب أن يتكون من 8 أرقام.' }, 400);
    }

    const requestedAutoCalculatePrice = body.autoCalculatePrice === true;
    const requestedAutoCalculateSubscription = body.autoCalculateSubscription === true;
    let current: any = null;
    if (requestedAutoCalculatePrice || requestedAutoCalculateSubscription || body.extendTrialDays !== undefined
      || body.plan !== undefined || body.billingCycle !== undefined || body.enabledModules !== undefined || body.status !== undefined) {
      current = await env.DB.prepare('SELECT plan, enabled_modules, status, billing_cycle, monthly_price, subscription_ends_at, trial_ends_at FROM centers WHERE id = ?').bind(id).first<any>();
      if (!current) return json({ error: 'المركز غير موجود.' }, 404);
    }

    const updates: string[] = [];
    const binds: any[] = [];
    const normalizedBodyPlan = body.plan === undefined
      ? null
      : (String(body.plan).trim() === 'basic' ? 'starter' : String(body.plan).trim());
    const effectivePlan = normalizedBodyPlan || (current?.plan || 'starter');
    const requestedBillingCycle = body.billingCycle === undefined
      ? (current?.billing_cycle || 'monthly')
      : String(body.billingCycle).trim();
    const effectiveBillingCycle = requestedBillingCycle === 'annual' ? 'annual' : 'monthly';
    const effectiveStatus = body.status === undefined
      ? (current?.status || 'active')
      : String(body.status).trim();
    const planChanged = Boolean(current && normalizedBodyPlan && normalizedBodyPlan !== current.plan);
    const billingCycleChanged = Boolean(current && body.billingCycle !== undefined && effectiveBillingCycle !== (current.billing_cycle || 'monthly'));
    const statusChangedToPaid = Boolean(current && (current.status === 'trial' || current.status === 'expired') && effectiveStatus !== 'trial');
    const autoCalculatePrice = requestedAutoCalculatePrice
      || body.plan !== undefined
      || body.billingCycle !== undefined
      || body.enabledModules !== undefined
      || body.status !== undefined;
    const autoCalculateSubscription = requestedAutoCalculateSubscription || planChanged || billingCycleChanged || statusChangedToPaid;

    if (body.name !== undefined) { updates.push('name = ?'); binds.push(String(body.name).trim()); }
    if (body.phoneNumber !== undefined) { updates.push('phone_number = ?'); binds.push(String(body.phoneNumber).trim()); }
    if (body.locationCity !== undefined) { updates.push('location_city = ?'); binds.push(String(body.locationCity).trim()); }
    if (body.centerType !== undefined) { updates.push('center_type = ?'); binds.push(String(body.centerType).trim()); }
    if (body.plan !== undefined) {
      // "basic" is stored as 'starter' (DB CHECK only allows starter/growth/pro/custom)
      updates.push('plan = ?');
      binds.push(normalizedBodyPlan);
    }
    if (body.status !== undefined) { updates.push('status = ?'); binds.push(String(body.status).trim()); }
    if (body.mealOperatingMode !== undefined) { updates.push('meal_operating_mode = ?'); binds.push(String(body.mealOperatingMode).trim()); }
    if (body.enabledModules !== undefined) {
      updates.push('enabled_modules = ?');
      binds.push(JSON.stringify(normalizeEnabledModules(body.enabledModules, effectivePlan)));
    } else if (body.plan !== undefined && effectivePlan === 'pro') {
      updates.push('enabled_modules = ?');
      binds.push(JSON.stringify(ALL_MODULE_KEYS));
    }
    if (body.trialEndsAt !== undefined) { updates.push('trial_ends_at = ?'); binds.push(body.trialEndsAt ? Number(body.trialEndsAt) : null); }
    if (body.subscriptionEndsAt !== undefined && !autoCalculateSubscription
      && !(autoCalculatePrice && effectiveStatus === 'trial')) {
      updates.push('subscription_ends_at = ?');
      binds.push(body.subscriptionEndsAt ? Number(body.subscriptionEndsAt) : null);
    }

    // "+N jours d'essai" button: extend trial from today (or from current end if later)
    if (body.extendTrialDays !== undefined) {
      const extraDays = Number(body.extendTrialDays) || 0;
      const trialCenter = current || await env.DB.prepare('SELECT trial_ends_at, status FROM centers WHERE id = ?').bind(id).first<any>();
      if (trialCenter) {
        const now = Date.now();
        const base = (trialCenter.trial_ends_at && Number(trialCenter.trial_ends_at) > now) ? Number(trialCenter.trial_ends_at) : now;
        const newEnd = base + extraDays * 86400000;
        if (trialCenter.status !== 'trial') {
          updates.push('status = ?'); binds.push('trial');
        }
        updates.push('trial_ends_at = ?'); binds.push(newEnd);
      }
    }

    if (body.logoUrl !== undefined) { updates.push('logo_url = ?'); binds.push(String(body.logoUrl).trim()); }
    if (body.billingCycle !== undefined) { updates.push('billing_cycle = ?'); binds.push(effectiveBillingCycle); }
    if (body.monthlyPrice !== undefined && effectiveStatus !== 'trial' && (!autoCalculatePrice || effectivePlan === 'custom')) {
      binds.push(body.monthlyPrice === null ? null : Number(body.monthlyPrice));
      updates.push('monthly_price = ?');
    }

    if (autoCalculatePrice) {
      const modules = normalizeEnabledModules(Array.isArray(body.enabledModules)
        ? body.enabledModules
        : (() => {
          try { return JSON.parse(String(current?.enabled_modules || '[]')); } catch { return []; }
        })(), effectivePlan);
      if (effectiveStatus === 'trial') {
        updates.push('monthly_price = ?');
        binds.push(0);
      } else if (AUTO_PRICED_PLANS.has(effectivePlan)) {
        const placeholders = modules.map(() => '?').join(',');
        const { results: priceRows } = await env.DB.prepare(
          `SELECT module_key, price FROM module_prices WHERE school_year = ? AND module_key IN (${placeholders})`
        ).bind(currentSchoolYear(), ...modules).all<any>();
        let calculatedPrice = priceRows.reduce(
          (sum, row) => sum + (row.module_key === BUNDLED_MODULE_KEY ? 0 : (Number(row.price) || 0)),
          0
        );
        if (effectiveBillingCycle === 'annual') calculatedPrice *= 12 * (1 - ANNUAL_DISCOUNT);
        updates.push('monthly_price = ?');
        binds.push(calculatedPrice);
      }
    }

    if (autoCalculateSubscription && effectiveStatus !== 'trial') {
      const now = Date.now();
      const existingEnd = Number(current?.subscription_ends_at) || 0;
      const requestedTrialEnd = body.trialEndsAt === undefined
        ? (Number(current?.trial_ends_at) || 0)
        : (Number(body.trialEndsAt) || 0);
      const trialEnd = current?.status === 'trial' && requestedTrialEnd > now ? requestedTrialEnd : 0;
      // Activating a center during its trial starts the paid period at the
      // trial boundary, not immediately. Other renewals extend from an
      // existing future subscription end when present.
      const base = trialEnd || (existingEnd > now ? existingEnd : now);
      const duration = effectiveBillingCycle === 'annual' ? 365 : 30;
      updates.push('subscription_ends_at = ?');
      binds.push(base + duration * 86400000);
    } else if (autoCalculatePrice && effectiveStatus === 'trial' && (body.status !== undefined || current?.status === 'trial')) {
      updates.push('subscription_ends_at = ?');
      binds.push(null);
    }

    if (updates.length > 0) {
      binds.push(id);
      await env.DB.prepare(`UPDATE centers SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    }

    // Keep the tenant-facing settings in sync when platform admin edits
    // the center's identity or contact details.
    const settingsUpdates: string[] = [];
    const settingsBinds: any[] = [];
    if (body.name !== undefined) { settingsUpdates.push('center_name = ?'); settingsBinds.push(String(body.name).trim()); }
    if (body.phoneNumber !== undefined) { settingsUpdates.push('phone_number = ?'); settingsBinds.push(String(body.phoneNumber).trim()); }
    if (body.locationCity !== undefined) { settingsUpdates.push('location_city = ?'); settingsBinds.push(String(body.locationCity).trim()); }
    if (body.mealOperatingMode !== undefined) { settingsUpdates.push('meal_operating_mode = ?'); settingsBinds.push(String(body.mealOperatingMode).trim()); }
    if (settingsUpdates.length > 0) {
      settingsBinds.push(id);
      await env.DB.prepare(`UPDATE center_settings SET ${settingsUpdates.join(', ')} WHERE center_id = ?`).bind(...settingsBinds).run();
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

    const existing = await env.DB.prepare('SELECT id FROM centers WHERE id = ?').bind(id).first<any>();
    if (!existing) return json({ error: 'المركز غير موجود.' }, 404);

    // Full cleanup of the center's data: users, students, payments, staff…
    // Child rows are deleted explicitly in dependency order so the cleanup is
    // complete whether or not FK cascades are enforced by the engine.
    // Platform super-admins are never deleted (they may reference this center
    // historically but belong to the platform, not to a center).
    const stmts = [
      // ── students & their child rows ──
      env.DB.prepare('DELETE FROM payments WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM meal_attendances WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM suivi_notes WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM student_parents WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM siblings WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM authorized_persons WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM academic_history WHERE student_id IN (SELECT id FROM students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM students WHERE center_id = ?').bind(id),
      // ── staff & their child rows ──
      env.DB.prepare('DELETE FROM staff_subjects WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_schedule WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_payments WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_payslips WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_leave_requests WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff_advances WHERE staff_id IN (SELECT id FROM staff WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM staff WHERE center_id = ?').bind(id),
      // ── étude slots ──
      env.DB.prepare('DELETE FROM slot_enrollments WHERE slot_id IN (SELECT id FROM etude_slots WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM etude_slots WHERE center_id = ?').bind(id),
      // ── external courses ──
      env.DB.prepare('DELETE FROM course_enrolled_students WHERE course_id IN (SELECT id FROM external_courses WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_present_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_one_time_students WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_month_paid WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_seance_status WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM session_seance_amount WHERE session_id IN (SELECT id FROM external_course_sessions WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM external_course_sessions WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM external_payments WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM external_attendance WHERE student_id IN (SELECT id FROM external_students WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM external_students WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM external_courses WHERE center_id = ?').bind(id),
      // ── meals ──
      env.DB.prepare('DELETE FROM meal_plan_attendees WHERE meal_plan_id IN (SELECT id FROM meal_plan_days WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM meal_plan_days WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM meal_forfait_closure_items WHERE closure_id IN (SELECT id FROM meal_forfait_closures WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM meal_forfait_closures WHERE center_id = ?').bind(id),
      // ── revision seances ──
      env.DB.prepare('DELETE FROM revision_seance_students WHERE seance_id IN (SELECT id FROM revision_seances WHERE center_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM revision_seances WHERE center_id = ?').bind(id),
      // ── formations / timesheets / expenses ──
      env.DB.prepare('DELETE FROM formations WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM student_time_sheets WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM student_attendance WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM timesheets WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM expenses WHERE center_id = ?').bind(id),
      // ── auth: sessions + the center's users (platform admins preserved) ──
      env.DB.prepare('DELETE FROM sessions WHERE center_id = ?').bind(id),
      env.DB.prepare("DELETE FROM users WHERE center_id = ? AND role != 'platform_super_admin'").bind(id),
      // ── center config & billing ──
      env.DB.prepare('DELETE FROM center_settings WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM center_fee_sets WHERE center_id = ?').bind(id),
      env.DB.prepare('DELETE FROM center_invoices WHERE center_id = ?').bind(id),
      // ── finally the center itself ──
      env.DB.prepare('DELETE FROM centers WHERE id = ?').bind(id)
    ];
    await env.DB.batch(stmts);

    return json({ success: true, message: 'تم حذف المركز بنجاح.' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في حذف المركز.' }, 500);
  }
};
