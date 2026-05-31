const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const TOPICS_DIR = path.join(ROOT, "data", "topics");
const OUTPUT_FILE = path.join(ROOT, "training.js");
const PAIRS_PER_BLOCK = 4;

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

function normalizeLine(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function dedupePairs(pairs) {
  const seen = new Set();
  const unique = [];

  for (const pair of pairs) {
    const user = normalizeLine(pair.user);
    const ai = normalizeLine(pair.ai);

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

function chunkPairs(pairs, size) {
  const chunks = [];

  for (let i = 0; i < pairs.length; i += size) {
    chunks.push(pairs.slice(i, i + size));
  }

  return chunks;
}

function blockFromPairs(pairs) {
  const lines = [];

  for (const pair of pairs) {
    lines.push(`    user: ${pair.user}`);
    lines.push(`    ai: ${pair.ai}`);
  }

  return ["  `", ...lines, "  `"].join("\n");
}

function buildTrainingData(topics) {
  const blocks = [];

  for (const topic of topics) {
    const uniquePairs = dedupePairs(topic.pairs);
    const chunks = chunkPairs(uniquePairs, PAIRS_PER_BLOCK);

    for (const chunk of chunks) {
      blocks.push(blockFromPairs(chunk));
    }
  }

  return `const trainingData = [\n${blocks.join(",\n\n")}\n];\n`;
}

function main() {
  const topics = readTopicFiles();
  const output = buildTrainingData(topics);
  fs.writeFileSync(OUTPUT_FILE, output, "utf8");

  const topicCount = topics.length;
  const pairCount = topics.reduce((sum, topic) => sum + topic.pairs.length, 0);
  console.log(`Built training.js from ${topicCount} topic files and ${pairCount} pairs.`);
}

main();
