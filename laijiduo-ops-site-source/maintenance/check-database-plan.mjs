import { createHash } from 'node:crypto';
import { access, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const normalizedHash = text => createHash('sha256')
  .update(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim(), 'utf8').digest('hex');

export async function checkDatabasePlan({ root = defaultRoot, mode = 'local' } = {}) {
  if (mode !== 'local') throw new Error('Production deployment is blocked; isolated baseline is not accepted.');
  const base = await realpath(root);
  const contained = path => {
    const target = resolve(base, path);
    const rel = relative(base, target);
    if (isAbsolute(path) || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path escapes app root');
    return target;
  };
  async function read(path) {
    const target = await realpath(contained(path));
    const rel = relative(base, target);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Symlink escapes app root');
    return readFile(target, 'utf8');
  }
  const plan = JSON.parse(await read('maintenance/database-plan.json'));
  if (plan.production_ready !== false || plan.local_sources.length !== 8 || plan.evidence_files.length !== 3) {
    throw new Error('Invalid or prematurely approved database plan');
  }
  let historyOnly = 0;
  for (const source of plan.local_sources) {
    if (normalizedHash(await read(source.path)) !== source.normalized_sha256) {
      throw new Error('Local source checksum mismatch: ' + source.path);
    }
    if (source.state === 'history_only') {
      historyOnly++;
      if (!source.path.startsWith('supabase/history/')) throw new Error('History source must be quarantined');
      try {
        await access(contained(source.original_path));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      throw new Error('Excluded script remains in migrations: ' + source.original_path);
    }
    if (source.state !== 'baseline_candidate_not_approved_for_production') throw new Error('Unknown source state');
  }
  if (historyOnly !== 3) throw new Error('Expected three excluded historical scripts');
  const versions = new Set();
  for (const evidencePath of plan.evidence_files) {
    const evidence = JSON.parse(await read(evidencePath));
    for (const entry of evidence.entries) {
      if (versions.has(entry.production_version)) throw new Error('Duplicate archived production version');
      versions.add(entry.production_version);
      const hash = entry.archive_normalized_sha256 ?? entry.production_sha256 ?? entry.normalized_sha256;
      if (normalizedHash(await read(entry.archive_path)) !== hash) {
        throw new Error('Archive checksum mismatch: ' + entry.archive_path);
      }
    }
  }
  if (versions.size !== 100) throw new Error('Expected 100 source archives');
  return { local_sources_verified: 8, history_only: 3, archives_verified: versions.size,
    production_ready: false, network_used: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--production')) throw new Error('Only local checking is supported');
    console.log(JSON.stringify(await checkDatabasePlan({ mode: args.length ? 'production' : 'local' }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
