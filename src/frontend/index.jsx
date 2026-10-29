import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  DatePicker,
  DynamicTable,
  Heading,
  Inline,
  Label,
  Link,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Strong,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Textfield,
  TimePicker,
  Toggle,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const MEMBER_STATES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
].map((c) => ({ label: c, value: c }));

const NUMBER_FIELDS = [
  ['clientsAffected', 'Clients affected (number)'],
  ['clientsAffectedPct', '% of clients using the service'],
  ['counterpartsAffectedPct', '% of financial counterparts'],
  ['transactionsAffectedPct', '% of daily average transactions'],
  ['transactionValueAffectedPct', '% of daily average transaction value'],
];

const REPUTATION = [
  ['mediaCoverage', 'Reflected in the media'],
  ['repeatedComplaints', 'Repeated complaints from different clients or counterparts'],
  ['regulatoryBreach', 'Will not, or is likely not to, meet regulatory requirements'],
  ['clientLossLikely', 'Likely loss of clients or counterparts with material business impact'],
];

const STATUS_APPEARANCE = {
  overdue: 'removed',
  'due soon': 'moved',
  open: 'inprogress',
  submitted: 'success',
  'submitted late': 'moved',
  'not started': 'default',
};

const card = xcss({ padding: 'space.150', borderRadius: 'border.radius', backgroundColor: 'elevation.surface.sunken' });

const splitIso = (iso) => {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
};

const joinIso = (date, time) => (date ? new Date(`${date}T${time || '00:00'}:00Z`).toISOString() : '');

const fmt = (iso) => (iso ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '–');

const remaining = (iso) => {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(Math.abs(ms) / 3600000);
  const m = Math.floor((Math.abs(ms) % 3600000) / 60000);
  return ms >= 0 ? `in ${h} h ${m} min` : `${h} h ${m} min ago`;
};

const toNumberOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function DateTimeField({ label, value, onChange }) {
  const { date, time } = splitIso(value);
  return (
    <Stack space="space.050">
      <Label labelFor={label}>{label} (UTC)</Label>
      <Inline space="space.100">
        <DatePicker id={label} value={date} onChange={(d) => onChange(joinIso(d, time))} />
        <TimePicker value={time} onChange={(t) => onChange(joinIso(date || new Date().toISOString().slice(0, 10), t))} />
        {value ? <Button appearance="subtle" onClick={() => onChange('')}>Clear</Button> : null}
      </Inline>
    </Stack>
  );
}

function Verdict({ data }) {
  const v = data.verdict;
  return (
    <SectionMessage appearance={v.major ? 'error' : data.tracked ? 'success' : 'information'} title={v.major ? 'Major ICT-related incident' : 'Not a major incident'}>
      <Stack space="space.100">
        <Text>{v.rule}</Text>
        {data.next ? (
          <Inline space="space.100" alignBlock="center">
            <Text>Next: <Strong>{data.next.name}</Strong> due {fmt(data.next.due)} ({remaining(data.next.due)})</Text>
            <Lozenge appearance={STATUS_APPEARANCE[data.next.status] || 'default'}>{data.next.status}</Lozenge>
          </Inline>
        ) : null}
        {v.unknown.length ? <Text>Still unknown: {v.unknown.join(', ')}. Record them to firm up the verdict.</Text> : null}
      </Stack>
    </SectionMessage>
  );
}

function CriteriaTable({ verdict }) {
  return (
    <DynamicTable
      head={{ cells: [{ key: 'c', content: 'Criterion' }, { key: 'a', content: 'Article' }, { key: 'm', content: 'Threshold' }, { key: 'r', content: 'Why' }] }}
      rows={[
        {
          key: 'critical',
          cells: [
            { key: 'c', content: 'Critical services affected' },
            { key: 'a', content: 'Art. 6, 8(1)' },
            { key: 'm', content: <Lozenge appearance={verdict.criticalServicesAffected ? 'removed' : 'default'}>{verdict.criticalServicesAffected ? 'yes' : 'no'}</Lozenge> },
            { key: 'r', content: 'Required for a major incident' },
          ],
        },
        ...verdict.criteria.map((c) => ({
          key: c.id,
          cells: [
            { key: 'c', content: c.name },
            { key: 'a', content: c.article },
            { key: 'm', content: <Lozenge appearance={c.met ? 'removed' : 'default'}>{c.met ? 'met' : 'not met'}</Lozenge> },
            { key: 'r', content: c.reason },
          ],
        })),
      ]}
    />
  );
}

