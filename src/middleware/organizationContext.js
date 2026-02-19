import db from '../db/knex.js';

export async function loadOrganizationContext(req, res, next) {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  try {
    const organization = await db('organizations').where({ id: organizationId }).first(['id', 'name', 'code']);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    req.organizationId = organizationId;
    req.organization = organization;
    return next();
  } catch {
    return res.status(500).json({ message: 'Failed to resolve organization' });
  }
}
