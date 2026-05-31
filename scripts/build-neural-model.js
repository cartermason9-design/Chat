const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const TOPICS_DIR = path.join(ROOT, "data", "topics");
const OUTPUT_FILE = path.join(ROOT, "neural-model.json");

const PAD = "<pad>";
const BOS = "<bos>";
const SEP = "<sep>";
const EOS = "<eos>";
const UNK = "<unk>";

const CONTEXT_SIZE = 8;
const EMBED_SIZE = 24;
const HIDDEN_SIZE = 64;
const MAX_VOCAB = 2000;
const DEFAULT_MAX_PAIRS = 1500;
const DEFAULT_EPOCHS = 2;
const LEARNING_RATE = 0.03;

function parseArgs(argv) {
  const args = {
    maxPairs: DEFAULT_MAX_PAIRS,
    epochs: DEFAULT_EPOCHS,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--max-pairs") {
      args.maxPairs = Number(next || DEFAULT_MAX_PAIRS);
    }

    if (arg === "--epochs") {
      args.epochs = Number(next || DEFAULT_EPOCHS);
    }
  }

  return args;
}

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

function readEnabledTopics() {
  const files = fs
    .readdirSync(TOPICS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  const topics = [];

  for (const file of files) {
    const payload = JSON.parse(
      fs.readFileSync(path.join(TOPICS_DIR, file), "utf8")
    );

    if (!payload.topic || !Array.isArray(payload.pairs)) {
      throw new Error(`Invalid topic file: ${file}`);
    }

    if (payload.enabled === false) {
      continue;
    }

    topics.push(payload);
  }

  return topics;
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

function sampleLargeTopicPairs(topics, maxPairs) {
  const smallPairs = [];
  const largePairs = [];

  for (const topic of topics) {
    const pairs = dedupePairs(topic.pairs);

    if (pairs.length > 5000) {
      for (const pair of pairs) {
        largePairs.push(pair);
      }
    } else {
      for (const pair of pairs) {
        smallPairs.push(pair);
      }
    }
  }

  if (maxPairs <= 0) {
    return [...smallPairs, ...largePairs];
  }

  if (smallPairs.length >= maxPairs) {
    return smallPairs.slice(0, maxPairs);
  }

  const remaining = maxPairs - smallPairs.length;
  const step = Math.max(1, Math.floor(largePairs.length / Math.max(remaining, 1)));
  const sampledLargePairs = [];

  for (let i = 0; i < largePairs.length && sampledLargePairs.length < remaining; i += step) {
    sampledLargePairs.push(largePairs[i]);
  }

  return [...smallPairs, ...sampledLargePairs];
}

function buildVocab(pairs) {
  const counts = new Map();

  for (const pair of pairs) {
    const sequence = [...tokenize(pair.user), ...tokenize(pair.ai)];

    for (const token of sequence) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  const specialTokens = [PAD, BOS, SEP, EOS, UNK];
  const sortedTokens = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VOCAB - specialTokens.length)
    .map(([token]) => token);

  const vocab = [...specialTokens, ...sortedTokens];
  const tokenToId = Object.fromEntries(vocab.map((token, index) => [token, index]));

  return { vocab, tokenToId };
}

function pairToSequence(pair, tokenToId) {
  const userIds = tokenize(pair.user).map((token) => tokenToId[token] ?? tokenToId[UNK]);
  const aiIds = tokenize(pair.ai).map((token) => tokenToId[token] ?? tokenToId[UNK]);

  return [
    tokenToId[BOS],
    ...userIds,
    tokenToId[SEP],
    ...aiIds,
    tokenToId[EOS],
  ];
}

function buildTrainingExamples(pairs, tokenToId) {
  const examples = [];

  for (const pair of pairs) {
    const sequence = pairToSequence(pair, tokenToId);

    for (let index = 1; index < sequence.length; index += 1) {
      const context = Array(CONTEXT_SIZE).fill(tokenToId[PAD]);
      const start = Math.max(0, index - CONTEXT_SIZE);
      const visible = sequence.slice(start, index);
      context.splice(CONTEXT_SIZE - visible.length, visible.length, ...visible);
      examples.push({
        context,
        target: sequence[index],
      });
    }
  }

  return examples;
}

function randomWeight(scale = 0.08) {
  return (Math.random() * 2 - 1) * scale;
}

function initMatrix(rows, cols, scale) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => randomWeight(scale))
  );
}

function initVector(length) {
  return Array.from({ length }, () => 0);
}