function ClassificationForm({ facts, onSave, saving }) {
  const [f, setF] = useState(facts);
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  const num = (k) => (e) => set(k)(e.target.value === '' ? '' : e.target.value);
  const save = () => {
    const patch = { ...f };
    for (const [k] of NUMBER_FIELDS) patch[k] = toNumberOrNull(f[k]);
    for (const k of ['durationHours', 'downtimeHours', 'economicImpactEur']) patch[k] = toNumberOrNull(f[k]);
    patch.providers = typeof f.providers === 'string' ? f.providers.split(',').map((s) => s.trim()).filter(Boolean) : f.providers;
    delete patch.reports;
    onSave(patch);
  };
  return (
    <Stack space="space.200">
      <Box xcss={card}>
        <Stack space="space.100">
          <Heading as="h5">Critical services</Heading>
          <Inline space="space.100" alignBlock="center">
            <Toggle id="crit" isChecked={Boolean(f.criticalServicesAffected)} onChange={(e) => set('criticalServicesAffected')(e.target.checked)} />
            <Label labelFor="crit">Affects ICT services supporting critical or important functions, or authorised financial services</Label>
          </Inline>
          <Textfield placeholder="Which services, for example card payments, mobile banking" defaultValue={f.criticalServicesNotes || ''} onChange={(e) => set('criticalServicesNotes')(e.target.value)} />
        </Stack>
      </Box>
      <Box xcss={card}>
        <Stack space="space.100">
          <Heading as="h5">Clients, counterparts and transactions</Heading>
          <Inline space="space.150" shouldWrap>
            {NUMBER_FIELDS.map(([k, label]) => (
              <Stack key={k} space="space.050">
                <Label labelFor={k}>{label}</Label>
                <Textfield id={k} type="number" defaultValue={f[k] === null || f[k] === undefined ? '' : String(f[k])} onChange={num(k)} />
              </Stack>
            ))}
          </Inline>
          <Checkbox isChecked={Boolean(f.relevantClientsAffected)} onChange={(e) => set('relevantClientsAffected')(e.target.checked)} label="Relevant clients or financial counterparts affected (Art. 1(3))" />
        </Stack>
      </Box>
      <Box xcss={card}>
        <Stack space="space.100">
          <Heading as="h5">Reputational impact</Heading>
          {REPUTATION.map(([k, label]) => (
            <Checkbox key={k} isChecked={Boolean(f[k])} onChange={(e) => set(k)(e.target.checked)} label={label} />
          ))}
        </Stack>
      </Box>
      <Box xcss={card}>
        <Stack space="space.150">
          <Heading as="h5">Timeline, duration and downtime</Heading>
          <DateTimeField label="Incident occurred" value={f.occurredAt} onChange={set('occurredAt')} />
          <DateTimeField label="Entity became aware" value={f.awareAt} onChange={set('awareAt')} />
          <DateTimeField label="Classified as major" value={f.classifiedAt} onChange={set('classifiedAt')} />
          <DateTimeField label="Resolved" value={f.resolvedAt} onChange={set('resolvedAt')} />
          <Inline space="space.150" shouldWrap>
            <Stack space="space.050">
              <Label labelFor="dur">Duration in hours (leave empty to compute)</Label>
              <Textfield id="dur" type="number" defaultValue={f.durationHours === null || f.durationHours === undefined ? '' : String(f.durationHours)} onChange={num('durationHours')} />
            </Stack>
            <Stack space="space.050">
              <Label labelFor="down">Downtime of critical-function services (h)</Label>
              <Textfield id="down" type="number" defaultValue={f.downtimeHours === null || f.downtimeHours === undefined ? '' : String(f.downtimeHours)} onChange={num('downtimeHours')} />
            </Stack>
          </Inline>
        </Stack>
      </Box>
      <Box xcss={card}>
        <Stack space="space.100">
          <Heading as="h5">Geography, data and cost</Heading>
          <Label labelFor="ms">Member States with impact</Label>
          <Select
            id="ms"
            isMulti
            options={MEMBER_STATES}
            value={(f.memberStates || []).map((c) => ({ label: c, value: c }))}
            onChange={(v) => set('memberStates')((v || []).map((o) => o.value))}
          />
          <Checkbox isChecked={Boolean(f.dataImpact)} onChange={(e) => set('dataImpact')(e.target.checked)} label="Data availability, authenticity, integrity or confidentiality impacted with adverse effect" />
          <Checkbox isChecked={Boolean(f.maliciousAccess)} onChange={(e) => set('maliciousAccess')(e.target.checked)} label="Successful, malicious and unauthorised access to network and information systems" />
          <Label labelFor="eur">Direct and indirect costs and losses (EUR)</Label>
          <Textfield id="eur" type="number" defaultValue={f.economicImpactEur === null || f.economicImpactEur === undefined ? '' : String(f.economicImpactEur)} onChange={num('economicImpactEur')} />
        </Stack>
      </Box>
      <Box xcss={card}>
        <Stack space="space.100">
          <Heading as="h5">Root cause and third parties</Heading>
          <Label labelFor="rc">Apparent root cause (used for the recurring-incident check)</Label>
          <Textfield id="rc" defaultValue={f.rootCause || ''} onChange={(e) => set('rootCause')(e.target.value)} />
          <Label labelFor="prov">ICT third-party providers involved (comma separated)</Label>
          <Textfield id="prov" defaultValue={Array.isArray(f.providers) ? f.providers.join(', ') : f.providers || ''} onChange={(e) => set('providers')(e.target.value)} />
        </Stack>
      </Box>
      <Inline space="space.100">
        <LoadingButton appearance="primary" isLoading={saving} onClick={save}>Save and reclassify</LoadingButton>
      </Inline>
    </Stack>
  );
}

