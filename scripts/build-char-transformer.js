const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const TOPICS_DIR = path.join(ROOT, "data", "topics");
const OUTPUT_FILE = path.join(ROOT, "char-transformer.json");

const PAD = "\u0000";
const BOS = "\u0001";
const SEP = "\u0002";
const EOS = "\u0003";
const UNK = "\u0004";

const MAX_CHARS = 72;
const MODEL_DIM = 24;
const FF_DIM = 48;
const DEFAULT_MAX_PAIRS = 800;
const DEFAULT_EPOCHS = 2;
const LEARNING_RATE = 0.004;
const TOPICS_LARGE_THRESHOLD = 5000;

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
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
    const user = normalizeText(pair.user);
    const ai = normalizeText(pair.ai);

    if (!user || !ai) {
      continue;
    }

    const key = `${user}|||${ai}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push({ user, ai });
  }

  return unique;
}

function samplePairs(topics, maxPairs) {
  const curated = [];
  const large = [];

  for (const topic of topics) {
    const pairs = dedupePairs(topic.pairs);
    if (pairs.length > TOPICS_LARGE_THRESHOLD) {
      large.push(...pairs);
    } else {
      curated.push(...pairs);
    }
  }

  if (maxPairs <= 0) {
    return [...curated, ...large];
  }

  if (curated.length >= maxPairs) {
    return curated.slice(0, maxPairs);
  }

  const remaining = maxPairs - curated.length;
  const sampledLarge = [];
  const step = Math.max(1, Math.floor(large.length / Math.max(remaining, 1)));

  for (let i = 0; i < large.length && sampledLarge.length < remaining; i += step) {
    sampledLarge.push(large[i]);
  }

  return [...curated, ...sampledLarge];
}

function buildCharset(pairs) {
  const chars = new Set([PAD, BOS, SEP, EOS, UNK]);

  for (const pair of pairs) {
    for (const char of `${pair.user}${pair.ai}`) {
      chars.add(char);
    }
  }

  const vocab = [...chars];
  const charToId = Object.fromEntries(vocab.map((char, index) => [char, index]));
  return { vocab, charToId };
}

function pairToSequence(pair, charToId) {
  const text = `${BOS}${pair.user}${SEP}${pair.ai}${EOS}`;
  return [...text].slice(0, MAX_CHARS).map((char) => charToId[char] ?? charToId[UNK]);
}

function buildSequences(pairs, charToId) {
  return pairs
    .map((pair) => pairToSequence(pair, charToId))
    .filter((sequence) => sequence.length >= 2);
}

function randomWeight(scale = 0.08) {
  return (Math.random() * 2 - 1) * scale;
}

function zeros(length) {
  return Array.from({ length }, () => 0);
}

function zerosMatrix(rows, cols) {
  return Array.from({ length: rows }, () => zeros(cols));
}

function randomMatrix(rows, cols, scale) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => randomWeight(scale))
  );
}

function addInPlace(target, source) {
  for (let i = 0; i < target.length; i += 1) {
    target[i] += source[i];
  }
}

function matVecMul(vector, matrix, outSize) {
  const out = zeros(outSize);

  for (let j = 0; j < outSize; j += 1) {
    let sum = 0;
    for (let i = 0; i < vector.length; i += 1) {
      sum += vector[i] * matrix[i][j];
    }
    out[j] = sum;
  }

  return out;
}

function vecMatMul(vector, matrix, out) {
  for (let j = 0; j < out.length; j += 1) {
    let sum = 0;
    for (let i = 0; i < vector.length; i += 1) {
      sum += vector[i] * matrix[i][j];
    }
    out[j] += sum;
  }
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

function initModel(vocabSize) {
  return {
    type: "char-transformer",
    padId: 0,
    bosId: 1,
    sepId: 2,
    eosId: 3,
    unkId: 4,
    maxChars: MAX_CHARS,
    modelDim: MODEL_DIM,
    ffDim: FF_DIM,
    tokenEmb: randomMatrix(vocabSize, MODEL_DIM, 0.08),
    posEmb: randomMatrix(MAX_CHARS, MODEL_DIM, 0.05),
    wq: randomMatrix(MODEL_DIM, MODEL_DIM, 0.08),
    wk: randomMatrix(MODEL_DIM, MODEL_DIM, 0.08),
    wv: randomMatrix(MODEL_DIM, MODEL_DIM, 0.08),
    wo: randomMatrix(MODEL_DIM, MODEL_DIM, 0.08),
    w1: randomMatrix(MODEL_DIM, FF_DIM, 0.08),
    b1: zeros(FF_DIM),
    w2: randomMatrix(FF_DIM, MODEL_DIM, 0.08),
    b2: zeros(MODEL_DIM),
    wOut: randomMatrix(MODEL_DIM, vocabSize, 0.08),
    bOut: zeros(vocabSize),
  };
}

function createGradients(model) {
  return {
    tokenEmb: zerosMatrix(model.tokenEmb.length, MODEL_DIM),
    posEmb: zerosMatrix(model.posEmb.length, MODEL_DIM),
    wq: zerosMatrix(MODEL_DIM, MODEL_DIM),
    wk: zerosMatrix(MODEL_DIM, MODEL_DIM),
    wv: zerosMatrix(MODEL_DIM, MODEL_DIM),
    wo: zerosMatrix(MODEL_DIM, MODEL_DIM),
    w1: zerosMatrix(MODEL_DIM, FF_DIM),
    b1: zeros(FF_DIM),
    w2: zerosMatrix(FF_DIM, MODEL_DIM),
    b2: zeros(MODEL_DIM),
    wOut: zerosMatrix(MODEL_DIM, model.wOut[0].length),
    bOut: zeros(model.bOut.length),
  };
}

function forwardSequence(model, inputIds) {
  const T = inputIds.length;
  const x = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const q = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const k = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const v = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const scores = Array.from({ length: T }, () => zeros(T));
  const attn = Array.from({ length: T }, () => zeros(T));
  const attnVec = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const attnOut = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const h = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const z1 = Array.from({ length: T }, () => zeros(FF_DIM));
  const ff = Array.from({ length: T }, () => zeros(FF_DIM));
  const z2 = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const y = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const logits = Array.from({ length: T }, () => zeros(model.bOut.length));
  const probs = Array.from({ length: T }, () => zeros(model.bOut.length));

  for (let t = 0; t < T; t += 1) {
    const tokenId = inputIds[t];

    for (let d = 0; d < MODEL_DIM; d += 1) {
      x[t][d] = model.tokenEmb[tokenId][d] + model.posEmb[t][d];
    }

    for (let d2 = 0; d2 < MODEL_DIM; d2 += 1) {
      let qSum = 0;
      let kSum = 0;
      let vSum = 0;

      for (let d1 = 0; d1 < MODEL_DIM; d1 += 1) {
        qSum += x[t][d1] * model.wq[d1][d2];
        kSum += x[t][d1] * model.wk[d1][d2];
        vSum += x[t][d1] * model.wv[d1][d2];
      }

      q[t][d2] = qSum;
      k[t][d2] = kSum;
      v[t][d2] = vSum;
    }
  }

  const scale = 1 / Math.sqrt(MODEL_DIM);

  for (let t = 0; t < T; t += 1) {
    const maskedScores = [];

    for (let j = 0; j <= t; j += 1) {
      let dot = 0;
      for (let d = 0; d < MODEL_DIM; d += 1) {
        dot += q[t][d] * k[j][d];
      }
      const score = dot * scale;
      scores[t][j] = score;
      maskedScores.push(score);
    }

    const soft = softmax(maskedScores);

    for (let j = 0; j <= t; j += 1) {
      attn[t][j] = soft[j];
      for (let d = 0; d < MODEL_DIM; d += 1) {
        attnVec[t][d] += attn[t][j] * v[j][d];
      }
    }

    for (let d2 = 0; d2 < MODEL_DIM; d2 += 1) {
      let sum = 0;
      for (let d1 = 0; d1 < MODEL_DIM; d1 += 1) {
        sum += attnVec[t][d1] * model.wo[d1][d2];
      }
      attnOut[t][d2] = sum;
      h[t][d2] = x[t][d2] + sum;
    }

    for (let f = 0; f < FF_DIM; f += 1) {
      let sum = model.b1[f];
      for (let d = 0; d < MODEL_DIM; d += 1) {
        sum += h[t][d] * model.w1[d][f];
      }
      z1[t][f] = sum;
      ff[t][f] = Math.tanh(sum);
    }

    for (let d2 = 0; d2 < MODEL_DIM; d2 += 1) {
      let sum = model.b2[d2];
      for (let f = 0; f < FF_DIM; f += 1) {
        sum += ff[t][f] * model.w2[f][d2];
      }
      z2[t][d2] = sum;
      y[t][d2] = h[t][d2] + sum;
    }

    for (let vIndex = 0; vIndex < model.bOut.length; vIndex += 1) {
      let sum = model.bOut[vIndex];
      for (let d = 0; d < MODEL_DIM; d += 1) {
        sum += y[t][d] * model.wOut[d][vIndex];
      }
      logits[t][vIndex] = sum;
    }

    probs[t] = softmax(logits[t]);
  }

  return { x, q, k, v, scores, attn, attnVec, attnOut, h, z1, ff, z2, y, logits, probs };
}

function backwardSequence(model, inputIds, targetIds, cache) {
  const grads = createGradients(model);
  const T = inputIds.length;
  const dx = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const dq = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const dk = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const dv = Array.from({ length: T }, () => zeros(MODEL_DIM));
  const scale = 1 / Math.sqrt(MODEL_DIM);

  for (let t = T - 1; t >= 0; t -= 1) {
    const dLogits = cache.probs[t].slice();
    dLogits[targetIds[t]] -= 1;

    for (let d = 0; d < MODEL_DIM; d += 1) {
      for (let vocabIndex = 0; vocabIndex < model.bOut.length; vocabIndex += 1) {
        grads.wOut[d][vocabIndex] += cache.y[t][d] * dLogits[vocabIndex];
      }
    }

    addInPlace(grads.bOut, dLogits);

    const dy = zeros(MODEL_DIM);
    for (let d = 0; d < MODEL_DIM; d += 1) {
      let sum = 0;
      for (let vocabIndex = 0; vocabIndex < model.bOut.length; vocabIndex += 1) {
        sum += model.wOut[d][vocabIndex] * dLogits[vocabIndex];
      }
      dy[d] = sum;
    }

    const dh = dy.slice();
    const dff = zeros(FF_DIM);

    for (let f = 0; f < FF_DIM; f += 1) {
      for (let d = 0; d < MODEL_DIM; d += 1) {
        grads.w2[f][d] += cache.ff[t][f] * dy[d];
        dff[f] += model.w2[f][d] * dy[d];
      }
    }

    addInPlace(grads.b2, dy);

    const dz1 = zeros(FF_DIM);
    for (let f = 0; f < FF_DIM; f += 1) {
      dz1[f] = dff[f] * (1 - cache.ff[t][f] * cache.ff[t][f]);
      grads.b1[f] += dz1[f];
    }

    for (let d = 0; d < MODEL_DIM; d += 1) {
      for (let f = 0; f < FF_DIM; f += 1) {
        grads.w1[d][f] += cache.h[t][d] * dz1[f];
        dh[d] += model.w1[d][f] * dz1[f];
      }
    }

    const dAttnOut = dh.slice();
    const dAttnVec = zeros(MODEL_DIM);

    for (let d1 = 0; d1 < MODEL_DIM; d1 += 1) {
      for (let d2 = 0; d2 < MODEL_DIM; d2 += 1) {
        grads.wo[d1][d2] += cache.attnVec[t][d1] * dAttnOut[d2];
        dAttnVec[d1] += model.wo[d1][d2] * dAttnOut[d2];
      }
    }

    addInPlace(dx[t], dh);

    const dAttn = zeros(T);
    for (let j = 0; j <= t; j += 1) {
      for (let d = 0; d < MODEL_DIM; d += 1) {
        dv[j][d] += cache.attn[t][j] * dAttnVec[d];
        dAttn[j] += dAttnVec[d] * cache.v[j][d];
      }
    }

    let weighted = 0;
    for (let j = 0; j <= t; j += 1) {
      weighted += dAttn[j] * cache.attn[t][j];
    }

    for (let j = 0; j <= t; j += 1) {
      const dScore = cache.attn[t][j] * (dAttn[j] - weighted);

      for (let d = 0; d < MODEL_DIM; d += 1) {
        dq[t][d] += dScore * cache.k[j][d] * scale;
        dk[j][d] += dScore * cache.q[t][d] * scale;
      }
    }
  }

  for (let t = 0; t < T; t += 1) {
    for (let d1 = 0; d1 < MODEL_DIM; d1 += 1) {
      for (let d2 = 0; d2 < MODEL_DIM; d2 += 1) {
        grads.wq[d1][d2] += cache.x[t][d1] * dq[t][d2];
        grads.wk[d1][d2] += cache.x[t][d1] * dk[t][d2];
        grads.wv[d1][d2] += cache.x[t][d1] * dv[t][d2];
        dx[t][d1] += model.wq[d1][d2] * dq[t][d2];
        dx[t][d1] += model.wk[d1][d2] * dk[t][d2];
        dx[t][d1] += model.wv[d1][d2] * dv[t][d2];
      }
    }
  }

  for (let t = 0; t < T; t += 1) {
    const tokenId = inputIds[t];
    for (let d = 0; d < MODEL_DIM; d += 1) {
      grads.tokenEmb[tokenId][d] += dx[t][d];
      grads.posEmb[t][d] += dx[t][d];
    }
  }

  return grads;
}

function applyGradients(model, grads, clipScale = 1) {
  function stepMatrix(weights, gradMatrix) {
    for (let i = 0; i < weights.length; i += 1) {
      for (let j = 0; j < weights[i].length; j += 1) {
        weights[i][j] -= LEARNING_RATE * clipScale * gradMatrix[i][j];
      }
    }
  }

  function stepVector(weights, gradVector) {
    for (let i = 0; i < weights.length; i += 1) {
      weights[i] -= LEARNING_RATE * clipScale * gradVector[i];
    }
  }

  stepMatrix(model.tokenEmb, grads.tokenEmb);
  stepMatrix(model.posEmb, grads.posEmb);
  stepMatrix(model.wq, grads.wq);
  stepMatrix(model.wk, grads.wk);
  stepMatrix(model.wv, grads.wv);
  stepMatrix(model.wo, grads.wo);
  stepMatrix(model.w1, grads.w1);
  stepVector(model.b1, grads.b1);
  stepMatrix(model.w2, grads.w2);
  stepVector(model.b2, grads.b2);
  stepMatrix(model.wOut, grads.wOut);
  stepVector(model.bOut, grads.bOut);
}

function sequenceLoss(probabilities, targetIds) {
  let loss = 0;
  for (let t = 0; t < targetIds.length; t += 1) {
    loss -= Math.log(Math.max(probabilities[t][targetIds[t]], 1e-9));
  }
  return loss / targetIds.length;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function main() {
  const args = parseArgs(process.argv);
  const topics = readEnabledTopics();
  const pairs = samplePairs(topics, args.maxPairs);
  const { vocab, charToId } = buildCharset(pairs);
  const sequences = buildSequences(pairs, charToId);
  const model = initModel(vocab.length);

  for (let epoch = 0; epoch < args.epochs; epoch += 1) {
    shuffleInPlace(sequences);
    let totalLoss = 0;

    for (const sequence of sequences) {
      const inputIds = sequence.slice(0, -1);
      const targetIds = sequence.slice(1);
      const cache = forwardSequence(model, inputIds);
      totalLoss += sequenceLoss(cache.probs, targetIds);
      const grads = backwardSequence(model, inputIds, targetIds, cache);
      applyGradients(model, grads, 0.25);
    }

    const avgLoss = totalLoss / Math.max(sequences.length, 1);
    console.log(`Epoch ${epoch + 1}/${args.epochs} avg loss: ${avgLoss.toFixed(4)}`);
  }

  const payload = {
    ...model,
    vocab,
    charToId,
    stats: {
      pairs: pairs.length,
      sequences: sequences.length,
      vocabSize: vocab.length,
      epochs: args.epochs,
      maxChars: MAX_CHARS,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(
    `Built char-transformer.json with ${pairs.length} pairs, ${sequences.length} sequences, and vocab size ${vocab.length}.`
  );
}

main();
