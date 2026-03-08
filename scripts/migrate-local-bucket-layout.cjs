#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const knexFactory = require('knex');
const knexConfig = require('../knexfile.cjs');

const DRY_RUN = process.argv.includes('--dry-run');

const LOCAL_BUCKET_ROOT = path.resolve(process.cwd(), process.env.LOCAL_BUCKET_ROOT ?? '../bucket');
const LOCAL_BUCKET_PUBLIC_BASE_PATH = normalizePublicBasePath(process.env.LOCAL_BUCKET_PUBLIC_BASE_PATH ?? '/api/public/files');

const LEGACY_SCOPES = new Set([
  'assets',
  'maintenance-work-orders-open',
  'maintenance-work-orders-close'
]);

function normalizePublicBasePath(value) {
  const withLeadingSlash = String(value || '/api/public/files').startsWith('/') ? String(value || '/api/public/files') : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function buildPublicUrl(relativePath) {
  return `${LOCAL_BUCKET_PUBLIC_BASE_PATH}/${normalizeSlashes(relativePath)}`;
}

async function listAllFiles(rootDir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      results.push(absolutePath);
    }
  }

  await walk(rootDir);
  return results;
}

function toRelativePath(absolutePath) {
  return normalizeSlashes(path.relative(LOCAL_BUCKET_ROOT, absolutePath));
}

function buildRenamePlan(relativePath) {
  const parts = normalizeSlashes(relativePath).split('/');
  if (parts.length !== 4) return null;

  const [orgPart, scopePart, entityPart, filePart] = parts;
  if (!orgPart || !scopePart || !entityPart || !filePart) return null;
  if (!orgPart.startsWith('org-')) return null;
  if (!LEGACY_SCOPES.has(scopePart)) return null;

  const nextRelativePath = [orgPart, scopePart, `${entityPart}-${filePart}`].join('/');
  return { previousRelativePath: relativePath, nextRelativePath };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function removeEmptyDirsRecursively(rootDir) {
  async function prune(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await prune(path.join(dirPath, entry.name));
    }

    if (dirPath === rootDir) return;
    const remaining = await fs.readdir(dirPath);
    if (remaining.length === 0) await fs.rmdir(dirPath);
  }

  await prune(rootDir);
}

async function run() {
  const knex = knexFactory(knexConfig);
  try {
    await fs.mkdir(LOCAL_BUCKET_ROOT, { recursive: true });
    const files = await listAllFiles(LOCAL_BUCKET_ROOT);

    const plans = [];
    for (const filePath of files) {
      const relativePath = toRelativePath(filePath);
      const plan = buildRenamePlan(relativePath);
      if (!plan) continue;

      const currentAbsolutePath = path.join(LOCAL_BUCKET_ROOT, plan.previousRelativePath);
      const nextAbsolutePath = path.join(LOCAL_BUCKET_ROOT, plan.nextRelativePath);
      plans.push({
        ...plan,
        currentAbsolutePath,
        nextAbsolutePath,
        previousPublicUrl: buildPublicUrl(plan.previousRelativePath),
        nextPublicUrl: buildPublicUrl(plan.nextRelativePath)
      });
    }

    if (plans.length === 0) {
      console.log('No legacy local bucket files found.');
      return;
    }

    const urlMap = new Map(plans.map((plan) => [plan.previousPublicUrl, plan.nextPublicUrl]));

    console.log(`Found ${plans.length} legacy file(s).`);
    for (const plan of plans) {
      console.log(`- ${plan.previousRelativePath} -> ${plan.nextRelativePath}`);
    }

    if (!DRY_RUN) {
      for (const plan of plans) {
        await ensureParentDir(plan.nextAbsolutePath);
        await fs.rename(plan.currentAbsolutePath, plan.nextAbsolutePath);
      }
      await removeEmptyDirsRecursively(LOCAL_BUCKET_ROOT);
    }

    const assets = await knex('assets').select(['id', 'image_url']);
    let updatedAssetCount = 0;
    for (const row of assets) {
      const previousUrl = typeof row.image_url === 'string' ? row.image_url : null;
      if (!previousUrl) continue;
      const nextUrl = urlMap.get(previousUrl);
      if (!nextUrl) continue;

      updatedAssetCount += 1;
      if (DRY_RUN) continue;

      await knex('assets')
        .where({ id: row.id })
        .update({ image_url: nextUrl, updated_at: knex.fn.now() });
    }

    const workOrders = await knex('maintenance_work_orders').select(['id', 'open_images_json', 'close_images_json']);
    let updatedWorkOrderCount = 0;
    for (const row of workOrders) {
      const openImages = Array.isArray(row.open_images_json) ? row.open_images_json : [];
      const closeImages = Array.isArray(row.close_images_json) ? row.close_images_json : [];

      let changed = false;
      const nextOpenImages = openImages.map((url) => {
        if (typeof url !== 'string') return url;
        const mapped = urlMap.get(url);
        if (!mapped) return url;
        changed = true;
        return mapped;
      });
      const nextCloseImages = closeImages.map((url) => {
        if (typeof url !== 'string') return url;
        const mapped = urlMap.get(url);
        if (!mapped) return url;
        changed = true;
        return mapped;
      });

      if (!changed) continue;

      updatedWorkOrderCount += 1;
      if (DRY_RUN) continue;

      await knex('maintenance_work_orders')
        .where({ id: row.id })
        .update({
          open_images_json: JSON.stringify(nextOpenImages),
          close_images_json: JSON.stringify(nextCloseImages),
          updated_at: knex.fn.now()
        });
    }

    console.log(`Updated assets rows: ${updatedAssetCount}`);
    console.log(`Updated maintenance work orders: ${updatedWorkOrderCount}`);
    console.log(DRY_RUN ? 'Dry run complete.' : 'Migration complete.');
  } finally {
    await knex.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
