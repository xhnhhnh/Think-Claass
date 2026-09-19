/**
 * Plugin manifest validation.
 *
 * The manifest is the contract between a plugin and the runtime. Nothing a plugin
 * does at runtime may exceed what its manifest declares, so this validator is the
 * first line of defence: an invalid manifest means the plugin is never loaded, and
 * a manifest that under-declares causes the runtime to reject the registration
 * rather than silently permit it.
 *
 * Hand-written rather than schema-library based: the repository has no network
 * access to add a dependency, and the rules here are specific enough (table
 * namespacing, kernel API ranges, tier semantics) that a generic schema would need
 * just as much custom logic.
 */

import type {
  FrontendMenuDeclaration,
  FrontendRouteDeclaration,
  FrontendSlotDeclaration,
  HttpMethod,
  PluginIsolation,
  PluginManifest,
  PluginTier,
  RouteDeclaration,
  ScopeType,
} from '@thinkclass/contracts';

import { isValidRange, parseVersion, satisfies } from './semver.js';

export interface ManifestIssue {
  path: string;
  message: string;
  /** `error` rejects the plugin; `warning` is reported and the plugin still loads. */
  severity: 'error' | 'warning';
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: ManifestIssue[];
  warnings: ManifestIssue[];
  manifest: PluginManifest | null;
}

const ID_RE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const TABLE_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EVENT_TOPIC_RE = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)*(?:\.\*)?$/;
const PERMISSION_KEY_RE = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/;

const TIERS: PluginTier[] = ['foundation', 'feature'];
const ISOLATIONS: PluginIsolation[] = ['in-process', 'restricted', 'worker'];
const SCOPES: ScopeType[] = ['platform', 'school', 'class', 'student'];
const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const CAPABILITIES = ['fs', 'net', 'child_process'];

/** Table namespace a plugin owns: `pet` -> `p_pet_`, `acme.quiz` -> `p_acme_quiz_`. */
export function slugOf(id: string): string {
  return String(id ?? '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function tablePrefixOf(idOrSlug: string): string {
  return `p_${slugOf(idOrSlug)}_`;
}

/** Reject paths that escape the plugin directory. */
function isSafeRelativePath(value: string): boolean {
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  const segments = value.split(/[\\/]/);
  return !segments.includes('..');
}

// ---------------------------------------------------------------------------

class Issues {
  /** @type {ManifestIssue[]} */
  list: ManifestIssue[] = [];

  error(path: string, message: string): void {
    this.list.push({ path, message, severity: 'error' });
  }

  warn(path: string, message: string): void {
    this.list.push({ path, message, severity: 'warning' });
  }

  get errors(): ManifestIssue[] {
    return this.list.filter((i) => i.severity === 'error');
  }

  get warnings(): ManifestIssue[] {
    return this.list.filter((i) => i.severity === 'warning');
  }
}

function stringField(issues: Issues, source: Record<string, unknown>, key: string, path: string): string | null {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    issues.error(path, 'must be a non-empty string');
    return null;
  }
  return value.trim();
}

function optionalStringArray(issues: Issues, value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issues.error(path, 'must be an array of strings');
    return [];
  }
  const out: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      issues.error(`${path}[${index}]`, 'must be a non-empty string');
      return;
    }
    out.push(entry.trim());
  });
  return out;
}

// ---------------------------------------------------------------------------

/**
 * Validate and normalise a raw manifest object.
 *
 * Never throws: a malformed manifest is a plugin that does not load, not a kernel
 * that fails to boot.
 */
