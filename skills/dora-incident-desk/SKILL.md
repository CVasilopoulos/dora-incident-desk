---
name: dora-incident-desk
description: Classify ICT incidents under EU DORA, track the regulatory reporting clock and draft DORA reports through the DORA Incident Desk MCP server for Jira Service Management. Use when someone asks whether an incident is major under DORA, when a DORA report is due, or to draft a DORA initial, intermediate or final report.
---

# DORA Incident Desk

Connect the MCP server `https://mcp.atlassian.com/forge/7c911900-a823-4722-b696-0ab8ac155b39` (OAuth; your site admin must enable the app's tools under Atlassian Administration > Connected apps). Every tool acts with your own Jira permissions.

## Tools

| Tool | Use it to |
|---|---|
| `get-dora-case` | Read the verdict, the criteria met with reasons and articles, the deadlines and the recorded facts for one incident (`issueKey`). |
| `record-dora-impact` | Record critical services, clients, counterparts, transactions and costs. |
| `record-dora-timeline` | Record occurred/aware/resolved times (ISO 8601), duration, downtime, Member States, root cause and ICT providers. |
| `record-dora-reputation-data` | Record media coverage, complaints, regulatory risk, client loss, data impact and malicious access. |
| `draft-dora-report` | Draft the `initial`, `intermediate` or `final` report into Confluence (or a Jira comment). |
| `mark-dora-report-submitted` | Record that a report was actually submitted; this starts the next clock. |
| `list-dora-cases` | List assessed incidents, soonest deadline first. |
| `check-recurring-incidents` | Check whether non-major incidents with the same root cause are collectively major. |

## Rules

1. Always call `get-dora-case` before stating a verdict or a deadline; never compute them yourself.
2. Only record facts the user stated. Ask for missing criteria listed in `unknownCriteria`.
3. Quote times in UTC and cite the articles returned by the tools (Delegated Regulation (EU) 2024/1772 for classification, Delegated Regulation (EU) 2025/301 Art. 5 for time limits).
4. A draft is not a submission. Only call `mark-dora-report-submitted` when the user confirms the report was sent to the competent authority.