function softmax(logits) {
  let maxLogit = -Infinity;

  for (const value of logits) {
    if (value > maxLogit) {
      maxLogit = value;
    }
  }

  const exps = logits.map((value) => Math.exp(value - maxLogit));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

function forward(model, context) {
  const x = [];

  for (const tokenId of context) {
    const embedding = model.embeddings[tokenId];
    for (let i = 0; i < embedding.length; i += 1) {
      x.push(embedding[i]);
    }
  }

  const hiddenPre = initVector(HIDDEN_SIZE);
  const hidden = initVector(HIDDEN_SIZE);

  for (let h = 0; h < HIDDEN_SIZE; h += 1) {
    let sum = model.b1[h];

    for (let i = 0; i < x.length; i += 1) {
      sum += x[i] * model.w1[i][h];
    }

    hiddenPre[h] = sum;
    hidden[h] = Math.tanh(sum);
  }

  const logits = initVector(model.vocab.length);

  for (let v = 0; v < model.vocab.length; v += 1) {
    let sum = model.b2[v];

    for (let h = 0; h < HIDDEN_SIZE; h += 1) {
      sum += hidden[h] * model.w2[h][v];
    }

    logits[v] = sum;
  }

  const probabilities = softmax(logits);
  return { x, hidden, probabilities };
}

function trainModel(trainingExamples, vocab) {
  const model = {
    vocab,
    contextSize: CONTEXT_SIZE,
    embedSize: EMBED_SIZE,
    hiddenSize: HIDDEN_SIZE,
    embeddings: initMatrix(vocab.length, EMBED_SIZE, 0.05),
    w1: initMatrix(CONTEXT_SIZE * EMBED_SIZE, HIDDEN_SIZE, 0.05),
    b1: initVector(HIDDEN_SIZE),
    w2: initMatrix(HIDDEN_SIZE, vocab.length, 0.05),
    b2: initVector(vocab.length),
  };

  return model;
}

function applyTrainingStep(model, example) {
  const { x, hidden, probabilities } = forward(model, example.context);
  const probs = probabilities.slice();
  probs[example.target] -= 1;

  for (let h = 0; h < HIDDEN_SIZE; h += 1) {
    for (let v = 0; v < model.vocab.length; v += 1) {
      model.w2[h][v] -= LEARNING_RATE * hidden[h] * probs[v];
    }
  }

  for (let v = 0; v < model.vocab.length; v += 1) {
    model.b2[v] -= LEARNING_RATE * probs[v];
  }

  const hiddenGrad = initVector(HIDDEN_SIZE);

  for (let h = 0; h < HIDDEN_SIZE; h += 1) {
    let sum = 0;

    for (let v = 0; v < model.vocab.length; v += 1) {
      sum += model.w2[h][v] * probs[v];
    }

    hiddenGrad[h] = sum * (1 - hidden[h] * hidden[h]);
  }

  for (let i = 0; i < x.length; i += 1) {
    for (let h = 0; h < HIDDEN_SIZE; h += 1) {
      model.w1[i][h] -= LEARNING_RATE * x[i] * hiddenGrad[h];
    }
  }

  for (let h = 0; h < HIDDEN_SIZE; h += 1) {
    model.b1[h] -= LEARNING_RATE * hiddenGrad[h];
  }

  for (let slot = 0; slot < example.context.length; slot += 1) {
    const tokenId = example.context[slot];
    const start = slot * EMBED_SIZE;

    for (let e = 0; e < EMBED_SIZE; e += 1) {
      let grad = 0;

      for (let h = 0; h < HIDDEN_SIZE; h += 1) {
        grad += model.w1[start + e][h] * hiddenGrad[h];
      }

      model.embeddings[tokenId][e] -= LEARNING_RATE * grad;
    }
  }
}

function trainEpochs(model, trainingExamples, epochs) {
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const example of trainingExamples) {
      applyTrainingStep(model, example);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  const topics = readEnabledTopics();
  const pairs = sampleLargeTopicPairs(topics, args.maxPairs);
  const { vocab, tokenToId } = buildVocab(pairs);
  const trainingExamples = buildTrainingExamples(pairs, tokenToId);
  const model = trainModel(trainingExamples, vocab);

  trainEpochs(model, trainingExamples, args.epochs);

  const payload = {
    type: "tiny-neural-lm",
    vocab: model.vocab,
    tokenToId,
    contextSize: CONTEXT_SIZE,
    embedSize: EMBED_SIZE,
    hiddenSize: HIDDEN_SIZE,
    embeddings: model.embeddings,
    w1: model.w1,
    b1: model.b1,
    w2: model.w2,
    b2: model.b2,
    stats: {
      pairs: pairs.length,
      vocabSize: vocab.length,
      trainingExamples: trainingExamples.length,
      epochs: args.epochs,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(
    `Built neural-model.json with ${pairs.length} pairs, ${trainingExamples.length} training examples, and vocab size ${vocab.length}.`
  );
}

main();
