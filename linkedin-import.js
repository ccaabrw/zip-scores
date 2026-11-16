"use strict";

const fs = require("node:fs/promises");
const readline = require("node:readline/promises");

const games = new Map([
  [1, "Pinpoint"], [2, "Crossclimb"], [3, "Queens"], [4, "Wend"],
  [5, "Tango"], [6, "Zip"], [7, "Mini Sudoku"], [8, "Patches"]
]);
const hubQuery = "voyagerIdentityDashGameEntryPoints.4666a73a66c1a9663577e1c37f1ac13a";
const leaderboardQuery = "voyagerIdentityDashGameConnectionsEntities.a5fed1d462445e698d896bd5563fed9c";
const baseUrl = "https://www.linkedin.com/voyager/api/graphql";
const pageSize = 25;

function validDate(date) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= "1000-01-01" &&
    Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

function cookieValue(value) {
  value = value.trim().replace(/^"|"$/g, "");
  if (!value || /[\s;"\\\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid LinkedIn cookie value.");
  return value;
}

async function getLinkedIn(variables, queryId, credentials, fetchImpl = fetch) {
  const url = `${baseUrl}?includeWebMetadata=true&variables=${variables}&queryId=${queryId}`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        cookie: `li_at=${cookieValue(credentials.liAt)}; JSESSIONID="${cookieValue(credentials.jsessionId)}"`,
        "csrf-token": cookieValue(credentials.jsessionId),
        "x-restli-protocol-version": "2.0.0"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    throw new Error("Could not connect to LinkedIn. Check your connection and try again.");
  }
  if ([401, 403, 999].includes(response.status) || (response.status >= 300 && response.status < 400)) {
    throw new Error(`LinkedIn rejected the session (${response.status}); sign in again and use fresh cookies.`);
  }
  if (!response.ok) throw new Error(`LinkedIn returned HTTP ${response.status}.`);
  let json;
  try { json = await response.json(); }
  catch { throw new Error("LinkedIn returned an invalid response."); }
  if (!json || typeof json !== "object" || json.errors?.length) {
    throw new Error("LinkedIn returned an API error; its unofficial API may have changed.");
  }
  return json;
}

function parseGames(json) {
  if (!Array.isArray(json.included)) throw new Error("LinkedIn's game response has an unexpected format.");
  const found = [];
  for (const item of json.included) {
    if (item?.$type !== "com.linkedin.voyager.dash.identity.game.Game") continue;
    const match = /^urn:li:fsd_game:\(([^,()]+),(\d+),(\d+)\)$/.exec(item.entityUrn);
    if (!match || !games.has(Number(match[2]))) throw new Error("LinkedIn returned an unknown game; the importer needs updating.");
    found.push({ urn: item.entityUrn, id: Number(match[2]) });
  }
  if (!found.length) throw new Error("No games found in LinkedIn's response; the unofficial API may have changed.");
  if (new Set(found.map(game => game.id)).size !== found.length) throw new Error("LinkedIn returned duplicate games.");
  return found;
}

function parsePage(json, game, date) {
  const collection = json.data?.data?.identityDashGameConnectionsEntitiesByOptedInToLeaderboardAndPlayed;
  if (!Array.isArray(json.included) || !Array.isArray(collection?.elements) ||
      !Number.isSafeInteger(collection.paging?.total) || collection.paging.total < 0) {
    throw new Error(`LinkedIn's ${games.get(game.id)} leaderboard has an unexpected format.`);
  }
  const profiles = new Map(json.included.filter(item => item?.$type === "com.linkedin.voyager.dash.identity.profile.Profile")
    .map(item => [item.entityUrn, [item.firstName, item.lastName].filter(part => typeof part === "string" && part.trim()).join(" ").trim()]));
  const records = [];
  for (const row of collection.elements) {
    if (row?.ranking == null && row?.gameScore == null) continue;
    const participant = profiles.get(row?.playerDetails?.player?.["*profile"]);
    const value = game.id === 1 ? row?.gameScore?.totalGuessCount : row?.gameScore?.timeElapsed;
    if (!participant || participant.length > 100 || /^\s*[=+\-@]/.test(participant) ||
        !Number.isSafeInteger(value) || value < (game.id === 1 ? 1 : 0) ||
        value > (game.id === 1 ? 5 : 1e9) || !Number.isFinite(row?.ranking)) {
      throw new Error(`LinkedIn returned an invalid ${games.get(game.id)} score or participant.`);
    }
    const score = game.id === 1 ? String(value) : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
    records.push({ date, game: games.get(game.id), participant, score });
  }
  return { records, count: collection.elements.length, total: collection.paging.total };
}

async function retrieveScores(date, credentials, fetchImpl = fetch) {
  if (!validDate(date)) throw new Error("Enter a valid date in YYYY-MM-DD format.");
  const available = parseGames(await getLinkedIn("(gameEntryPointType:GAME_HUB)", hubQuery, credentials, fetchImpl));
  const records = [];
  for (const game of available) {
    let start = 0;
    for (let page = 0; ; page++) {
      if (page >= 100) throw new Error(`The ${games.get(game.id)} leaderboard is too large to import safely.`);
      const urn = encodeURIComponent(game.urn).replace(/[()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      const variables = `(gameUrn:${urn},start:${start},count:${pageSize})`;
      const result = parsePage(await getLinkedIn(variables, leaderboardQuery, credentials, fetchImpl), game, date);
      records.push(...result.records);
      start += result.count;
      if (start >= result.total) break;
      if (!result.count) throw new Error(`LinkedIn returned an incomplete ${games.get(game.id)} leaderboard.`);
    }
  }
  if (!records.length) throw new Error("LinkedIn returned no visible scores; no CSV was created.");
  const keys = new Set();
  for (const record of records) {
    const id = JSON.stringify([record.date, record.game.toLowerCase(), record.participant.toLowerCase()]);
    if (keys.has(id)) throw new Error(`Duplicate participant name in ${record.game}; importing would overwrite a score.`);
    keys.add(id);
  }
  return records;
}

function toCsv(records) {
  const field = value => `"${value.replace(/"/g, '""')}"`;
  return ["date,game,participant,score", ...records.map(record =>
    [record.date, record.game, record.participant, record.score].map(field).join(","))].join("\r\n") + "\r\n";
}

function readSecret(prompt) {
  if (!process.stdin.isTTY) throw new Error("A terminal is required to enter session cookies securely.");
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = chunk => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") return finish(new Error("Cancelled."));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  if (!process.stdin.isTTY) throw new Error("Run this helper in a terminal.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let date;
  try { date = (await rl.question("Date of the current LinkedIn puzzles (YYYY-MM-DD): ")).trim(); }
  finally { rl.close(); }
  if (!validDate(date)) throw new Error("Enter a valid date in YYYY-MM-DD format.");
  const credentials = {
    liAt: await readSecret("LinkedIn li_at cookie (hidden): "),
    jsessionId: await readSecret("LinkedIn JSESSIONID cookie (hidden): ")
  };
  cookieValue(credentials.liAt);
  cookieValue(credentials.jsessionId);
  const records = await retrieveScores(date, credentials);
  await fs.writeFile("linkedin-scores.csv", toCsv(records), { flag: "wx", mode: 0o600 });
  console.log(`Saved ${records.length} scores to linkedin-scores.csv. Import it in the app.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Import failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { retrieveScores, toCsv };
