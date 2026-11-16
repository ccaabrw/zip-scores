"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { retrieveScores, toCsv } = require("./linkedin-import");

const credentials = { liAt: "session", jsessionId: "ajax:123" };
const game = id => ({
  $type: "com.linkedin.voyager.dash.identity.game.Game",
  entityUrn: `urn:li:fsd_game:(member,${id},123)`
});
const row = (name, score, ranking = 1) => ({
  ranking, gameScore: score, playerDetails: { player: { "*profile": `profile:${name}` } }
});
const profile = name => ({
  $type: "com.linkedin.voyager.dash.identity.profile.Profile",
  entityUrn: `profile:${name}`, firstName: name, lastName: "Example"
});
const page = (elements, names, total = elements.length) => ({
  data: { data: { identityDashGameConnectionsEntitiesByOptedInToLeaderboardAndPlayed: { elements, paging: { total } } } },
  included: names.map(profile)
});
const ok = json => ({ ok: true, status: 200, json: async () => json });

test("retrieves and paginates games, formatting times and guesses as importable CSV", async () => {
  const requests = [];
  const responses = [
    { included: [game(6), game(1)] },
    page([row("Ada", { timeElapsed: 75 })], ["Ada"], 2),
    page([row("Sam", { timeElapsed: 0 }), row("Hidden", null, null)], ["Sam"], 2),
    page([row('Jo, "J"', { totalGuessCount: 3 })], ['Jo, "J"'])
  ];
  const records = await retrieveScores("2026-11-16", credentials, async (url, options) => {
    requests.push({ url, options });
    return ok(responses.shift());
  });
  assert.deepEqual(records.map(record => [record.game, record.participant, record.score]), [
    ["Zip", "Ada Example", "1:15"], ["Zip", "Sam Example", "0:00"], ["Pinpoint", 'Jo, "J" Example', "3"]
  ]);
  assert.match(requests[1].url, /gameUrn:urn%3Ali%3Afsd_game%3A%28member%2C6%2C123%29/);
  assert.match(requests[2].url, /start:1/);
  assert.equal(requests[0].options.redirect, "manual");
  assert.equal(requests[0].options.headers["csrf-token"], "ajax:123");
  assert.match(toCsv(records), /"Jo, ""J"" Example","3"/);
});

test("rejects authentication failure and changed response shapes", async () => {
  await assert.rejects(retrieveScores("2026-11-16", credentials, async () => ({ status: 401 })), /rejected the session/);
  await assert.rejects(retrieveScores("2026-11-16", credentials, async () => ok({ errors: [{ message: "changed" }] })), /API error/);
  await assert.rejects(retrieveScores("2026-11-16", credentials, async () => ok({})), /unexpected format/);
});

test("rejects incomplete pages, malformed scores, and duplicate names", async () => {
  async function run(pages) {
    const responses = [{ included: [game(6)] }, ...pages];
    return retrieveScores("2026-11-16", credentials, async () => ok(responses.shift()));
  }
  await assert.rejects(run([page([], [], 1)]), /incomplete/);
  await assert.rejects(run([page([row("Ada", { timeElapsed: null })], ["Ada"])]), /invalid/);
  await assert.rejects(run([page([row("Ada", { timeElapsed: 10 }), row("Ada", { timeElapsed: 20 })], ["Ada"])]), /Duplicate participant/);
  await assert.rejects(run([page([row("=Ada", { timeElapsed: 10 })], ["=Ada"])]), /invalid/);
});

test("rejects invalid dates and empty leaderboards", async () => {
  await assert.rejects(retrieveScores("2026-02-30", credentials), /valid date/);
  const responses = [{ included: [game(6)] }, page([], [])];
  await assert.rejects(retrieveScores("2026-11-16", credentials, async () => ok(responses.shift())), /no visible scores/);
});
