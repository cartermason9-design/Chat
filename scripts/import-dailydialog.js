const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(
  ROOT,
  "data",
  "raw",
  "dailydialog",
  "train",
  "dialogues_train.txt"
);
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "data",
  "topics",
  "dailydialog-train.full.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    topic: "dailydialog-train",
    enabled: false,
    limit: 0,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--input") args.input = path.resolve(ROOT, next);
    if (arg === "--output") args.output = path.resolve(ROOT, next);
    if (arg === "--topic") args.topic = next;
    if (arg === "--enabled") args.enabled = next === "true";
    if (arg === "--limit") args.limit = Number(next || 0);
  }

  return args;
}

function normalizeUtterance(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/â€™/g, "'")
    .replace(/ã€‚/g, ".")
    .trim();
}

function buildPairsFromDialogues(content, limit = 0) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const pairs = [];

  for (const line of lines) {
    const turns = line
      .split("__eou__")
      .map((part) => normalizeUtterance(part))
      .filter(Boolean);

    for (let i = 0; i + 1 < turns.length; i += 2) {
      pairs.push({
        user: turns[i],
        ai: turns[i + 1],
      });

      if (limit > 0 && pairs.length >= limit) {
        return pairs;
      }
    }
  }

  return pairs;
}

function main() {
  const args = parseArgs(process.argv);
  const content = fs.readFileSync(args.input, "utf8");
  const pairs = buildPairsFromDialogues(content, args.limit);

  const payload = {
    topic: args.topic,
    source: path.relative(ROOT, args.input),
    enabled: args.enabled,
    pairs,
  };

  fs.writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    `Imported ${pairs.length} DailyDialog pairs into ${path.relative(ROOT, args.output)} (enabled=${args.enabled}).`
  );
}

main();
