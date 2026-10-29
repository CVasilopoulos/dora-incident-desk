export const HOUR = 3600 * 1000;

export const MEMBER_STATES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
];

export const DEFAULT_SETTINGS = {
  totalClients: 0,
  confluenceSpaceKey: '',
  homeMemberState: 'GR',
  criticalServices: [],
};

export const EMPTY_FACTS = {
  occurredAt: '',
  awareAt: '',
  classifiedAt: '',
  resolvedAt: '',
  criticalServicesAffected: false,
  criticalServicesNotes: '',
  clientsAffected: null,
  clientsAffectedPct: null,
  counterpartsAffectedPct: null,
  transactionsAffectedPct: null,
  transactionValueAffectedPct: null,
  relevantClientsAffected: false,
  mediaCoverage: false,
  repeatedComplaints: false,
  regulatoryBreach: false,
  clientLossLikely: false,
  durationHours: null,
  downtimeHours: null,
  memberStates: [],
  dataImpact: false,
  maliciousAccess: false,
  economicImpactEur: null,
  rootCause: '',
  providers: [],
  reports: {
    initialSubmittedAt: '',
    intermediateSubmittedAt: [],
    finalSubmittedAt: '',
  },
};

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

const time = (v) => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

export function normaliseFacts(raw = {}) {
  const facts = { ...EMPTY_FACTS, ...raw, reports: { ...EMPTY_FACTS.reports, ...(raw.reports || {}) } };
  facts.memberStates = [...new Set((facts.memberStates || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  facts.providers = [...new Set((facts.providers || []).map((s) => String(s).trim()).filter(Boolean))];
  if (!Array.isArray(facts.reports.intermediateSubmittedAt)) {
    facts.reports.intermediateSubmittedAt = facts.reports.intermediateSubmittedAt ? [facts.reports.intermediateSubmittedAt] : [];
  }
  return facts;
}

export function derivedHours(facts) {
  const start = time(facts.occurredAt) ?? time(facts.awareAt);
  const end = time(facts.resolvedAt);
  if (start === null || end === null || end < start) return null;
  return Math.round(((end - start) / HOUR) * 10) / 10;
}

export function clientsPct(facts, settings) {
  const explicit = num(facts.clientsAffectedPct);
  if (explicit !== null) return explicit;
  const affected = num(facts.clientsAffected);
  const total = num(settings.totalClients);
  if (affected === null || !total) return null;
  return Math.round((affected / total) * 1000) / 10;
}

export function classify(rawFacts, settings = DEFAULT_SETTINGS) {
  const facts = normaliseFacts(rawFacts);
  const criteria = [];
  const unknown = [];

  const pct = clientsPct(facts, settings);
  const clients = num(facts.clientsAffected);
  const counterparts = num(facts.counterpartsAffectedPct);
  const txCount = num(facts.transactionsAffectedPct);
  const txValue = num(facts.transactionValueAffectedPct);
  const clientReasons = [];
  if (pct !== null && pct > 10) clientReasons.push(`${pct}% of clients using the service affected (> 10%)`);
  if (clients !== null && clients > 100000) clientReasons.push(`${clients.toLocaleString('en-GB')} clients affected (> 100,000)`);
  if (counterparts !== null && counterparts > 30) clientReasons.push(`${counterparts}% of financial counterparts affected (> 30%)`);
  if (txCount !== null && txCount > 10) clientReasons.push(`${txCount}% of daily average transactions affected (> 10%)`);
  if (txValue !== null && txValue > 10) clientReasons.push(`${txValue}% of daily average transaction value affected (> 10%)`);
  if (facts.relevantClientsAffected) clientReasons.push('relevant clients or financial counterparts affected');
  if (pct === null && clients === null && counterparts === null && txCount === null && txValue === null && !facts.relevantClientsAffected) {
    unknown.push('clients');
  }
  criteria.push({
    id: 'clients',
    name: 'Clients, financial counterparts and transactions',
    article: 'Art. 9(1)',
    met: clientReasons.length > 0,
    reason: clientReasons.join('; ') || 'below thresholds',
  });

  const repReasons = [];
  if (facts.mediaCoverage) repReasons.push('reflected in the media');
  if (facts.repeatedComplaints) repReasons.push('repeated complaints from different clients or counterparts');
  if (facts.regulatoryBreach) repReasons.push('will not, or is likely not to, meet regulatory requirements');
  if (facts.clientLossLikely) repReasons.push('likely loss of clients or counterparts with a material business impact');
  criteria.push({
    id: 'reputation',
    name: 'Reputational impact',
    article: 'Art. 9(2)',
    met: repReasons.length > 0,
    reason: repReasons.join('; ') || 'no reputational condition met',
  });

  const duration = num(facts.durationHours) ?? derivedHours(facts);
  const downtime = num(facts.downtimeHours);
  const durReasons = [];
  if (duration !== null && duration > 24) durReasons.push(`duration ${duration} h (> 24 h)`);
  if (downtime !== null && downtime > 2) durReasons.push(`downtime of critical-function services ${downtime} h (> 2 h)`);
  if (duration === null && downtime === null) unknown.push('duration');
  criteria.push({
    id: 'duration',
    name: 'Duration and service downtime',
    article: 'Art. 9(3)',
    met: durReasons.length > 0,
    reason: durReasons.join('; ') || 'below thresholds',
  });

  const states = facts.memberStates;
  criteria.push({
    id: 'geography',
    name: 'Geographical spread',
    article: 'Art. 9(4)',
    met: states.length >= 2,
    reason: states.length ? `impact in ${states.length} Member State${states.length === 1 ? '' : 's'} (${states.join(', ')})` : 'no Member States recorded',
  });

  const dataReasons = [];
  if (facts.dataImpact) dataReasons.push('impact on availability, authenticity, integrity or confidentiality of data with an adverse effect on business objectives or regulatory compliance');
  if (facts.maliciousAccess) dataReasons.push('successful, malicious and unauthorised access that may result in data losses');
  criteria.push({
    id: 'data',
    name: 'Data losses',
    article: 'Art. 9(5)',
    met: dataReasons.length > 0,
    reason: dataReasons.join('; ') || 'no data loss recorded',
  });

  const cost = num(facts.economicImpactEur);
  if (cost === null) unknown.push('economic');
  criteria.push({
    id: 'economic',
    name: 'Economic impact',
    article: 'Art. 9(6)',
    met: cost !== null && cost > 100000,
    reason: cost === null ? 'not estimated yet' : `EUR ${cost.toLocaleString('en-GB')} (threshold EUR 100,000)`,
  });

  const otherMet = criteria.filter((c) => c.met);
  const critical = Boolean(facts.criticalServicesAffected);
  let major = false;
  let rule = '';
  if (!critical) {
    rule = 'Not major: no critical service affected (Art. 8(1) requires it).';
  } else if (facts.maliciousAccess) {
    major = true;
    rule = 'Major: critical services affected and malicious unauthorised access (Art. 8(1)(a), Art. 9(5)(b)).';
  } else if (otherMet.length >= 2) {
    major = true;
    rule = `Major: critical services affected and ${otherMet.length} materiality thresholds met (Art. 8(1)(b)).`;
  } else {
    rule = `Not major yet: critical services affected but ${otherMet.length} of the 2 required thresholds met (Art. 8(1)(b)).`;
  }

  return {
    major,
    rule,
    criticalServicesAffected: critical,
    thresholdsMet: otherMet.length,
    criteria,
    unknown,
    durationHours: duration,
    clientsAffectedPct: pct,
  };
}

const iso = (t) => (t === null ? '' : new Date(t).toISOString());

const addMonth = (t) => {
  const d = new Date(t);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.getTime();
};

export function deadlines(rawFacts, verdict, now = Date.now()) {
  const facts = normaliseFacts(rawFacts);
  const aware = time(facts.awareAt);
  const classified = time(facts.classifiedAt);
  const initialAt = time(facts.reports.initialSubmittedAt);
  const intermediates = facts.reports.intermediateSubmittedAt.map(time).filter((t) => t !== null).sort((a, b) => a - b);
  const lastIntermediate = intermediates.length ? intermediates[intermediates.length - 1] : null;
  const finalAt = time(facts.reports.finalSubmittedAt);

  const items = [];
  const status = (due, done) => {
    if (done !== null) return due !== null && done > due ? 'submitted late' : 'submitted';
    if (due === null) return 'not started';
    if (now > due) return 'overdue';
    if (due - now < 4 * HOUR) return 'due soon';
    return 'open';
  };

  if (!verdict.major) {
    return {
      applies: false,
      note: 'No reporting clock: the incident is not classified as major. Reassess when facts change; recurring incidents with the same apparent root cause within 6 months are assessed together (Art. 8(2)).',
      items,
    };
  }

  let initialDue = null;
  let initialBasis = '';
  if (classified !== null) {
    const fromClassification = classified + 4 * HOUR;
    if (aware !== null && classified <= aware + 24 * HOUR) {
      initialDue = Math.min(fromClassification, aware + 24 * HOUR);
      initialBasis = initialDue === fromClassification
        ? '4 h after classification as major'
        : '24 h after the entity became aware of the incident';
    } else {
      initialDue = fromClassification;
      initialBasis = aware === null ? '4 h after classification as major' : 'classified after 24 h: 4 h after classification';
    }
  } else if (aware !== null) {
    initialDue = aware + 24 * HOUR;
    initialBasis = 'classification time missing: latest is 24 h after awareness';
  }
  items.push({
    id: 'initial',
    name: 'Initial notification',
    due: iso(initialDue),
    basis: initialBasis || 'set the awareness and classification times',
    submittedAt: iso(initialAt),
    status: status(initialDue, initialAt),
  });

  const intermediateDue = initialAt === null ? null : initialAt + 72 * HOUR;
  items.push({
    id: 'intermediate',
    name: 'Intermediate report',
    due: iso(intermediateDue),
    basis: initialAt === null ? 'starts when the initial notification is submitted' : '72 h after the initial notification',
    submittedAt: iso(intermediates.length ? intermediates[0] : null),
    status: status(intermediateDue, intermediates.length ? intermediates[0] : null),
  });

  const finalDue = lastIntermediate === null ? null : addMonth(lastIntermediate);
  items.push({
    id: 'final',
    name: 'Final report',
    due: iso(finalDue),
    basis: lastIntermediate === null ? 'starts when the intermediate report is submitted' : 'one month after the latest intermediate report',
    submittedAt: iso(finalAt),
    status: status(finalDue, finalAt),
  });

  return {
    applies: true,
    note: 'Time limits from Delegated Regulation (EU) 2025/301, Art. 5. An updated intermediate report is also due without undue delay once regular activities are recovered.',
    items,
  };
}

export function nextDeadline(dl) {
  if (!dl.applies) return null;
  return dl.items.find((i) => i.due && !i.submittedAt) || null;
}

export function sameRootCause(a, b) {
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(a) !== '' && norm(a) === norm(b);
}

export function recurringGroup(cases, issueKey, now = Date.now()) {
  const me = cases.find((c) => c.issueKey === issueKey);
  if (!me || !me.facts.rootCause) return [];
  const since = now - 183 * 24 * HOUR;
  return cases.filter((c) => {
    const t = time(c.facts.occurredAt) ?? time(c.facts.awareAt);
    return sameRootCause(c.facts.rootCause, me.facts.rootCause) && t !== null && t >= since;
  });
}