function Clock({ data, onSubmitted, busy }) {
  if (!data.deadlines.applies) return <SectionMessage appearance="information"><Text>{data.deadlines.note}</Text></SectionMessage>;
  return (
    <Stack space="space.150">
      <DynamicTable
        head={{ cells: [{ key: 'r', content: 'Report' }, { key: 'd', content: 'Due' }, { key: 'b', content: 'Basis' }, { key: 's', content: 'Status' }, { key: 'x', content: '' }] }}
        rows={data.deadlines.items.map((i) => ({
          key: i.id,
          cells: [
            { key: 'r', content: i.name },
            { key: 'd', content: i.due ? `${fmt(i.due)} (${remaining(i.due)})` : '–' },
            { key: 'b', content: i.basis },
            { key: 's', content: <Lozenge appearance={STATUS_APPEARANCE[i.status] || 'default'}>{i.submittedAt ? `${i.status} ${fmt(i.submittedAt)}` : i.status}</Lozenge> },
            { key: 'x', content: i.submittedAt && i.id !== 'intermediate' ? '' : <LoadingButton isLoading={busy === i.id} onClick={() => onSubmitted(i.id)}>Mark submitted now</LoadingButton> },
          ],
        }))}
      />
      <Text>{data.deadlines.note}</Text>
    </Stack>
  );
}

