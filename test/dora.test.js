import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, classify, deadlines, recurringGroup } from '../src/dora.js';
import { buildReport, toAdf, toStorage } from '../src/reports.js';

const settings = { totalClients: 200000, homeMemberState: 'GR', criticalServices: [], confluenceSpaceKey: '' };

test('an incident that does not touch critical services is never major', () => {
  const v = classify({ criticalServicesAffected: false, clientsAffected: 150000, economicImpactEur: 500000, memberStates: ['GR', 'CY'] }, settings);
  assert.equal(v.major, false);
  assert.equal(v.thresholdsMet, 3);
  assert.match(v.rule, /no critical service/);
});

test('critical services plus malicious unauthorised access is major on its own', () => {
  const v = classify({ criticalServicesAffected: true, maliciousAccess: true }, settings);
  assert.equal(v.major, true);
  assert.match(v.rule, /Art\. 8\(1\)\(a\)/);
});

test('critical services plus two materiality thresholds is major', () => {
  const v = classify({ criticalServicesAffected: true, downtimeHours: 3, economicImpactEur: 120000 }, settings);
  assert.equal(v.major, true);
  assert.equal(v.thresholdsMet, 2);
});

test('critical services plus one threshold is not yet major', () => {
  const v = classify({ criticalServicesAffected: true, downtimeHours: 3 }, settings);
  assert.equal(v.major, false);
  assert.match(v.rule, /1 of the 2/);
});

test('thresholds are strict: exactly 10%, 100,000 clients, 2 h downtime, 24 h and EUR 100,000 do not count', () => {
  const v = classify({
    criticalServicesAffected: true,
    clientsAffected: 100000,
    clientsAffectedPct: 10,
    downtimeHours: 2,
    durationHours: 24,
    economicImpactEur: 100000,
    memberStates: ['GR'],
  }, settings);
  assert.equal(v.thresholdsMet, 0);
});

test('client share is computed from the total client base when no percentage is given', () => {
  const v = classify({ criticalServicesAffected: true, clientsAffected: 25000 }, settings);
  assert.equal(v.clientsAffectedPct, 12.5);
  assert.equal(v.criteria.find((c) => c.id === 'clients').met, true);
});

test('duration is derived from occurrence and resolution times', () => {
  const v = classify({ criticalServicesAffected: true, occurredAt: '2026-11-02T08:00:00Z', resolvedAt: '2026-11-03T10:30:00Z' }, settings);
  assert.equal(v.durationHours, 26.5);
  assert.equal(v.criteria.find((c) => c.id === 'duration').met, true);
});

test('two Member States meet the geographical spread threshold', () => {
  const v = classify({ criticalServicesAffected: true, memberStates: ['gr', 'CY', 'GR'] }, settings);
  assert.equal(v.criteria.find((c) => c.id === 'geography').met, true);
});

test('unknown criteria are reported so the agent can ask for them', () => {
  const v = classify({ criticalServicesAffected: true }, settings);
  assert.deepEqual(v.unknown.sort(), ['clients', 'duration', 'economic']);
});

test('initial notification is due 4 h after classification when that comes first', () => {
  const v = { major: true };
  const d = deadlines({ awareAt: '2026-11-02T08:00:00Z', classifiedAt: '2026-11-02T10:00:00Z' }, v, Date.parse('2026-11-02T11:00:00Z'));
  const initial = d.items.find((i) => i.id === 'initial');
  assert.equal(initial.due, '2026-11-02T14:00:00.000Z');
  assert.equal(initial.status, 'due soon');
});

test('initial notification is capped at 24 h after awareness', () => {
  const d = deadlines({ awareAt: '2026-11-02T08:00:00Z', classifiedAt: '2026-11-03T06:00:00Z' }, { major: true }, Date.parse('2026-11-03T06:30:00Z'));
  assert.equal(d.items.find((i) => i.id === 'initial').due, '2026-11-03T08:00:00.000Z');
});

