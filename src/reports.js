import { classify, deadlines, normaliseFacts } from './dora.js';

export const REPORT_TYPES = {
  initial: 'Initial notification',
  intermediate: 'Intermediate report',
  final: 'Final report',
};

const TODO = '[to complete]';

const show = (v, suffix = '') => (v === null || v === undefined || v === '' ? TODO : `${v}${suffix}`);

const when = (v) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : TODO);

const yes = (b) => (b ? 'Yes' : 'No');

export function buildReport(type, issue, rawFacts, settings, now = Date.now()) {
  const facts = normaliseFacts(rawFacts);
  const verdict = classify(facts, settings);
  const clock = deadlines(facts, verdict, now);
  const due = clock.items.find((i) => i.id === type);
  const met = verdict.criteria.filter((c) => c.met);

  const sections = [];
  sections.push({
    heading: 'General information',
    rows: [
      ['Report type', REPORT_TYPES[type]],
      ['Incident reference', issue.key],
      ['Incident title', issue.summary || TODO],
      ['Home Member State', settings.homeMemberState || TODO],
      ['Report due', due && due.due ? when(due.due) : TODO],
      ['Prepared', when(new Date(now).toISOString())],
    ],
  });

  sections.push({
    heading: 'Timeline',
    rows: [
      ['Incident occurred', when(facts.occurredAt)],
      ['Entity became aware', when(facts.awareAt)],
      ['Classified as major', when(facts.classifiedAt)],
      ['Resolved', type === 'initial' ? (facts.resolvedAt ? when(facts.resolvedAt) : 'Ongoing') : when(facts.resolvedAt)],
    ],
  });

  sections.push({
    heading: 'Classification (Delegated Regulation (EU) 2024/1772)',
    rows: [
      ['Verdict', verdict.rule],
      ['Critical services affected', `${yes(verdict.criticalServicesAffected)}${facts.criticalServicesNotes ? `: ${facts.criticalServicesNotes}` : ''}`],
      ...verdict.criteria.map((c) => [`${c.name} (${c.article})`, `${c.met ? 'Met' : 'Not met'}: ${c.reason}`]),
    ],
  });

  sections.push({
    heading: 'Impact',
    rows: [
      ['Clients affected', show(facts.clientsAffected)],
      ['Share of clients affected', show(verdict.clientsAffectedPct, '%')],
      ['Member States affected', facts.memberStates.length ? facts.memberStates.join(', ') : TODO],
      ['Duration', show(verdict.durationHours, ' h')],
      ['Downtime of critical-function services', show(facts.downtimeHours, ' h')],
      ['Estimated economic impact', facts.economicImpactEur === null || facts.economicImpactEur === '' ? TODO : `EUR ${Number(facts.economicImpactEur).toLocaleString('en-GB')}`],
      ['ICT third-party providers involved', facts.providers.length ? facts.providers.join(', ') : 'None recorded'],
    ],
  });

  if (type !== 'initial') {
    sections.push({
      heading: 'Handling and recovery',
      rows: [
        ['Actions taken to recover', TODO],
        ['Regular activities recovered', facts.resolvedAt ? `Yes, ${when(facts.resolvedAt)}` : 'Not yet'],
        ['Communication to clients', TODO],
      ],
    });
  }

  if (type === 'final') {
    sections.push({
      heading: 'Root cause and lessons learned',
      rows: [
        ['Root cause', show(facts.rootCause)],
        ['Direct and indirect costs and losses', facts.economicImpactEur === null || facts.economicImpactEur === '' ? TODO : `EUR ${Number(facts.economicImpactEur).toLocaleString('en-GB')}`],
        ['Measures to prevent recurrence', TODO],
      ],
    });
  }

  const missing = sections.reduce((n, s) => n + s.rows.filter((r) => String(r[1]).includes(TODO)).length, 0);
  return {
    type,
    title: `DORA ${REPORT_TYPES[type]}: ${issue.key} ${issue.summary || ''}`.trim().slice(0, 240),
    major: verdict.major,
    criteriaMet: met.map((c) => c.name),
    missing,
    sections,
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toStorage(report) {
  const intro = `<p><em>Draft prepared by DORA Incident Desk from the Jira incident. Fields marked ${esc(TODO)} need input before submission to the competent authority.</em></p>`;
  const body = report.sections.map((s) => `<h2>${esc(s.heading)}</h2><table><tbody>${s.rows
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('')}</tbody></table>`).join('');
  return intro + body;
}

const text = (t, marks) => (marks ? { type: 'text', text: String(t), marks } : { type: 'text', text: String(t) });

export function toAdf(report) {
  const content = [
    { type: 'heading', attrs: { level: 3 }, content: [text(report.title)] },
    { type: 'paragraph', content: [text(`Draft prepared by DORA Incident Desk. Fields marked ${TODO} need input before submission.`, [{ type: 'em' }])] },
  ];
  for (const s of report.sections) {
    content.push({ type: 'heading', attrs: { level: 4 }, content: [text(s.heading)] });
    content.push({
      type: 'table',
      attrs: { isNumberColumnEnabled: false, layout: 'default' },
      content: s.rows.map(([k, v]) => ({
        type: 'tableRow',
        content: [
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [text(k)] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [text(v)] }] },
        ],
      })),
    });
  }
  return { type: 'doc', version: 1, content };
}
