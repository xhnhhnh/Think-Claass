/**
 * Plugin discovery.
 *
 * Scans the configured directories for `plugin.json` / `manifest.json`, reads and
 * validates each one, and reports everything it found - including what it rejected
 * and why. Nothing here executes plugin code: discovery must work on a plugin whose
 * backend module is broken, otherwise a single bad plugin takes down the report
 * that would have explained it.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { PluginManifest } from '@thinkclass/contracts';
import { validateManifest, type ManifestIssue } from '@thinkclass/plugin-sdk';

import type { Logger } from '@thinkclass/kernel';

/** File names accepted as a manifest, in precedence order. */
const MANIFEST_FILES = ['plugin.json', 'manifest.json'];

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  /** Absolute path to the plugin directory. */
  directory: string;
  absoluteManifestPath: string;
  /** Non-fatal findings from validation. */
  warnings: ManifestIssue[];
}

export interface RejectedPlugin {
  directory: string;
  /** Present when the manifest parsed but failed validation. */
  manifestId: string | null;
  errors: ManifestIssue[];
  /** Set when the failure was reading or parsing rather than validation. */
  fatal?: string;
}

export interface DiscoveryResult {
  discovered: DiscoveredPlugin[];
  rejected: RejectedPlugin[];
  warnings: Array<{ pluginId: string; issue: ManifestIssue }>;
  /** Directories actually scanned, for diagnostics. */
  scannedDirs: string[];
}

export interface DiscoverOptions {
  dirs: string[];
  kernelApiVersion: number;
  logger?: Logger;
}

/**
 * Find the manifest file inside a plugin directory.
 * `manifest.json` is accepted as a fallback for older layouts.
 */
function findManifestFile(directory: string): string | null {
  for (const name of MANIFEST_FILES) {
    const candidate = path.join(directory, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function discoverPlugins(options: DiscoverOptions): DiscoveryResult {
  const { dirs, kernelApiVersion, logger } = options;

  const discovered: DiscoveredPlugin[] = [];
  const rejected: RejectedPlugin[] = [];
  const warnings: Array<{ pluginId: string; issue: ManifestIssue }> = [];
  const scannedDirs: string[] = [];
  const seenIds = new Map<string, string>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    scannedDirs.push(dir);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      rejected.push({ directory: dir, manifestId: null, errors: [], fatal: String(error) });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(dir, entry.name);

      const manifestPath = findManifestFile(pluginDir);
      if (!manifestPath) continue; // not a plugin directory

      let raw: string;
      let parsed: unknown;
      try {
        raw = fs.readFileSync(manifestPath, 'utf8');
        parsed = JSON.parse(raw);
      } catch (error) {
        rejected.push({
          directory: pluginDir,
          manifestId: null,
          errors: [],
          fatal: `manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      const result = validateManifest(parsed, { kernelApiVersion });
      if (!result.ok || !result.manifest) {
        rejected.push({
          directory: pluginDir,
          manifestId:
            typeof (parsed as { id?: unknown })?.id === 'string' ? String((parsed as { id: string }).id) : null,
          errors: result.errors,
        });
        continue;
      }

      const manifest = result.manifest;

      // Duplicate ids: first directory wins, later ones are rejected loudly. Two
      // plugins claiming the same id would otherwise silently shadow one another.
      const previous = seenIds.get(manifest.id);
      if (previous) {
        rejected.push({
          directory: pluginDir,
          manifestId: manifest.id,
          errors: [
            {
              path: 'id',
              severity: 'error',
              message: `duplicate plugin id "${manifest.id}"; already provided by ${previous}`,
            },
          ],
        });
        continue;
      }
      seenIds.set(manifest.id, pluginDir);

      for (const warning of result.warnings) warnings.push({ pluginId: manifest.id, issue: warning });
      discovered.push({ manifest, directory: pluginDir, absoluteManifestPath: manifestPath, warnings: result.warnings });
      logger?.debug('plugin discovered', { id: manifest.id, version: manifest.version, directory: pluginDir });
    }
  }

  discovered.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));

  logger?.info('plugin discovery complete', {
    discovered: discovered.length,
    rejected: rejected.length,
    warnings: warnings.length,
    scannedDirs: scannedDirs.length,
  });

  return { discovered, rejected, warnings, scannedDirs };
}
