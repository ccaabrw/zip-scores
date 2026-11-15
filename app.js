"use strict";

const storageKey = "linkedin-game-scores-v1";
const dayMs = 86400000;
const colors = ["#0066a1", "#b13e2d", "#238443", "#8b50a2", "#a36400", "#007f80", "#c0447d", "#596625"];
const $ = id => document.getElementById(id);
let records = [];

function key(value) {
  return value.toLowerCase();
}

function scoreValue(score) {
  if (/^\d+(?:\.\d+)?$/.test(score)) {
    const value = Number(score);
    if (Number.isFinite(value) && value <= 1e9) return { type: "number", value };
  }
  if (/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(score)) {
    const parts = score.split(":").map(Number);
    const value = parts.reduce((total, part) => total * 60 + part, 0);
    if (Number.isFinite(value) && value <= 1e9) return { type: "time", value };
  }
  throw new Error("Score must be a non-negative number or a time in m:ss or h:mm:ss format.");
}

function validateRecord(input) {
  const date = String(input.date ?? "").trim();
  const game = String(input.game ?? "").trim();
  const participant = String(input.participant ?? "").trim();
  const score = String(input.score ?? "").trim();
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "1000-01-01" ||
      !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new Error("Date must be a valid date in YYYY-MM-DD format.");
  }
  if (!game || !participant || game.length > 100 || participant.length > 100) {
    throw new Error("Game and participant are required and must be at most 100 characters.");
  }
  if (/^\s*[=+\-@]/.test(game) || /^\s*[=+\-@]/.test(participant)) {
    throw new Error("Game and participant names cannot start with =, +, - or @.");
  }
  scoreValue(score);
  return { date, game, participant, score };
}

function recordKey(record) {
  return JSON.stringify([record.date, key(record.game), key(record.participant)]);
}

function mergeRecords(existing, incoming) {
  const merged = new Map(existing.map(record => [recordKey(record), record]));
  for (const record of incoming) merged.set(recordKey(record), record);
  const types = new Map();
  for (const record of merged.values()) {
    const game = key(record.game);
    const type = scoreValue(record.score).type;
    if (types.has(game) && types.get(game) !== type) {
      throw new Error(`All scores for ${record.game} must be either numbers or times, not both.`);
    }
    types.set(game, type);
  }
  return [...merged.values()];
}

function save(next) {
  localStorage.setItem(storageKey, JSON.stringify(next));
  records = next;
  render();
}

function message(text) {
  $("message").textContent = text;
}

function csvRows(text) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else if (char === '"' && !field && !closed) {
      quoted = true;
    } else {
      if (char === '"' || closed) throw new Error("Invalid CSV quoting.");
      field += char;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  if (field || row.length || closed) rows.push([...row, field]);
  return rows.filter(row => row.some(field => field.trim()));
}

function importCsv(text) {
  const rows = csvRows(text);
  const header = rows.shift();
  if (!header || header.length !== 4 ||
      header.map(value => value.trim().toLowerCase()).join(",") !== "date,game,participant,score") {
    throw new Error("CSV header must be date,game,participant,score.");
  }
  const incoming = rows.map((row, index) => {
    try {
      if (row.length !== 4) throw new Error("Expected four columns.");
      return validateRecord({ date: row[0], game: row[1], participant: row[2], score: row[3] });
    } catch (error) {
      throw new Error(`CSV record ${index + 2}: ${error.message}`);
    }
  });
  if (!incoming.length) throw new Error("CSV contains no scores.");
  save(mergeRecords(records, incoming));
  message(`Imported ${incoming.length} score${incoming.length === 1 ? "" : "s"}.`);
}