function Reports({ data, onDraft, busy, recurring, onRecurring }) {
  const draft = (type, label) => {
    const d = data.drafts[type];
    return (
      <Inline key={type} space="space.150" alignBlock="center">
        <LoadingButton isLoading={busy === `draft-${type}`} onClick={() => onDraft(type)}>{d ? `Redraft ${label}` : `Draft ${label}`}</LoadingButton>
        {d ? (
          <Text>
            {d.url ? <Link href={d.url} openNewTab>{d.target === 'confluence' ? 'Open Confluence page' : 'Open Jira comment'}</Link> : d.target}
            {' '}· {fmt(d.at)} · {d.missing} field{d.missing === 1 ? '' : 's'} to complete
          </Text>
        ) : null}
      </Inline>
    );
  };
  return (
    <Stack space="space.200">
      <Text>Drafts follow the structure of the DORA incident report templates and are pre-filled from this incident. They go to the Confluence space set by your Jira admin, or to a comment on this issue.</Text>
      {draft('initial', 'initial notification')}
      {draft('intermediate', 'intermediate report')}
      {draft('final', 'final report')}
      <Box xcss={card}>
        <Stack space="space.100">
          <Heading as="h5">Recurring incidents</Heading>
          <Text>Non-major incidents with the same apparent root cause, at least twice in 6 months, are assessed together.</Text>
          <Inline>
            <LoadingButton isLoading={busy === 'recurring'} onClick={onRecurring}>Check recurring incidents</LoadingButton>
          </Inline>
          {recurring ? (
            <SectionMessage appearance={recurring.recurring && recurring.collectivelyMajor ? 'error' : 'information'}>
              <Text>
                {recurring.recurring
                  ? `${recurring.related.join(', ')} share this root cause. Together they are ${recurring.collectivelyMajor ? 'a MAJOR incident' : 'not major'}: ${recurring.verdict.rule}`
                  : recurring.note}
              </Text>
            </SectionMessage>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}

function History({ data }) {
  if (!data.history.length) return <Text>No changes recorded yet.</Text>;
  return (
    <DynamicTable
      head={{ cells: [{ key: 't', content: 'When' }, { key: 's', content: 'Source' }, { key: 'e', content: 'What' }] }}
      rows={[...data.history].reverse().map((h, i) => ({
        key: `h${i}`,
        cells: [
          { key: 't', content: fmt(h.at) },
          { key: 's', content: h.source === 'rovo' ? 'Rovo agent' : 'Panel' },
          { key: 'e', content: h.event || `Updated ${h.changed.join(', ')}` },
        ],
      }))}
    />
  );
}

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [recurring, setRecurring] = useState(null);

  const call = async (name, payload) => {
    const res = await invoke(name, payload);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setError('');
    return res.data;
  };

  const load = async () => {
    const d = await call('getCase');
    if (d) setData(d);
  };

  useEffect(() => {
    load();
  }, []);

  if (!data && !error) return <Spinner label="Loading DORA case" />;
  if (!data) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;

  const save = async (patch) => {
    setSaving(true);
    const d = await call('updateFacts', { patch });
    if (d) setData(d);
    setSaving(false);
  };

  const submitted = async (type) => {
    setBusy(type);
    const d = await call('markSubmitted', { type });
    if (d) setData(d);
    setBusy('');
  };

  const draftIt = async (type) => {
    setBusy(`draft-${type}`);
    const d = await call('draftReport', { type });
    if (d) setData(d.case);
    setBusy('');
  };

  const checkRecurring = async () => {
    setBusy('recurring');
    setRecurring(await call('recurringCheck'));
    setBusy('');
  };

  return (
    <Stack space="space.200">
      {error ? <SectionMessage appearance="warning"><Text>{error}</Text></SectionMessage> : null}
      <Verdict data={data} />
      <Tabs id="dora-tabs">
        <TabList>
          <Tab>Classification</Tab>
          <Tab>Reporting clock</Tab>
          <Tab>Reports</Tab>
          <Tab>History</Tab>
        </TabList>
        <TabPanel>
          <Box paddingBlock="space.200">
            <Stack space="space.200">
              <CriteriaTable verdict={data.verdict} />
              <ClassificationForm key={JSON.stringify(data.facts)} facts={data.facts} onSave={save} saving={saving} />
            </Stack>
          </Box>
        </TabPanel>
        <TabPanel>
          <Box paddingBlock="space.200">
            <Clock data={data} onSubmitted={submitted} busy={busy} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box paddingBlock="space.200">
            <Reports data={data} onDraft={draftIt} busy={busy} recurring={recurring} onRecurring={checkRecurring} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box paddingBlock="space.200">
            <History data={data} />
          </Box>
        </TabPanel>
      </Tabs>
      <ButtonGroup>
        <Button appearance="subtle" onClick={load}>Refresh</Button>
      </ButtonGroup>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
