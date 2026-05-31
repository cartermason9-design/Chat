const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const TOPICS_DIR = path.join(ROOT, "data", "topics");
const OUTPUT_FILE = path.join(ROOT, "model.json");
const CONTEXT_SIZE = 3;
const START = "<start>";
const END = "<end>";

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\bu\b/g, "you")
    .replace(/\bim\b/g, "i'm")
    .replace(/\bwhats\b/g, "what's")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/[^\w\s.!?']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function makeKey(words) {
  return words.join(" ");
}

function readTopicFiles() {
  const files = fs
    .readdirSync(TOPICS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  const allTopics = [];

  for (const file of files) {
    const filePath = path.join(TOPICS_DIR, file);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (!parsed.topic || !Array.isArray(parsed.pairs)) {
      throw new Error(`Invalid topic file: ${file}`);
    }

    if (parsed.enabled === false) {
      continue;
    }

    allTopics.push(parsed);
  }

  return allTopics;
}

function dedupePairs(pairs) {
  const seen = new Set();
  const unique = [];

  for (const pair of pairs) {
    const user = String(pair.user || "").trim();
    const ai = String(pair.ai || "").trim();

    if (!user || !ai) {
      continue;
    }

    const key = `${user.toLowerCase()}|||${ai.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push({ user, ai });
  }

  return unique;
}

function addTransition(model, key, nextWord) {
  if (!model.chains[key]) {
    model.chains[key] = { total: 0, next: {} };
  }

  model.chains[key].next[nextWord] = (model.chains[key].next[nextWord] || 0) + 1;
  model.chains[key].total += 1;
}

function addPair(model, pair) {
  model.examples.push(pair);
  model.defaultReplies.push(pair.ai);

  const words = [
    ...Array(CONTEXT_SIZE).fill(START),
    ...tokenize(pair.ai),
    END,
  ];

  if (words.length > CONTEXT_SIZE) {
    model.starters.push(makeKey(words.slice(0, CONTEXT_SIZE)));
  }

  for (let i = 0; i < words.length - CONTEXT_SIZE; i += 1) {
    const key = makeKey(words.slice(i, i + CONTEXT_SIZE));
    addTransition(model, key, words[i + CONTEXT_SIZE]);
  }
}

function buildModel(topics) {
  const model = {
    contextSize: CONTEXT_SIZE,
    chains: {},
    starters: [],
    defaultReplies: [],
    examples: [],
    stats: {
      topics: topics.length,
      pairs: 0,
      states: 0,
    },
  };

  for (const topic of topics) {
    const uniquePairs = dedupePairs(topic.pairs);

    for (const pair of uniquePairs) {
      addPair(model, pair);
      model.stats.pairs += 1;
    }
  }

  model.stats.states = Object.keys(model.chains).length;
  return model;
}

function main() {
  const topics = readTopicFiles();
  const model = buildModel(topics);
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(model)}\n`, "utf8");
  console.log(
    `Built model.json from ${model.stats.topics} topic files, ${model.stats.pairs} pairs, and ${model.stats.states} states.`
  );
}

main();
