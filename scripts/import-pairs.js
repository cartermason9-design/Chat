const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const TOPICS_DIR = path.join(ROOT, "data", "topics");

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    topic: "",
    userField: "user",
    aiField: "ai",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--input") args.input = next;
    if (arg === "--output") args.output = next;
    if (arg === "--topic") args.topic = next;
    if (arg === "--user-field") args.userField = next;
    if (arg === "--ai-field") args.aiField = next;
  }

  if (!args.input || !args.output || !args.topic) {
    throw new Error(
      "Usage: npm run import:pairs -- --input data/raw/file.json --output imported.json --topic imported-topic"
    );
  }

  return args;
}

function normalizeCell(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((value) => value.trim());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const record = {};

    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    return record;
  });
}

function parseJsonLike(inputPath, content) {
  if (inputPath.endsWith(".json")) {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.pairs || [];
  }

  if (inputPath.endsWith(".jsonl")) {
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  if (inputPath.endsWith(".csv")) {
    return parseCsv(content);
  }

  throw new Error("Supported input formats: .json, .jsonl, .csv");
}

function toPairs(records, userField, aiField) {
  return records
    .map((record) => ({
      user: normalizeCell(record[userField]),
      ai: normalizeCell(record[aiField]),
    }))
    .filter((pair) => pair.user && pair.ai);
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.join(ROOT, args.input);
  const outputPath = path.join(TOPICS_DIR, args.output);
  const content = fs.readFileSync(inputPath, "utf8");
  const records = parseJsonLike(inputPath, content);
  const pairs = toPairs(records, args.userField, args.aiField);

  const payload = {
    topic: args.topic,
    source: args.input,
    pairs,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Imported ${pairs.length} pairs into ${path.relative(ROOT, outputPath)}.`);
}

main();
