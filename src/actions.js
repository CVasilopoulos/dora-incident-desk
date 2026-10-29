import { syncGraphQuietly } from './graphsync.js';
import { UserError, draftReport, getCase, listCases, markSubmitted, recurringCheck, updateFacts } from './service.js';

const keyFrom = (payload) => {
  const fromInput = payload && payload.issueKey;
  const fromContext = payload && payload.context && payload.context.jira && payload.context.jira.issueKey;
  const key = fromInput || fromContext;
  if (!key) throw new UserError('Tell me which incident: give its Jira issue key, for example INC-12, or open the incident and ask again.');
  return String(key).trim().toUpperCase();
};

const account = (payload, context) => (context && context.principal && context.principal.accountId) || (context && context.accountId) || (payload && payload.context && payload.context.accountId) || null;

const run = (fn) => async (payload, context) => {
  try {
    return await fn(payload || {}, context || {});
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error(e);
    return { error: 'The DORA Incident Desk action failed. Ask an admin to check the app logs.' };
  }
};

const compact = (c) => ({
  issueKey: c.issueKey,
  summary: c.summary,
  major: c.verdict.major,
  verdict: c.verdict.rule,
  criteria: c.verdict.criteria.map((x) => ({ criterion: x.name, article: x.article, met: x.met, reason: x.reason })),
  unknownCriteria: c.verdict.unknown,
  reporting: c.deadlines.applies ? c.deadlines.items.map((i) => ({ report: i.name, due: i.due || null, status: i.status, basis: i.basis, submittedAt: i.submittedAt || null })) : c.deadlines.note,
  nextDeadline: c.next ? { report: c.next.name, due: c.next.due, status: c.next.status } : null,
  facts: c.facts,
  drafts: c.drafts,
});

export const getDoraCase = run(async (payload) => compact(await getCase(keyFrom(payload))));

const BOOLEAN_INPUTS = ['criticalServicesAffected', 'relevantClientsAffected', 'mediaCoverage', 'repeatedComplaints', 'regulatoryBreach', 'clientLossLikely', 'dataImpact', 'maliciousAccess'];
const NUMBER_INPUTS = ['clientsAffected', 'clientsAffectedPct', 'counterpartsAffectedPct', 'transactionsAffectedPct', 'transactionValueAffectedPct', 'durationHours', 'downtimeHours', 'economicImpactEur'];
const TIME_INPUTS = ['occurredAt', 'awareAt', 'resolvedAt'];
const TEXT_INPUTS = ['criticalServicesNotes', 'rootCause'];

export const recordDoraFacts = run(async (payload, context) => {
  const patch = {};
  for (const k of BOOLEAN_INPUTS) if (typeof payload[k] === 'boolean') patch[k] = payload[k];
  for (const k of NUMBER_INPUTS) if (payload[k] !== undefined && payload[k] !== null && payload[k] !== '' && !Number.isNaN(Number(payload[k]))) patch[k] = Number(payload[k]);
  for (const k of TIME_INPUTS) {
    if (payload[k]) {
      const t = new Date(payload[k]);
      if (Number.isNaN(t.getTime())) throw new UserError(`${k} "${payload[k]}" is not a date and time. Use ISO 8601, for example 2026-11-03T08:15:00Z.`);
      patch[k] = t.toISOString();
    }
  }
  for (const k of TEXT_INPUTS) if (typeof payload[k] === 'string' && payload[k].trim()) patch[k] = payload[k].trim();
  if (typeof payload.memberStates === 'string' && payload.memberStates.trim()) patch.memberStates = payload.memberStates.split(/[,\s]+/).filter(Boolean);
  if (typeof payload.providers === 'string' && payload.providers.trim()) patch.providers = payload.providers.split(',').map((s) => s.trim()).filter(Boolean);
  if (!Object.keys(patch).length) throw new UserError('No facts to record. Give at least one value, for example clientsAffected or economicImpactEur.');
  const c = await updateFacts(keyFrom(payload), patch, account(payload, context), 'rovo');
  if (c.changed.includes('providers')) await syncGraphQuietly();
  return { recorded: c.changed, ...compact(c) };
});

export const draftDoraReport = run(async (payload, context) => {
  const type = String(payload.reportType || '').trim().toLowerCase();
  const out = await draftReport(keyFrom(payload), type, account(payload, context), 'rovo');
  return {
    drafted: out.report.title,
    placedIn: out.placed.target === 'confluence' ? 'Confluence page' : 'Jira comment on the incident',
    url: out.placed.url || null,
    fieldsStillToComplete: out.report.missing,
    major: out.report.major,
  };
});

export const markDoraReportSubmitted = run(async (payload, context) => {
  const type = String(payload.reportType || '').trim().toLowerCase();
  return compact(await markSubmitted(keyFrom(payload), type, payload.submittedAt, account(payload, context), 'rovo'));
});

export const listDoraCases = run(async (payload) => ({ cases: await listCases({ onlyMajor: Boolean(payload.onlyMajor), limit: payload.limit }) }));

export const checkRecurringIncidents = run(async (payload) => recurringCheck(keyFrom(payload)));
