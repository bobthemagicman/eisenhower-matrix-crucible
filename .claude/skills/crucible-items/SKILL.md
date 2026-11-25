---
name: crucible-items
description: Generate or refresh the Eisenhower matrix crucible's items file (items.json) from the user's open loops in Jira, GitHub, email, calendar, Slack, monday, notes and AI sessions. Use when asked to build, update or refresh the to-do radar or crucible, to sort open loops or a to-do list by the Eisenhower matrix, or to capture this session's open loops for the crucible.
---

# Generate the crucible items file

You produce one document that follows `schema/crucible.schema.json`: the list the crucible draws as a forge fire. It is the user's private to-do list.

## Rules that always apply

- **Private by default.** Write the file only to `items.json` or `items.js` in this repo (both are git-ignored) or to a path the user names. Never put item contents in a commit, pull request, issue, log, chat message or any service the user didn't ask for. Before uploading anywhere, confirm the destination with the user.
- **Facts only.** Every title, date and next step comes from a source you read or from the user. Never invent deadlines, owners or outcomes. If a date is unknown, leave `by` out and the item sits at black heat on the rim.
- **Read before you sort.** Read every source in scope before placing anything; one source often changes the urgency of another (a calendar event can make a Jira ticket urgent).

## 1. Scope

Work out which sources to read. Use what the user named; otherwise use every source you can reach among:

| Source | What to read |
|---|---|
| Jira | Open issues assigned to the user, or the project's open issues if they run it (`statusCategory != Done`). Priority, due date, labels, parent |
| GitHub | Open issues and pull requests assigned to or requested from the user |
| Email (Gmail, Outlook) | Starred, flagged or "to-do" labelled threads, and recent threads waiting on the user's reply |
| Calendar | The next two weeks: events that need preparation, and hard dates (launches, events, renewals) |
| Slack | Messages the user saved, was asked something in, or tagged "add this to my to-do list" |
| monday | Items assigned to the user that are not in a done status |
| Notes | Checklists and `next-actions` files in folders the user points to |
| AI sessions | Unfinished todo lists and stated next steps in recent agent sessions (this one included) |

AI session transcripts live on the user's machine, and the location depends on the tool. Claude Code keeps them in `~/.claude/projects/<project>/*.jsonl` and Codex in `~/.codex/sessions/`. If you can't find them, **ask the user where to look** rather than guessing. In a transcript, the latest todo-list update per session is the most reliable record of open work; keep entries that are pending or in progress.

Skip sources you can't reach, and say which ones you skipped.

## 2. Sort each item

Ask the user for their one current goal if you don't know it. Importance is judged against it.

- **Important:** moves the user's stated goal or a commitment forward, or protects something that would be costly to lose (money, legal standing, a client, a key relationship).
- **Urgent:** the next step is due within 7 days, is overdue, or has an outside deadline that can't move.

| q | Quadrant | Rule |
|---|---|---|
| 1 | Strike (do first) | Important and urgent |
| 2 | Bank (schedule) | Important, not urgent |
| 3 | Striker (delegate) | Urgent, not important: small, or someone else could do it |
| 4 | Slag (eliminate) | Neither. Prefer renaming quadrant 4 to "Cold iron" / "Park" when the items are real work set aside rather than waste |

Merge duplicates: a Jira ticket, its Slack thread and its calendar event are one item. Keep the most specific link.

Keep the top 20, in priority order: all of quadrant 1 first (soonest first), then 3 when it is due today or overdue, then 2, then the rest. Roll a long tail of similar work into one item ("Docs rewrite (OPS-40 to OPS-48)") rather than dropping it silently, and tell the user what you left out.

## 3. Write each item

| Field | How |
|---|---|
| `id` | `<source>:<native id>`, e.g. `jira:OPS-12`, `gmail:<thread id>`, `ai:<session>:<n>` |
| `q` | From the table above |
| `title` | What it is, under 70 characters, plain words |
| `by` | When the **next step** is due, `YYYY-MM-DD`. Not the outer deadline: work back from it to a realistic date |
| `deadline` | The outer deadline, when there is one and it differs from `by` |
| `next` | One concrete sentence: the very next action, and why now if it isn't obvious |
| `key` / `url` | Ticket key, or a link to the source (`http`/`https` only) |
| `source` | A short label when there is no key, e.g. `Calendar`, `Slack · #ops` |

Document fields: `title`; `goal` (`{ label, date }`) when the user has a dated goal; `snapshot` (today's date); `linkBase` when most items are tickets in one tracker; `quadrants` only for renames.

## 4. Save and check

1. Write `items.json`. If the user opens the page straight from disk (no web server), write `items.js` instead, containing `window.CRUCIBLE = <the document>;`.
2. Run `node scripts/validate.mjs items.json` (or `items.js`). Fix every problem it lists and run it again until it prints `valid`.
3. If the user keeps their board in AWS (task-brazer, S3 or DynamoDB), offer to hand the file over. Upload it to `s3://<bucket>/inbox/<their email>/ai-skill.json` with the AWS tools you have, and only once they confirm the bucket. task-brazer's `crucible` source merges it on its next run.

## 5. Report

Tell the user in a few lines:

- how many items, per quadrant, and which sources were read or skipped;
- the Strike items with their `by` dates;
- anything you rolled up or left out;
- the one thing to do right now.

Don't paste the whole file back into the conversation.