export function validateManifest(raw: unknown, options: { kernelApiVersion?: number } = {}): ManifestValidationResult {
  const issues = new Issues();

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.error('', 'manifest must be a JSON object');
    return { ok: false, errors: issues.errors, warnings: issues.warnings, manifest: null };
  }

  const source = raw as Record<string, unknown>;

  const id = stringField(issues, source, 'id', 'id');
  if (id && !ID_RE.test(id)) {
    issues.error('id', `"${id}" must be lowercase, dot- or dash-separated (e.g. "pet", "acme.quiz")`);
  }

  const slug = typeof source.slug === 'string' && source.slug.trim() !== '' ? source.slug.trim() : id ? slugOf(id) : '';
  if (slug && !TABLE_RE.test(slug)) {
    issues.error('slug', `"${slug}" is not a usable table-namespace slug`);
  }
  if (typeof source.slug === 'string' && id && source.slug.trim() !== slugOf(id)) {
    issues.error('slug', `must be derived from id: expected "${slugOf(id)}", found "${source.slug}"`);
  }

  const name = stringField(issues, source, 'name', 'name');

  const version = stringField(issues, source, 'version', 'version');
  if (version && !parseVersion(version)) {
    issues.error('version', `"${version}" is not a semantic version`);
  }

  const kernel = stringField(issues, source, 'kernel', 'kernel');
  if (kernel) {
    const range = isValidRange(kernel);
    if (!range.ok) issues.error('kernel', range.reason ?? 'invalid version range');

    const apiVersion = options.kernelApiVersion;
    if (apiVersion !== undefined && range.ok) {
      // The kernel advertises a single integer API level, so compatibility is a
      // range check against "<apiVersion>.0.0".
      const check = satisfies(`${apiVersion}.0.0`, kernel);
      if (!check.ok) {
        issues.error('kernel', `requires kernel API "${kernel}" but this kernel provides API ${apiVersion}`);
      }
    }
  }

  const tier = source.tier;
  if (typeof tier !== 'string' || !TIERS.includes(tier as PluginTier)) {
    issues.error('tier', `must be one of ${TIERS.join(', ')}`);
  }

  const required = source.required;
  if (required !== undefined && typeof required !== 'boolean') {
    issues.error('required', 'must be a boolean');
  }
  if (tier === 'foundation' && required !== true) {
    issues.error('required', 'foundation-tier plugins must set "required": true');
  }
  if (tier === 'feature' && required === true) {
    issues.error('required', 'only foundation-tier plugins may be required');
  }

  const isolation = source.isolation ?? 'restricted';
  if (typeof isolation !== 'string' || !ISOLATIONS.includes(isolation as PluginIsolation)) {
    issues.error('isolation', `must be one of ${ISOLATIONS.join(', ')}`);
  }

  // -- entry ---------------------------------------------------------------
  const entry = (source.entry ?? {}) as Record<string, unknown>;
  if (typeof entry !== 'object' || Array.isArray(entry)) {
    issues.error('entry', 'must be an object');
  } else {
    for (const key of ['backend', 'frontend'] as const) {
      const value = entry[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.trim() === '') {
        issues.error(`entry.${key}`, 'must be a non-empty string');
      } else if (!isSafeRelativePath(value)) {
        issues.error(`entry.${key}`, `"${value}" must be a relative path inside the plugin directory`);
      }
    }
    if (entry.backend === undefined && entry.frontend === undefined) {
      issues.warn('entry', 'declares neither a backend nor a frontend entry');
    }
  }

  // -- dependency ranges ---------------------------------------------------
  const dependsOn = (source.dependsOn ?? {}) as Record<string, unknown>;
  if (typeof dependsOn !== 'object' || Array.isArray(dependsOn)) {
    issues.error('dependsOn', 'must be an object mapping plugin id to version range');
  } else {
    for (const [dep, range] of Object.entries(dependsOn)) {
      if (dep === id) issues.error(`dependsOn.${dep}`, 'a plugin cannot depend on itself');
      if (!ID_RE.test(dep)) issues.error(`dependsOn.${dep}`, 'is not a valid plugin id');
      if (typeof range !== 'string') {
        issues.error(`dependsOn.${dep}`, 'version range must be a string');
      } else {
        const check = isValidRange(range);
        if (!check.ok) issues.error(`dependsOn.${dep}`, check.reason ?? 'invalid version range');
      }
    }
  }

  for (const key of ['optionalPeers'] as const) {
    const map = (source[key] ?? {}) as Record<string, unknown>;
    if (typeof map !== 'object' || Array.isArray(map)) {
      issues.error(key, 'must be an object mapping plugin id to version range');
      continue;
    }
    for (const [dep, range] of Object.entries(map)) {
      if (typeof range !== 'string' || !isValidRange(range).ok) {
        issues.error(`${key}.${dep}`, 'invalid version range');
      }
    }
  }

  const conflictsWith = optionalStringArray(issues, source.conflictsWith, 'conflictsWith');
  if (conflictsWith.includes(id ?? '')) {
    issues.error('conflictsWith', 'a plugin cannot conflict with itself');
  }

  // -- provides ------------------------------------------------------------
  const provides = (source.provides ?? {}) as Record<string, unknown>;
  if (typeof provides !== 'object' || Array.isArray(provides)) {
    issues.error('provides', 'must be an object');
  }

  const permissionKeys = new Set<string>();
  const permissions = provides && !Array.isArray(provides) ? (provides.permissions ?? []) : [];
  if (!Array.isArray(permissions)) {
    issues.error('provides.permissions', 'must be an array');
  } else {
    permissions.forEach((permission, index) => {
      const path = `provides.permissions[${index}]`;
      const decl = (permission ?? {}) as Record<string, unknown>;
      const key = typeof decl.key === 'string' ? decl.key : '';
      if (!key) {
        issues.error(`${path}.key`, 'is required');
      } else {
        if (!PERMISSION_KEY_RE.test(key)) {
          issues.error(`${path}.key`, `"${key}" must be namespaced, e.g. "pet.adopt"`);
        }
        if (permissionKeys.has(key)) issues.error(`${path}.key`, `duplicate permission key "${key}"`);
        permissionKeys.add(key);
      }
      if (typeof decl.scope !== 'string' || !SCOPES.includes(decl.scope as ScopeType)) {
        issues.error(`${path}.scope`, `must be one of ${SCOPES.join(', ')}`);
      }
      if (typeof decl.default !== 'boolean') issues.error(`${path}.default`, 'must be a boolean');
      if (typeof decl.label !== 'string' || decl.label.trim() === '') {
        issues.error(`${path}.label`, 'must be a non-empty string');
      }
    });
  }

  const routes = (provides && !Array.isArray(provides) ? provides.routes : []) as unknown;
  if (routes !== undefined && !Array.isArray(routes)) {
    issues.error('provides.routes', 'must be an array');
  } else if (Array.isArray(routes)) {
    routes.forEach((route, index) => {
      const path = `provides.routes[${index}]`;
      const decl = (route ?? {}) as Partial<RouteDeclaration>;
      if (typeof decl.method !== 'string' || !METHODS.includes(decl.method)) {
        issues.error(`${path}.method`, `must be one of ${METHODS.join(', ')}`);
      }
      if (typeof decl.base !== 'string' || !decl.base.startsWith('/')) {
        issues.error(`${path}.base`, 'must be an absolute path starting with "/"');
      } else {
        const namespaced = decl.base.startsWith(`/api/p/`) || decl.base === `/api/${slug}` || decl.base.startsWith(`/api/${slug}/`);
        if (!namespaced) {
          issues.warn(
            `${path}.base`,
            `"${decl.base}" is not namespaced under "/api/p/${slug}"; third-party plugins must namespace their routes`,
          );
        }
      }
      if (decl.auth !== 'public' && decl.auth !== 'actor') {
        issues.error(`${path}.auth`, 'must be "public" or "actor"');
      }
      for (const [i, compatPath] of (decl.compat ?? []).entries()) {
        if (typeof compatPath !== 'string' || !compatPath.startsWith('/')) {
          issues.error(`${path}.compat[${i}]`, 'must be an absolute path starting with "/"');
        }
      }
      for (const [i, key] of (decl.permissions ?? []).entries()) {
        if (typeof key !== 'string' || !PERMISSION_KEY_RE.test(key)) {
          issues.error(`${path}.permissions[${i}]`, 'must be a namespaced permission key');
        } else if (!permissionKeys.has(key)) {
          issues.error(`${path}.permissions[${i}]`, `"${key}" is not declared in provides.permissions`);
        }
      }
    });
  }

  const events = (provides && !Array.isArray(provides) ? provides.events : undefined) as
    | { emits?: unknown; subscribes?: unknown }
    | undefined;
  if (events !== undefined) {
    if (typeof events !== 'object' || events === null || Array.isArray(events)) {
      issues.error('provides.events', 'must be an object with "emits" and/or "subscribes"');
    } else {
      for (const key of ['emits', 'subscribes'] as const) {
        for (const [i, topic] of optionalStringArray(issues, events[key], `provides.events.${key}`).entries()) {
          if (!EVENT_TOPIC_RE.test(topic)) {
            issues.error(`provides.events.${key}[${i}]`, `"${topic}" must be a dotted topic, optionally ending in ".*"`);
          }
        }
      }
    }
  }

  const migrations = (provides && !Array.isArray(provides) ? provides.migrations : []) as unknown;
  if (migrations !== undefined && !Array.isArray(migrations)) {
    issues.error('provides.migrations', 'must be an array');
  } else if (Array.isArray(migrations)) {
    const seen = new Set<string>();
    migrations.forEach((migration, index) => {
      const path = `provides.migrations[${index}]`;
      const decl = (migration ?? {}) as Record<string, unknown>;
      const migId = typeof decl.id === 'string' ? decl.id.trim() : '';
      if (!migId) issues.error(`${path}.id`, 'is required');
      else if (seen.has(migId)) issues.error(`${path}.id`, `duplicate migration id "${migId}"`);
      else seen.add(migId);

      if (typeof decl.up !== 'string' || !decl.up.endsWith('.sql') || !isSafeRelativePath(decl.up)) {
        issues.error(`${path}.up`, 'must be a relative path to a .sql file inside the plugin directory');
      }
      if (decl.down !== undefined && (typeof decl.down !== 'string' || !decl.down.endsWith('.sql'))) {
        issues.error(`${path}.down`, 'must be a relative path to a .sql file');
      }
    });
  }

  const jobs = (provides && !Array.isArray(provides) ? provides.jobs : []) as unknown;
  if (jobs !== undefined && !Array.isArray(jobs)) {
    issues.error('provides.jobs', 'must be an array');
  } else if (Array.isArray(jobs)) {
    jobs.forEach((job, index) => {
      const path = `provides.jobs[${index}]`;
      const decl = (job ?? {}) as Record<string, unknown>;
      if (typeof decl.name !== 'string' || decl.name.trim() === '') issues.error(`${path}.name`, 'is required');
      if (typeof decl.schedule !== 'string' || decl.schedule.trim() === '') {
        issues.error(`${path}.schedule`, 'is required');
      }
    });
  }

  validateFrontend(issues, provides && !Array.isArray(provides) ? provides.frontend : undefined, slug);

  // -- data ----------------------------------------------------------------
  const data = (source.data ?? {}) as Record<string, unknown>;
  if (typeof data !== 'object' || Array.isArray(data)) {
    issues.error('data', 'must be an object');
  } else {
    const prefix = `p_${slug}_`;
    for (const [i, table] of optionalStringArray(issues, data.tables, 'data.tables').entries()) {
      if (!TABLE_RE.test(table)) {
        issues.error(`data.tables[${i}]`, `"${table}" is not a valid table name`);
      } else if (!table.startsWith(prefix)) {
        issues.error(`data.tables[${i}]`, `"${table}" must start with "${prefix}"`);
      }
    }
    for (const [i, table] of optionalStringArray(issues, data.reads, 'data.reads').entries()) {
      if (!TABLE_RE.test(table)) issues.error(`data.reads[${i}]`, `"${table}" is not a valid table name`);
      if (table.startsWith(prefix)) {
        issues.warn(`data.reads[${i}]`, `"${table}" is owned by this plugin; declare it in data.tables instead`);
      }
    }

    // Adopted tables: owned, but still carrying their legacy name. Namespacing is
    // deliberately NOT required here - that is the whole point of the declaration -
    // but the transition is reported so it stays visible.
    const adopted = optionalStringArray(issues, data.adopted, 'data.adopted');
    for (const [i, table] of adopted.entries()) {
      if (!TABLE_RE.test(table)) {
        issues.error(`data.adopted[${i}]`, `"${table}" is not a valid table name`);
      } else if (table.startsWith(prefix)) {
        issues.error(
          `data.adopted[${i}]`,
          `"${table}" already follows the "${prefix}" convention; declare it in data.tables instead`,
        );
      }
    }
    if (adopted.length > 0) {
      issues.warn(
        'data.adopted',
        `owns ${adopted.length} legacy-named table(s) (${adopted.join(', ')}); ` +
          `this is transitional and counted by guardrail G10`,
      );
    }
    for (const table of adopted) {
      if (Array.isArray(data.tables) && (data.tables as string[]).includes(table)) {
        issues.error('data.adopted', `"${table}" is declared in both data.tables and data.adopted`);
      }
    }
    for (const [i, capability] of optionalStringArray(issues, data.capabilities, 'data.capabilities').entries()) {
      if (!CAPABILITIES.includes(capability)) {
        issues.error(`data.capabilities[${i}]`, `must be one of ${CAPABILITIES.join(', ')}`);
      }
    }
  }

  const errors = issues.errors;
  if (errors.length > 0) {
    return { ok: false, errors, warnings: issues.warnings, manifest: null };
  }

  const manifest: PluginManifest = {
    id: id as string,
    slug,
    name: name as string,
    version: version as string,
    kernel: kernel as string,
    tier: tier as PluginTier,
    required: required === true,
    isolation: isolation as PluginIsolation,
    entry: {
      ...(typeof entry.backend === 'string' ? { backend: entry.backend } : {}),
      ...(typeof entry.frontend === 'string' ? { frontend: entry.frontend } : {}),
    },
    provides: provides as PluginManifest['provides'],
    data: {
      tables: Array.isArray(data.tables) ? (data.tables as string[]) : [],
      adopted: Array.isArray(data.adopted) ? (data.adopted as string[]) : [],
      reads: Array.isArray(data.reads) ? (data.reads as string[]) : [],
      capabilities: Array.isArray(data.capabilities) ? (data.capabilities as PluginManifest['data']['capabilities']) : [],
    },
    ...(typeof source.description === 'string' ? { description: source.description } : {}),
    ...(typeof source.author === 'string' ? { author: source.author } : {}),
    ...(typeof source.license === 'string' ? { license: source.license } : {}),
    ...(Object.keys(dependsOn).length > 0 ? { dependsOn: dependsOn as Record<string, string> } : {}),
    ...(Object.keys((source.optionalPeers ?? {}) as object).length > 0
      ? { optionalPeers: source.optionalPeers as Record<string, string> }
      : {}),
    ...(conflictsWith.length > 0 ? { conflictsWith } : {}),
  };

  return { ok: true, errors: [], warnings: issues.warnings, manifest };
}

