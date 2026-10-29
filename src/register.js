export const REGISTER_COLUMNS = ['provider', 'lei', 'service', 'functions', 'criticality', 'contractRef', 'country'];

const splitCsvLine = (line, sep = ',') => {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
};

export function parseRegister(csv) {
  const lines = String(csv || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { entries: [], errors: [] };
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const index = {};
  for (const col of REGISTER_COLUMNS) {
    const i = header.indexOf(col.toLowerCase());
    if (i >= 0) index[col] = i;
  }
  const errors = [];
  if (index.provider === undefined) errors.push('The first line must be a header with at least a "provider" column.');
  const entries = [];
  const seen = new Set();
  for (let n = 1; n < lines.length && index.provider !== undefined; n += 1) {
    const cells = splitCsvLine(lines[n], sep);
    const e = {};
    for (const col of REGISTER_COLUMNS) e[col] = index[col] === undefined ? '' : cells[index[col]] || '';
    if (!e.provider) {
      errors.push(`Line ${n + 1}: provider is empty.`);
      continue;
    }
    e.id = providerId(e.provider);
    if (seen.has(e.id)) {
      errors.push(`Line ${n + 1}: ${e.provider} appears twice; the first entry is kept.`);
      continue;
    }
    seen.add(e.id);
    entries.push(e);
  }
  return { entries, errors };
}

export function providerId(name) {
  return `ict-provider-${String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function matchProvider(entries, name) {
  const id = providerId(name);
  return entries.find((e) => e.id === id) || null;
}

export function providerText(e, incidents) {
  const lines = [
    `ICT third-party service provider: ${e.provider}`,
    e.lei ? `LEI: ${e.lei}` : '',
    e.service ? `ICT service: ${e.service}` : '',
    e.functions ? `Supports functions: ${e.functions}` : '',
    e.criticality ? `Criticality: ${e.criticality}` : '',
    e.contractRef ? `Contractual arrangement: ${e.contractRef}` : '',
    e.country ? `Country: ${e.country}` : '',
    incidents.length ? `Incidents involving this provider: ${incidents.join(', ')}` : 'No incidents recorded against this provider.',
    'Source: DORA Register of Information (Regulation (EU) 2022/2554, Art. 28(3)), maintained in DORA Incident Desk.',
  ];
  return lines.filter(Boolean).join('\n');
}

export function toGraphObject(e, incidents, siteUrl, sequence) {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0',
    id: e.id,
    updateSequenceNumber: sequence,
    displayName: `ICT provider: ${e.provider}`,
    url: siteUrl ? `${siteUrl}/jira/settings/apps` : 'https://www.eiopa.europa.eu/digital-operational-resilience-act-dora_en',
    createdAt: e.createdAt || now,
    lastUpdatedAt: now,
    permissions: [{ accessControls: [{ principals: [{ type: 'EVERYONE' }] }] }],
    associations: incidents.length ? { set: [{ associationType: 'issueIdOrKeys', values: incidents }] } : undefined,
    'atlassian:document': {
      type: { category: 'document', mimeType: 'text/plain' },
      content: { mimeType: 'text/plain', text: providerText(e, incidents) },
    },
  };
}
