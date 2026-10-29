import { graph } from '@forge/teamwork-graph';
import { kvs } from '@forge/kvs';
import { allRecords, getSettings } from './service.js';
import { matchProvider, parseRegister, toGraphObject } from './register.js';

export async function getRegister() {
  const [register, connection, lastSync] = await Promise.all([kvs.get('register'), kvs.get('graph-connection'), kvs.get('graph-sync')]);
  return {
    csv: (register && register.csv) || '',
    entries: (register && register.entries) || [],
    errors: (register && register.errors) || [],
    updatedAt: (register && register.updatedAt) || '',
    connected: Boolean(connection && connection.connectionId),
    lastSync: lastSync || null,
  };
}

export async function saveRegister(csv) {
  const previous = (await kvs.get('register')) || { entries: [] };
  const { entries, errors } = parseRegister(csv);
  const created = Object.fromEntries((previous.entries || []).map((e) => [e.id, e.createdAt]));
  const stamped = entries.map((e) => ({ ...e, createdAt: created[e.id] || new Date().toISOString() }));
  await kvs.set('register', { csv: String(csv || ''), entries: stamped, errors, updatedAt: new Date().toISOString() });
  await syncGraph();
  return getRegister();
}

async function incidentsByProvider(entries) {
  const records = await allRecords();
  const map = Object.fromEntries(entries.map((e) => [e.id, []]));
  for (const r of records) {
    if (!r.updatedAt) continue;
    for (const name of (r.facts && r.facts.providers) || []) {
      const e = matchProvider(entries, name);
      if (e && !map[e.id].includes(r.issueKey)) map[e.id].push(r.issueKey);
    }
  }
  return map;
}

export async function syncGraph() {
  const connection = await kvs.get('graph-connection');
  if (!connection || !connection.connectionId) return { synced: false, reason: 'No Teamwork Graph connection yet. An org admin adds it under Connected apps.' };
  const register = (await kvs.get('register')) || { entries: [] };
  const entries = register.entries || [];
  if (!entries.length) return { synced: false, reason: 'The register is empty.' };
  const [settings, incidents] = await Promise.all([getSettings(), incidentsByProvider(entries)]);
  const sequence = Date.now();
  let accepted = 0;
  let rejected = 0;
  let error = '';
  for (let i = 0; i < entries.length; i += 100) {
    const objects = entries.slice(i, i + 100).map((e) => toGraphObject(e, incidents[e.id] || [], settings.siteUrl, sequence));
    const res = await graph.setObjects({ objects, connectionId: connection.connectionId });
    if (!res.success) error = res.error || 'setObjects failed';
    accepted += (res.results && res.results.accepted && res.results.accepted.length) || 0;
    rejected += (res.results && res.results.rejected && res.results.rejected.length) || 0;
    if (res.results && res.results.rejected && res.results.rejected.length) console.warn(JSON.stringify(res.results.rejected).slice(0, 2000));
  }
  const summary = { at: new Date().toISOString(), accepted, rejected, error };
  await kvs.set('graph-sync', summary);
  return { synced: !error, ...summary };
}

export async function syncGraphQuietly() {
  try {
    await syncGraph();
  } catch (e) {
    console.error('Teamwork Graph sync failed', e);
  }
}

export const onConnectionChange = async (request) => {
  const action = request && request.action;
  if (action === 'DELETED') {
    await kvs.delete('graph-connection');
    return { success: true, message: 'Connection removed.' };
  }
  await kvs.set('graph-connection', { connectionId: request.connectionId, name: request.name || '', at: new Date().toISOString() });
  try {
    const r = await syncGraph();
    return { success: true, message: r.synced ? `Imported ${r.accepted} ICT providers.` : r.reason };
  } catch (e) {
    console.error(e);
    return { success: true, message: 'Connected. The first import will run when the register is saved.' };
  }
};