function validateFrontend(issues: Issues, frontend: unknown, slug: string): void {
  if (frontend === undefined) return;
  if (typeof frontend !== 'object' || frontend === null || Array.isArray(frontend)) {
    issues.error('provides.frontend', 'must be an object');
    return;
  }
  const decl = frontend as Record<string, unknown>;

  const routes = decl.routes;
  if (routes !== undefined && !Array.isArray(routes)) {
    issues.error('provides.frontend.routes', 'must be an array');
  } else if (Array.isArray(routes)) {
    routes.forEach((route, index) => {
      const path = `provides.frontend.routes[${index}]`;
      const entry = (route ?? {}) as Partial<FrontendRouteDeclaration>;
      if (typeof entry.path !== 'string' || !entry.path.startsWith('/')) {
        issues.error(`${path}.path`, 'must be an absolute path');
      }
      if (typeof entry.component !== 'string' || entry.component.trim() === '') {
        issues.error(`${path}.component`, 'is required');
      }
      if (typeof entry.layout !== 'string' || entry.layout.trim() === '') {
        issues.error(`${path}.layout`, 'is required');
      }
      if (!Array.isArray(entry.roles) || entry.roles.length === 0) {
        issues.error(`${path}.roles`, 'must list at least one role');
      }
      if (typeof entry.order !== 'number') issues.error(`${path}.order`, 'must be a number');
    });
  }

  const menus = decl.menus;
  if (menus !== undefined && !Array.isArray(menus)) {
    issues.error('provides.frontend.menus', 'must be an array');
  } else if (Array.isArray(menus)) {
    menus.forEach((menu, index) => {
      const path = `provides.frontend.menus[${index}]`;
      const entry = (menu ?? {}) as Partial<FrontendMenuDeclaration>;
      for (const key of ['id', 'layout', 'path', 'label', 'icon'] as const) {
        if (typeof entry[key] !== 'string' || String(entry[key]).trim() === '') {
          issues.error(`${path}.${key}`, 'is required');
        }
      }
      if (!Array.isArray(entry.roles) || entry.roles.length === 0) {
        issues.error(`${path}.roles`, 'must list at least one role');
      }
      if (typeof entry.order !== 'number') issues.error(`${path}.order`, 'must be a number');
    });
    if (slug === '' && menus.length > 0) issues.warn('provides.frontend.menus', 'plugin has no slug');
  }

  const slots = decl.slots;
  if (slots !== undefined && !Array.isArray(slots)) {
    issues.error('provides.frontend.slots', 'must be an array');
  } else if (Array.isArray(slots)) {
    slots.forEach((slot, index) => {
      const path = `provides.frontend.slots[${index}]`;
      const entry = (slot ?? {}) as Partial<FrontendSlotDeclaration>;
      if (typeof entry.slot !== 'string' || entry.slot.trim() === '') issues.error(`${path}.slot`, 'is required');
      if (typeof entry.component !== 'string' || entry.component.trim() === '') {
        issues.error(`${path}.component`, 'is required');
      }
      if (typeof entry.order !== 'number') issues.error(`${path}.order`, 'must be a number');
    });
  }
}
