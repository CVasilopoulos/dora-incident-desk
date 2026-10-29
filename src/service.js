import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { DEFAULT_SETTINGS, classify, deadlines, nextDeadline, normaliseFacts, recurringGroup } from './dora.js';
import { REPORT_TYPES, buildReport, toAdf, toStorage } from './reports.js';

const caseKey = (issueKey) => `case:${issueKey}`;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

export class UserError extends Error {}

export async function getSettings() {
  const stored = (await kvs.get('settings')) || {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(input, siteUrl) {
  const current = await getSettings();
  const next = { ...current };
  if (input.totalClients !== undefined) next.totalClients = Math.max(0, Number(input.totalClients) || 0);
  if (input.confluenceSpaceKey !== undefined) next.confluenceSpaceKey = String(input.confluenceSpaceKey || '').trim().toUpperCase();
  if (input.homeMemberState !== undefined) next.homeMemberState = String(input.homeMemberState || '').trim().toUpperCase().slice(0, 2);
  if (input.criticalServices !== undefined) {
    next.criticalServices = (Array.isArray(input.criticalServices) ? input.criticalServices : String(input.criticalServices).split(','))
      .map((s) => String(s).trim())
      .filter(Boolean);
  }
  if (siteUrl) next.siteUrl = siteUrl;
  await kvs.set('settings', next);
  return next;
}

export async function rememberSite(siteUrl) {
  if (!siteUrl) return;
  const s = await getSettings();
  if (s.siteUrl !== siteUrl) await kvs.set('settings', { ...s, siteUrl });
}

export async function fetchIssue(issueKey) {
  const key = String(issueKey || '').trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new UserError(`"${issueKey}" is not a Jira issue key.`);
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=summary,created,status,priority`);
  if (res.status === 404 || res.status === 403) throw new UserError(`Issue ${key} does not exist or you cannot see it.`);
  if (!res.ok) throw new Error(`Jira returned ${res.status} for ${key}`);
  const body = await res.json();
  return {
    key: body.key,
    id: body.id,
    summary: body.fields.summary,
    created: body.fields.created,
    status: body.fields.status && body.fields.status.name,
    statusCategory: body.fields.status && body.fields.status.statusCategory && body.fields.status.statusCategory.key,
    priority: body.fields.priority && body.fields.priority.name,
  };
}

async function loadRecord(issue) {
  const stored = await kvs.get(caseKey(issue.key));
  if (stored) return stored;
  return {
    issueKey: issue.key,
    summary: issue.summary,
    createdAt: new Date().toISOString(),
    facts: normaliseFacts({ awareAt: issue.created }),
    drafts: {},
    history: [],
  };
}

function view(record, issue, settings, now = Date.now()) {
  const facts = normaliseFacts(record.facts);
  const verdict = classify(facts, settings);
  const clock = deadlines(facts, verdict, now);
  return {
    issueKey: record.issueKey,
    summary: issue ? issue.summary : record.summary,
    status: issue ? issue.status : record.status,
    tracked: Boolean(record.updatedAt),
    facts,
    verdict,
    deadlines: clock,
    next: nextDeadline(clock),
    drafts: record.drafts || {},
    history: (record.history || []).slice(-20),
    settings: { totalClients: settings.totalClients, confluenceSpaceKey: settings.confluenceSpaceKey, criticalServices: settings.criticalServices },
  };
}

export async function getCase(issueKey) {
  const issue = await fetchIssue(issueKey);
  const [record, settings] = await Promise.all([loadRecord(issue), getSettings()]);
  return view(record, issue, settings);
}

const FACT_FIELDS = Object.keys(normaliseFacts({})).filter((k) => k !== 'reports');

export async function updateFacts(issueKey, patch, accountId, source = 'panel') {
  const issue = await fetchIssue(issueKey);
  const [record, settings] = await Promise.all([loadRecord(issue), getSettings()]);
  const before = classify(record.facts, settings);
  const facts = normaliseFacts(record.facts);
  const changed = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (!FACT_FIELDS.includes(k) || v === undefined) continue;
    if (JSON.stringify(facts[k]) !== JSON.stringify(v)) {
      facts[k] = v;
      changed.push(k);
    }
  }
  const after = classify(facts, settings);
  if (after.major && !before.major && !facts.classifiedAt) {
    facts.classifiedAt = new Date().toISOString();
    changed.push('classifiedAt');
  }
  const now = new Date().toISOString();
  const history = [...(record.history || [])];
  if (changed.length) history.push({ at: now, source, changed });
  if (after.major !== before.major) {
    history.push({ at: now, source, event: after.major ? 'classified major' : 'no longer major' });
  }
  const next = {
    ...record,
    summary: issue.summary,
    status: issue.status,
    facts: normaliseFacts(facts),
    updatedAt: now,
    major: after.major,
    history: history.slice(-100),
  };
  await kvs.set(caseKey(issue.key), next);
  return { ...view(next, issue, settings), changed };
}

export async function markSubmitted(issueKey, type, at, accountId, source = 'panel') {
  if (!REPORT_TYPES[type]) throw new UserError(`Unknown report type "${type}". Use initial, intermediate or final.`);
  const issue = await fetchIssue(issueKey);
  const [record, settings] = await Promise.all([loadRecord(issue), getSettings()]);
  const facts = normaliseFacts(record.facts);
  const stamp = at ? new Date(at).toISOString() : new Date().toISOString();
  if (type === 'initial') facts.reports.initialSubmittedAt = stamp;
  if (type === 'intermediate') facts.reports.intermediateSubmittedAt = [...facts.reports.intermediateSubmittedAt, stamp];
  if (type === 'final') facts.reports.finalSubmittedAt = stamp;
  const history = [...(record.history || []), { at: new Date().toISOString(), source, event: `${REPORT_TYPES[type]} submitted ${stamp}` }];
  const next = { ...record, facts, updatedAt: new Date().toISOString(), history: history.slice(-100) };
  await kvs.set(caseKey(issue.key), next);
  return view(next, issue, settings);
}

async function confluencePage(settings, report) {
  if (!settings.confluenceSpaceKey) return null;
  const spaces = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?keys=${settings.confluenceSpaceKey}`);
  if (!spaces.ok) return null;
  const space = ((await spaces.json()).results || [])[0];
  if (!space) return null;
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      spaceId: space.id,
      status: 'current',
      title: `${report.title} (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
      body: { representation: 'storage', value: toStorage(report) },
    }),
  });
  if (!res.ok) return null;
  const page = await res.json();
  const base = (page._links && page._links.base) || '';
  return { target: 'confluence', id: page.id, url: page._links && page._links.webui ? `${base}${page._links.webui}` : '' };
}

async function jiraComment(issue, report, settings) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issue.key}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ body: toAdf(report) }),
  });
  if (!res.ok) throw new Error(`Could not add the draft as a comment (Jira ${res.status}).`);
  const c = await res.json();
  return {
    target: 'jira-comment',
    id: c.id,
    url: settings.siteUrl ? `${settings.siteUrl}/browse/${issue.key}?focusedCommentId=${c.id}` : '',
  };
}

export async function draftReport(issueKey, type, accountId, source = 'panel') {
  if (!REPORT_TYPES[type]) throw new UserError(`Unknown report type "${type}". Use initial, intermediate or final.`);
  const issue = await fetchIssue(issueKey);
  const [record, settings] = await Promise.all([loadRecord(issue), getSettings()]);
  const report = buildReport(type, issue, record.facts, settings);
  const placed = (await confluencePage(settings, report)) || (await jiraComment(issue, report, settings));
  const drafts = { ...(record.drafts || {}), [type]: { ...placed, at: new Date().toISOString(), missing: report.missing } };
  const history = [...(record.history || []), { at: new Date().toISOString(), source, event: `${REPORT_TYPES[type]} drafted (${placed.target})` }];
  const next = { ...record, drafts, updatedAt: new Date().toISOString(), history: history.slice(-100) };
  await kvs.set(caseKey(issue.key), next);
  return { report: { title: report.title, missing: report.missing, major: report.major }, placed, case: view(next, issue, settings) };
}

export async function allRecords() {
  const out = [];
  let cursor;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith('case:')).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor && out.length < 1000);
  return out;
}

export async function listCases({ onlyMajor = false, limit = 25 } = {}) {
  const [records, settings] = await Promise.all([allRecords(), getSettings()]);
  const now = Date.now();
  const rows = [];
  for (const r of records) {
    if (!r.updatedAt) continue;
    let issue;
    try {
      issue = await fetchIssue(r.issueKey);
    } catch (e) {
      continue;
    }
    const v = view(r, issue, settings, now);
    if (onlyMajor && !v.verdict.major) continue;
    rows.push({
      issueKey: v.issueKey,
      summary: v.summary,
      status: v.status,
      major: v.verdict.major,
      thresholdsMet: v.verdict.thresholdsMet,
      next: v.next ? { report: v.next.name, due: v.next.due, status: v.next.status } : null,
      providers: v.facts.providers,
    });
  }
  rows.sort((a, b) => {
    const da = a.next && a.next.due ? new Date(a.next.due).getTime() : Infinity;
    const db = b.next && b.next.due ? new Date(b.next.due).getTime() : Infinity;
    return da - db;
  });
  return rows.slice(0, Math.max(1, Math.min(Number(limit) || 25, 100)));
}

export async function recurringCheck(issueKey) {
  const issue = await fetchIssue(issueKey);
  const [records, settings] = await Promise.all([allRecords(), getSettings()]);
  const cases = records.filter((r) => r.updatedAt).map((r) => ({ issueKey: r.issueKey, facts: normaliseFacts(r.facts) }));
  const group = recurringGroup(cases, issue.key);
  if (group.length < 2) {
    return { recurring: false, related: group.map((g) => g.issueKey), note: 'Fewer than two incidents with the same apparent root cause in the last 6 months.' };
  }
  const sum = (k) => group.reduce((n, g) => n + (Number(g.facts[k]) || 0), 0);
  const any = (k) => group.some((g) => Boolean(g.facts[k]));
  const combined = {
    criticalServicesAffected: any('criticalServicesAffected'),
    clientsAffected: sum('clientsAffected') || null,
    counterpartsAffectedPct: Math.min(100, sum('counterpartsAffectedPct')) || null,
    transactionsAffectedPct: Math.min(100, sum('transactionsAffectedPct')) || null,
    transactionValueAffectedPct: Math.min(100, sum('transactionValueAffectedPct')) || null,
    relevantClientsAffected: any('relevantClientsAffected'),
    mediaCoverage: any('mediaCoverage'),
    repeatedComplaints: any('repeatedComplaints'),
    regulatoryBreach: any('regulatoryBreach'),
    clientLossLikely: any('clientLossLikely'),
    durationHours: sum('durationHours') || null,
    downtimeHours: sum('downtimeHours') || null,
    memberStates: [...new Set(group.flatMap((g) => g.facts.memberStates))],
    dataImpact: any('dataImpact'),
    maliciousAccess: any('maliciousAccess'),
    economicImpactEur: sum('economicImpactEur') || null,
  };
  const verdict = classify(combined, settings);
  return {
    recurring: true,
    related: group.map((g) => g.issueKey),
    collectivelyMajor: verdict.major,
    verdict,
    note: 'Recurring incidents (Art. 8(2), Delegated Regulation (EU) 2024/1772): non-major incidents with the same apparent root cause that occur at least twice in 6 months are assessed together monthly.',
  };
}