test('late classification after 24 h gives 4 h from classification', () => {
  const d = deadlines({ awareAt: '2026-11-01T08:00:00Z', classifiedAt: '2026-11-03T06:00:00Z' }, { major: true }, Date.parse('2026-11-03T06:30:00Z'));
  assert.equal(d.items.find((i) => i.id === 'initial').due, '2026-11-03T10:00:00.000Z');
});

test('intermediate is 72 h after the initial notification and final one month after the latest intermediate', () => {
  const facts = {
    awareAt: '2026-11-02T08:00:00Z',
    classifiedAt: '2026-11-02T09:00:00Z',
    reports: { initialSubmittedAt: '2026-11-02T12:00:00Z', intermediateSubmittedAt: ['2026-11-04T12:00:00Z', '2026-11-30T09:00:00Z'] },
  };
  const d = deadlines(facts, { major: true }, Date.parse('2026-12-01T00:00:00Z'));
  assert.equal(d.items.find((i) => i.id === 'intermediate').due, '2026-11-05T12:00:00.000Z');
  assert.equal(d.items.find((i) => i.id === 'intermediate').status, 'submitted');
  assert.equal(d.items.find((i) => i.id === 'final').due, '2026-12-30T09:00:00.000Z');
});

test('a month after 31 January ends on the last day of February', () => {
  const facts = { awareAt: '2027-01-30T08:00:00Z', classifiedAt: '2027-01-30T09:00:00Z', reports: { initialSubmittedAt: '2027-01-30T10:00:00Z', intermediateSubmittedAt: ['2027-01-31T10:00:00Z'] } };
  const d = deadlines(facts, { major: true }, Date.parse('2027-02-01T00:00:00Z'));
  assert.equal(d.items.find((i) => i.id === 'final').due, '2027-02-28T10:00:00.000Z');
});

test('overdue reports are flagged', () => {
  const d = deadlines({ awareAt: '2026-11-02T08:00:00Z', classifiedAt: '2026-11-02T09:00:00Z' }, { major: true }, Date.parse('2026-11-02T13:30:00Z'));
  assert.equal(d.items.find((i) => i.id === 'initial').status, 'overdue');
});

test('non-major incidents have no reporting clock', () => {
  const d = deadlines({ awareAt: '2026-11-02T08:00:00Z' }, { major: false });
  assert.equal(d.applies, false);
});

test('recurring incidents group by the same root cause within 6 months', () => {
  const now = Date.parse('2026-11-10T00:00:00Z');
  const cases = [
    { issueKey: 'INC-1', facts: { rootCause: 'Expired TLS certificate', occurredAt: '2026-10-01T00:00:00Z' } },
    { issueKey: 'INC-2', facts: { rootCause: ' expired tls  certificate', occurredAt: '2026-11-05T00:00:00Z' } },
    { issueKey: 'INC-3', facts: { rootCause: 'Expired TLS certificate', occurredAt: '2026-03-01T00:00:00Z' } },
    { issueKey: 'INC-4', facts: { rootCause: 'DDoS', occurredAt: '2026-11-06T00:00:00Z' } },
  ];
  assert.deepEqual(recurringGroup(cases, 'INC-2', now).map((c) => c.issueKey), ['INC-1', 'INC-2']);
});

test('report drafts mark missing fields and render to Confluence storage and ADF', () => {
  const facts = { criticalServicesAffected: true, maliciousAccess: true, awareAt: '2026-11-02T08:00:00Z', classifiedAt: '2026-11-02T09:00:00Z', memberStates: ['GR'] };
  const r = buildReport('initial', { key: 'INC-7', summary: 'Card payments down' }, facts, settings, Date.parse('2026-11-02T10:00:00Z'));
  assert.equal(r.major, true);
  assert.ok(r.missing > 0);
  assert.match(toStorage(r), /<table>/);
  assert.equal(toAdf(r).type, 'doc');
  assert.ok(r.sections.find((s) => s.heading === 'General information').rows.some(([k, v]) => k === 'Report due' && v === '2026-11-02 13:00 UTC'));
});

test('HOUR is one hour in milliseconds', () => {
  assert.equal(HOUR, 3600000);
});
