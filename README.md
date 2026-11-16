# LinkedIn game scores

A small, local leaderboard for tracking the LinkedIn games you play. Open
`index.html` in a browser; no account, server, or installation is required.
Scores stay in that browser's local storage. Export a CSV backup before
clearing browser data or moving to another browser.

Enter a date, game, participant, and score for each result. A second result for
the same date, game, and participant replaces the first. Game and participant
names are matched case-insensitively. Select a game to see each participant's
scores over time; lines connect consecutive days only, so missing results are
not mistaken for scores. Game and participant names must be at most 100
characters and cannot begin with `=`, `+`, `-`, or `@`, to avoid spreadsheet
formulas in exported CSV files.

Scores may be non-negative numbers (for example `4` or `12.5`) or times in
`m:ss` or `h:mm:ss` format (for example `1:23` or `1:02:03`). All scores for
the same game must use the same kind of score. The graph shows the recorded
values; it does not assume whether a higher or lower score is better. Scores
are limited to one billion (seconds for times).

For bulk entry, import a UTF-8 CSV with the header
`date,game,participant,score` and dates in `YYYY-MM-DD` format:

```csv
date,game,participant,score
2026-11-14,Zip,Ada,1:23
2026-11-14,Zip,Sam,1:15
2026-11-15,Zip,Ada,1:10
2026-11-15,Pinpoint,Sam,3
```

Imports merge with existing results and replace matching entries. Invalid
imports are rejected without changing saved scores. Export uses the same
format.

## Retrieve current LinkedIn scores

The optional local helper requires Node.js 18 or later. It uses LinkedIn's
unofficial internal API, which can change or stop working and may be subject
to LinkedIn's terms. It retrieves the current games and visible connections
leaderboards, not historical results. People who have not played or have
opted out may not have a score. Pinpoint uses the number of guesses; other
games use elapsed time. Names identify participants in this app, so different
people with the same name cannot be imported for the same game and date.

1. Sign in to LinkedIn in your browser. Open browser developer tools and find
   the `li_at` and `JSESSIONID` cookies under the cookies for
   `https://www.linkedin.com` (usually under Application or Storage).
2. From this project's directory, run `node linkedin-import.js`. This starts
   the local helper; it asks for the date of the current LinkedIn puzzles and
   then both cookie values without echoing them. Confirm the date shown by
   LinkedIn before entering it: the response does not supply a reliable date.
   The helper does not store the cookies, and sends them only to LinkedIn.
   Treat them like passwords: do not share them or paste them into chat.
3. Use **Import CSV** in the app to select `linkedin-scores.csv`. The file
   contains names and scores, is created with owner-only permissions where
   supported, and is ignored by Git. It will not overwrite an existing file:
   remove or rename the old file before running the helper again.

If authentication expires, sign in again and use fresh cookies. API changes,
incomplete responses, duplicate names, or an existing output file cause the
helper to fail without producing a new CSV. Manual entry and CSV import remain
available without the helper.
