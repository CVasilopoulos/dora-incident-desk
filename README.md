# DORA Incident Desk

A Forge app for Jira Service Management, Confluence and Rovo that helps EU financial entities handle ICT incidents under the Digital Operational Resilience Act (DORA, Regulation (EU) 2022/2554).

Banks, insurers and investment firms must classify every ICT-related incident against the criteria in Commission Delegated Regulation (EU) 2024/1772 and, when it is major, send an initial notification, an intermediate report and a final report to their competent authority on tight clocks (Delegated Regulation (EU) 2025/301, Art. 5). Incident teams already work in Jira Service Management; DORA Incident Desk puts the classification, the clocks and the report drafts next to the incident.

## What it does

- **Issue panel (Jira / JSM):** record the facts that drive classification (critical services, clients and transactions affected, reputational impact, duration and downtime, Member States, data impact, malicious access, costs, root cause, ICT providers). The app shows the verdict, which thresholds are met and why, with the article for each.
- **Reporting clock:** initial notification within 4 h of classification as major and no later than 24 h after awareness, intermediate report 72 h after the initial notification, final report one month after the latest intermediate report. Status lozenges show open, due soon, overdue and submitted.
- **Report drafts:** one click drafts the initial, intermediate or final report as a Confluence page (or a Jira comment), pre-filled from the incident and marking every field still to complete.
- **Recurring incidents:** non-major incidents with the same apparent root cause within 6 months are assessed together (Art. 8(2)).
- **Rovo agent "DORA Incident Officer":** answers "is this incident major?", asks for the missing facts, records them, drafts reports and lists cases with deadlines, always through the app's actions so it never computes a verdict itself.
- **MCP server (`rovo:mcp`):** the same eight actions are exposed as MCP tools, so Rovo Studio agents and external AI clients can use them with the user's own permissions.
- **Teamwork Graph connector:** the DORA Register of Information (ICT third-party providers, Art. 28(3)) is published to the Teamwork Graph as documents linked to the incidents that involved each provider.
- **Admin page:** client base for the 10% threshold, home Member State, Confluence space for drafts, the register, and an overview of open cases.

## Classification rules implemented

An incident is major when it affects critical services (Art. 6) and either involves successful malicious unauthorised access (Art. 9(5)(b)) or meets two or more materiality thresholds (Art. 8(1)):

| Criterion | Threshold (Art. 9) |
|---|---|
| Clients, counterparts, transactions | > 10% of clients, > 100,000 clients, > 30% of counterparts, > 10% of daily transactions or their value, or relevant clients affected |
| Reputational impact | media coverage, repeated complaints, regulatory requirements at risk, or likely client loss |
| Duration and downtime | > 24 h duration, or > 2 h downtime of services supporting critical or important functions |
| Geographical spread | two or more Member States |
| Data losses | adverse impact on data availability, authenticity, integrity or confidentiality |
| Economic impact | > EUR 100,000 |

The rules live in `src/dora.js` and are covered by unit tests in `test/`.

## Runs on Atlassian

No egress: the app calls only Jira, Confluence, Forge storage and the Teamwork Graph. Incident data stays in Forge key-value storage on the customer's site. It does not store personal data.

## Install and try it

1. Install with the installation link (Jira and Confluence on the same site).
2. Jira settings > Apps > DORA Incident Desk: set the client base, the Confluence space key, and select **Load sample register** for a fictional register.
3. Open a Jira Service Management incident and select **DORA Incident Desk**. Record facts and select **Save and reclassify**.
4. In Rovo, choose the **DORA Incident Officer** agent and ask "Is INC-1 major under DORA?".

All demo data is synthetic. The app supports regulatory work but does not replace legal review; a person must review and submit every report.

## Development

```
npm install
npm test
forge deploy -e development
forge install --site <site>.atlassian.net --product jira
forge install --site <site>.atlassian.net --product confluence
```

Built for Codegeist 2026. AI-assisted, human-directed.
