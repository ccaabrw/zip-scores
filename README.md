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
format. The app does not fetch scores from LinkedIn; enter or import results
that participants have shared with you.
