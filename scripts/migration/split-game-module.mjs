#!/usr/bin/env node
/**
 * P4.3 step 1 - split the `game` god-module.
 *
 * `api/modules/game/game.controllers.ts` is a single 741-line file holding six
 * controllers for six independent domains (challenge, economy, dungeon, gacha,
 * battles, slg), wired together by one `GameModule`. Each domain already has its own
 * service, repository interface and SQLite repository - only the HTTP surface was
 * shared, which is what made the "vertical domain modularization" claim cosmetic.
 *
 * This moves each controller into its own domain folder and gives each domain a real
 * Nest module, so `game/` disappears entirely. It is a pure relocation: no behaviour
 * changes, and the endpoint surface must stay identical.
 *
 * NOTE: already applied, and not re-runnable - the source file it reads no longer
 * exists. It is kept as the record of what moved. One follow-up repair was needed and
 * lives in `fix-game-split.mjs`: the original file had a module-private `ok()` helper
 * that all six controllers relied on, so it could not travel with any single one of
 * them.
 *
 * Run: node scripts/migration/split-game-module.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SOURCE = path.join(ROOT, 'api', 'modules', 'game', 'game.controllers.ts');
const ERRORS_SOURCE = path.join(ROOT, 'api', 'modules', 'game', 'game.errors.ts');
const ERRORS_TARGET = path.join(ROOT, 'api', 'utils', 'gameErrors.ts');

const DRY_RUN = process.argv.includes('--dry-run');

const log = (m) => process.stdout.write(m + '\n');

/** Order matters: the split is by these markers. */
const DOMAINS = ['challenge', 'economy', 'dungeon', 'gacha', 'battles', 'slg'];

const DECORATORS = ['Body', 'Controller', 'Delete', 'Get', 'Inject', 'Param', 'Post', 'Put', 'Query', 'Req'];

const source = fs.readFileSync(SOURCE, 'utf8');
const lines = source.split(/\r?\n/);

/** Locate each `@Controller('api/<domain>')` and the closing brace of its class. */
function classBlock(domain) {
  const startIndex = lines.findIndex((line) => line.includes(`@Controller('api/${domain}')`));
  if (startIndex === -1) throw new Error(`no controller found for "${domain}"`);

  let endIndex = -1;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (lines[i] === '}') {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) throw new Error(`could not find the end of the "${domain}" controller`);

  return { startIndex, endIndex, body: lines.slice(startIndex, endIndex + 1) };
}

function usedDecorators(body) {
  const text = body.join('\n');
  return DECORATORS.filter((name) => new RegExp(`@${name}\\(`).test(text));
}

function serviceClass(domain) {
  return `${pascal(domain)}Service`;
}

function controllerClass(domain) {
  return `${pascal(domain)}Controller`;
}

function pascal(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

const moved = [];

for (const domain of DOMAINS) {
  const { body } = classBlock(domain);
  const text = body.join('\n');
  const decorators = usedDecorators(body);
  const service = serviceClass(domain);

  const imports = [
    `import { ${decorators.join(', ')} } from '@nestjs/common';`,
    `import type { Request } from 'express';`,
    '',
    `import { ${service} } from './${domain}.service.js';`,
  ];
  if (/\bassertActorFeatureEnabled\(/.test(text)) {
    imports.push(`import { assertActorFeatureEnabled } from '../../utils/classFeatures.js';`);
  }
  if (/\bgetRequestActor\(/.test(text)) {
    imports.push(`import { getRequestActor } from '../../utils/requestAuth.js';`);
  }
  if (/\bthrowGameError\(/.test(text)) {
    imports.push(`import { throwGameError } from '../../utils/gameErrors.js';`);
  }

  // `Request` is only referenced in signatures; drop the import when unused.
  const expressImportIndex = imports.indexOf(`import type { Request } from 'express';`);
  if (expressImportIndex >= 0 && !/\bRequest\b/.test(text)) imports.splice(expressImportIndex, 1);
  // A decorator list is invalid when empty.
  if (decorators.length === 0) imports.splice(imports.findIndex((l) => l.startsWith('import { ,')), 1);

  const header =
    `/**\n * ${domain} HTTP surface.\n *\n` +
    ` * Split out of \`api/modules/game/game.controllers.ts\` in P4.3: six independent domains\n` +
    ` * shared one 741-line file and one Nest module, which is what made the vertical\n` +
    ` * domain layout cosmetic. The body is unchanged - this is a relocation.\n */\n\n`;

  const controllerFile = `${header}${imports.filter((l) => l !== undefined).join('\n')}\n\n${body.join('\n')}\n`;

  const pascalDomain = pascal(domain);
  const moduleFile =
    `import { Module } from '@nestjs/common';\n\n` +
    `import { ${controllerClass(domain)} } from './${domain}.controllers.js';\n` +
    `import { Sqlite${pascalDomain}Repository } from './${domain}.repository.sqlite.js';\n` +
    `import { ${service} } from './${domain}.service.js';\n\n` +
    `@Module({\n` +
    `  controllers: [${controllerClass(domain)}],\n` +
    `  providers: [\n` +
    `    {\n` +
    `      provide: ${service},\n` +
    `      useFactory: () => new ${service}(new Sqlite${pascalDomain}Repository()),\n` +
    `    },\n` +
    `  ],\n` +
    `})\n` +
    `export class ${pascalDomain}Module {}\n`;

  const controllerPath = path.join(ROOT, 'api', 'modules', domain, `${domain}.controllers.ts`);
  const modulePath = path.join(ROOT, 'api', 'modules', domain, `${domain}.module.ts`);

  if (!DRY_RUN) {
    fs.writeFileSync(controllerPath, controllerFile, 'utf8');
    fs.writeFileSync(modulePath, moduleFile, 'utf8');
  }
  moved.push({ domain, lines: body.length, decorators: decorators.length });
}

// The shared error helper is used by all six, so it moves out of the deleted folder.
if (!DRY_RUN) {
  const errorsSource = fs.readFileSync(ERRORS_SOURCE, 'utf8');
  fs.writeFileSync(
    ERRORS_TARGET,
    `/**\n * Domain HTTP error translation.\n *\n * Moved from \`api/modules/game/game.errors.ts\` in P4.3, when the \`game\` folder was\n * dissolved and its six domains became independent modules.\n */\n\n${errorsSource}`,
    'utf8',
  );
}

log(`split ${moved.length} controllers out of game.controllers.ts:`);
for (const entry of moved) log(`  ${entry.domain.padEnd(10)} ${entry.lines} lines, ${entry.decorators} decorators`);
log(DRY_RUN ? '\nDRY RUN - nothing written' : '\nwritten');