function csvField(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const lines = ["date,game,participant,score"];
  for (const record of records) {
    lines.push([record.date, record.game, record.participant, record.score].map(csvField).join(","));
  }
  const url = URL.createObjectURL(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "linkedin-game-scores.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgElement(name, attributes, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatValue(value, type) {
  if (type === "number") return Number(value.toPrecision(4)).toString();
  const seconds = Math.round(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % (hours ? 60 : Infinity);
  return `${hours ? hours + ":" + String(minutes).padStart(2, "0") : minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderGraph(selected) {
  const graph = $("graph");
  const legend = $("legend");
  graph.replaceChildren();
  legend.replaceChildren();
  const data = records.filter(record => key(record.game) === selected);
  $("graph-empty").hidden = data.length > 0;
  $("graph-container").hidden = data.length === 0;
  if (!data.length) return;

  const dates = data.map(record => Date.parse(`${record.date}T00:00:00Z`));
  const values = data.map(record => scoreValue(record.score).value);
  const minDate = Math.min(...dates), maxDate = Math.max(...dates);
  const minValue = Math.min(...values), maxValue = Math.max(...values);
  const padding = maxValue === minValue ? Math.max(maxValue * .1, 1) : (maxValue - minValue) * .1;
  const bottomValue = Math.max(0, minValue - padding), topValue = maxValue + padding;
  const x = date => maxDate === minDate ? 425 : 90 + (date - minDate) / (maxDate - minDate) * 670;
  const y = value => 300 - (value - bottomValue) / (topValue - bottomValue) * 260;
  const type = scoreValue(data[0].score).type;
  graph.append(svgElement("line", { x1: 90, y1: 40, x2: 90, y2: 300, stroke: "#8799a6" }));
  graph.append(svgElement("line", { x1: 90, y1: 300, x2: 760, y2: 300, stroke: "#8799a6" }));
  for (let i = 0; i <= 4; i++) {
    const value = bottomValue + (topValue - bottomValue) * i / 4;
    const yy = y(value);
    graph.append(svgElement("line", { x1: 90, y1: yy, x2: 760, y2: yy, stroke: "#e1e8ed" }));
    graph.append(svgElement("text", { x: 82, y: yy + 4, "text-anchor": "end" }, formatValue(value, type)));
  }
  const daySpan = Math.round((maxDate - minDate) / dayMs);
  const tickCount = Math.min(daySpan, 5);
  for (let i = 0; i <= tickCount; i++) {
    const date = minDate + (tickCount ? Math.round(daySpan * i / tickCount) : 0) * dayMs;
    graph.append(svgElement("text", { x: x(date), y: 325, "text-anchor": "middle" }, new Date(date).toISOString().slice(0, 10)));
  }

  const participants = new Map();
  for (const record of data) {
    const id = key(record.participant);
    if (!participants.has(id)) participants.set(id, []);
    participants.get(id).push(record);
  }
  let index = 0;
  for (const entries of participants.values()) {
    entries.sort((a, b) => a.date.localeCompare(b.date));
    const color = colors[index++ % colors.length];
    const item = document.createElement("li");
    item.style.setProperty("--color", color);
    item.textContent = entries[0].participant;
    legend.append(item);
    let previous;
    for (const record of entries) {
      const date = Date.parse(`${record.date}T00:00:00Z`);
      const point = { date, x: x(date), y: y(scoreValue(record.score).value) };
      if (previous && date - previous.date === dayMs) {
        graph.append(svgElement("line", { x1: previous.x, y1: previous.y, x2: point.x, y2: point.y, stroke: color, "stroke-width": 2 }));
      }
      const circle = svgElement("circle", { cx: point.x, cy: point.y, r: 5, fill: color });
      circle.append(svgElement("title", {}, `${record.participant}: ${record.score} on ${record.date}`));
      graph.append(circle);
      previous = point;
    }
  }
}

function render() {
  const filter = $("game-filter");
  const previous = filter.value;
  const games = new Map();
  for (const record of records) games.set(key(record.game), record.game);
  filter.replaceChildren();
  for (const [id, name] of [...games].sort((a, b) => a[1].localeCompare(b[1]))) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    filter.append(option);
  }
  if (games.has(previous)) filter.value = previous;
  filter.disabled = !games.size;
  renderGraph(filter.value);

  const body = $("scores");
  body.replaceChildren();
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || a.game.localeCompare(b.game) || a.participant.localeCompare(b.participant));
  for (const record of sorted) {
    const row = document.createElement("tr");
    for (const value of [record.date, record.game, record.participant, record.score]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const cell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Delete";
    button.setAttribute("aria-label", `Delete ${record.participant}'s ${record.game} score on ${record.date}`);
    button.addEventListener("click", () => {
      try {
        save(records.filter(item => recordKey(item) !== recordKey(record)));
        message("Score deleted.");
      } catch (error) { message(`Could not save scores: ${error.message}`); }
    });
    cell.append(button);
    row.append(cell);
    body.append(row);
  }
  $("table-empty").hidden = records.length > 0;
  $("export").disabled = records.length === 0;
}

$("score-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const record = validateRecord({ date: $("date").value, game: $("game").value, participant: $("participant").value, score: $("score").value });
    save(mergeRecords(records, [record]));
    message("Score saved.");
    $("score").value = "";
  } catch (error) { message(error.message); }
});

$("import").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { importCsv(await file.text()); }
  catch (error) { message(error.message); }
  finally { event.target.value = ""; }
});
$("export").addEventListener("click", exportCsv);
$("game-filter").addEventListener("change", event => renderGraph(event.target.value));

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (!Array.isArray(saved)) throw new Error("Invalid saved data.");
  records = mergeRecords([], saved.map(validateRecord));
} catch (error) {
  message(`Could not load saved scores: ${error.message}`);
}
const today = new Date();
$("date").value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
render();
