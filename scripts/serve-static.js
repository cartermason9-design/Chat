const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 4173);
const MODEL_FILE = path.join(ROOT, "model.json");
const CHAR_TRANSFORMER_FILE = path.join(ROOT, "char-transformer.json");
const NEURAL_MODEL_FILE = path.join(ROOT, "neural-model.json");
const CONTEXT_SIZE = 3;
const START = "<start>";
const END = "<end>";
const UNKNOWN_REPLY_OPTIONS = [
  "I am not fully sure yet. Try asking that in a different way or give me more detail.",
  "I do not have a strong match for that yet, but you can ask me about coding, tech, learning, or simple facts.",
  "I am not confident about that answer yet. A more specific question would help.",
];
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "do",
  "for",
  "how",
  "i",
  "is",
  "it",
  "me",
  "my",
  "of",
  "or",
  "the",
  "to",
  "u",
  "what",
  "you",
]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

const model = JSON.parse(fs.readFileSync(MODEL_FILE, "utf8"));
const charTransformer = fs.existsSync(CHAR_TRANSFORMER_FILE)
  ? JSON.parse(fs.readFileSync(CHAR_TRANSFORMER_FILE, "utf8"))
  : null;
const neuralModel = fs.existsSync(NEURAL_MODEL_FILE)
  ? JSON.parse(fs.readFileSync(NEURAL_MODEL_FILE, "utf8"))
  : null;
const conversationState = {
  recentTopic: "",
};

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

function getProbabilityMap(key) {
  const state = model.chains[key];
  if (!state) return null;

  const probabilities = {};
  for (const [word, count] of Object.entries(state.next)) {
    probabilities[word] = count / state.total;
  }

  return probabilities;
}

function sampleFromProbabilities(probabilities, temperature) {
  const entries = Object.entries(probabilities);
  const adjusted = entries.map(([word, probability]) => [
    word,
    Math.pow(probability, 1 / temperature),
  ]);

  const total = adjusted.reduce((sum, [, weight]) => sum + weight, 0);
  let randomPoint = Math.random() * total;

  for (const [word, weight] of adjusted) {
    randomPoint -= weight;
    if (randomPoint <= 0) {
      return word;
    }
  }

  return adjusted[0][0];
}

function getBackoffKeys(words) {
  const candidates = [];

  for (let knownCount = Math.min(words.length, CONTEXT_SIZE); knownCount >= 0; knownCount -= 1) {
    const knownWords = knownCount === 0 ? [] : words.slice(-knownCount);
    const padded = [
      ...Array(CONTEXT_SIZE - knownCount).fill(START),
      ...knownWords,
    ];
    candidates.push(makeKey(padded));
  }

  return [...new Set(candidates)];
}

function pickStartingKey(words) {
  const candidates = getBackoffKeys(words);

  for (const candidate of candidates) {
    if (model.chains[candidate]) {
      return candidate;
    }
  }

  return model.starters[Math.floor(Math.random() * model.starters.length)];
}

function getSeededResult(replyText) {
  const replyWords = tokenize(replyText);
  if (!replyWords.length) {
    return null;
  }

  const seedWords = replyWords.slice(0, CONTEXT_SIZE);
  const context = [
    ...Array(Math.max(CONTEXT_SIZE - seedWords.length, 0)).fill(START),
    ...seedWords,
  ];

  return {
    key: makeKey(context),
    result: [...seedWords],
  };
}

function clean(text) {
  let cleaned = text.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\b(\w+)( \1\b)+/gi, "$1");
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  if (!/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }

  return cleaned;
}

function isYesNoQuestion(text) {
  return /^(is|are|do|does|did|can|could|should|would|will|was|were|has|have|had)\b/.test(
    normalizeText(text)
  );
}

function shapeReplyForPrompt(inputText, replyText) {
  const normalizedInput = normalizeText(inputText);
  let shapedReply = clean(replyText);

  if (!isYesNoQuestion(normalizedInput)) {
    shapedReply = shapedReply.replace(/^(Yes|No),?\s+/i, "");
  }

  if (tokenize(normalizedInput).length === 1) {
    shapedReply = shapedReply.replace(/^It is\s+/i, "");
    shapedReply = shapedReply.replace(/^It\s+/i, "");
  }

  return clean(shapedReply);
}

function fallbackResponse(text) {
  const normalized = normalizeText(text);

  if (normalized.includes("hello") || normalized.includes("hi") || normalized.includes("hey")) {
    return "Hello! Ask me anything and I will build a reply from my training data.";
  }

  if (normalized.includes("how are you")) {
    return "I'm doing well. My tiny probability brain is ready.";
  }

  if (normalized.includes("joke")) {
    return "Why do small language models stay calm? They trust the distribution.";
  }

  return UNKNOWN_REPLY_OPTIONS[
    Math.floor(Math.random() * UNKNOWN_REPLY_OPTIONS.length)
  ];
}

function getIntentResponse(text) {
  const normalized = normalizeText(text);

  if (/^(hello|hi|hey|yo|good morning|good evening)$/.test(normalized)) {
    return "Hello! How are you doing today?";
  }

  if (normalized === "what are you") {
    return "I'm a small AI chatbot built with JavaScript.";
  }

  if (normalized === "how do you work") {
    return "I generate replies using simple probability patterns from training data.";
  }

  return null;
}

function trySolveMath(inputText) {
  const raw = String(inputText || "").trim().toLowerCase();
  const stripped = raw
    .replace(/^what('?s| is)\s+/i, "")
    .replace(/^calculate\s+/i, "")
    .replace(/^solve\s+/i, "")
    .replace(/\?+$/g, "")
    .trim();

  if (!/^[\d\s+\-*/().]+$/.test(stripped)) {
    return null;
  }

  if (!/\d/.test(stripped)) {
    return null;
  }

  try {
    const value = Function(`"use strict"; return (${stripped})`)();

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    const formatted = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
    return `The answer is ${formatted}.`;
  } catch {
    return null;
  }
}

function getKeywordWeight(word) {
  if (STOP_WORDS.has(word)) {
    return 0.4;
  }

  if (word.length >= 6) {
    return 1.8;
  }

  return 1.2;
}

function scoreExampleMatch(inputWords, exampleWords) {
  const inputSet = new Set(inputWords);
  const exampleSet = new Set(exampleWords);
  let overlap = 0;

  for (const word of inputSet) {
    if (exampleSet.has(word)) {
      overlap += getKeywordWeight(word);
    }
  }

  const inputPhrase = inputWords.join(" ");
  const examplePhrase = exampleWords.join(" ");

  if (inputPhrase === examplePhrase) {
    overlap += 6;
  } else if (examplePhrase.includes(inputPhrase) || inputPhrase.includes(examplePhrase)) {
    overlap += 2;
  }

  return overlap;
}

function getExampleSeed(inputText) {
  const inputWords = tokenize(inputText);
  let bestExample = null;
  let bestScore = 0;
  let bestCoverage = 0;

  for (const example of model.examples) {
    const exampleWords = tokenize(example.user);
    const score = scoreExampleMatch(inputWords, exampleWords);
    const coverage = score / Math.max(inputWords.length, exampleWords.length, 1);

    if (score > bestScore || (score === bestScore && coverage > bestCoverage)) {
      bestScore = score;
      bestCoverage = coverage;
      bestExample = example;
    }
  }

  if (!bestExample || bestScore === 0) {
    return null;
  }

  return {
    ...bestExample,
    score: bestScore,
    coverage: bestCoverage,
  };
}

function getPromptProfile(text) {
  const normalized = normalizeText(text);
  const words = tokenize(normalized);

  return {
    normalized,
    words,
    isGreeting: /^(hello|hi|hey|yo|good morning|good evening)\b/.test(normalized),
    isThanks: /^(thanks|thank you|thx)\b/.test(normalized),
    isQuestion: /^(what|why|how|when|where|who|can|could|would|should|is|are|do|does|did)\b/.test(normalized),
    isCommand: /^(dont|don't|do not|stop|avoid|say|tell|show|give|explain|help)\b/.test(normalized),
    hasNegation: /\b(no|not|never|don't|dont|do not|can't|cannot|won't|wont|shouldn't|shouldnt)\b/.test(normalized),
    isJoke: normalized.includes("joke") || normalized.includes("funny"),
    isFacty: /^(what is|what are|is |are )/.test(normalized),
  };
}

function getExampleProfile(text) {
  return getPromptProfile(text);
}

function getExampleReply(example) {
  return example?.reply || example?.ai || "";
}

function isCompatibleFamily(inputProfile, exampleProfile) {
  if (inputProfile.isGreeting && !exampleProfile.isGreeting) {
    return false;
  }

  if (inputProfile.isThanks && !exampleProfile.isThanks) {
    return false;
  }

  if (inputProfile.isJoke && !exampleProfile.isJoke) {
    return false;
  }

  if (inputProfile.hasNegation && exampleProfile.isGreeting) {
    return false;
  }

  if (inputProfile.isCommand && exampleProfile.isGreeting && !inputProfile.isGreeting) {
    return false;
  }

  return true;
}

function getTopExampleMatches(inputText, limit = 5) {
  const inputProfile = getPromptProfile(inputText);
  const inputWords = inputProfile.words;
  const matches = [];

  for (const example of model.examples) {
    const exampleWords = tokenize(example.user);
    const score = scoreExampleMatch(inputWords, exampleWords);
    if (score <= 0) {
      continue;
    }

    const coverage = score / Math.max(inputWords.length, exampleWords.length, 1);
    const exampleProfile = getExampleProfile(example.user);

    if (!isCompatibleFamily(inputProfile, exampleProfile)) {
      continue;
    }

    let adjustedScore = score;
    if (normalizeText(example.user) === inputProfile.normalized) {
      adjustedScore += 8;
    }
    if (inputProfile.isGreeting && exampleProfile.isGreeting) {
      adjustedScore += 3;
    }
    if (inputProfile.isThanks && exampleProfile.isThanks) {
      adjustedScore += 3;
    }
    if (inputProfile.isFacty && exampleProfile.isFacty) {
      adjustedScore += 1.5;
    }

    matches.push({
      ...example,
      score: adjustedScore,
      coverage,
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.coverage - a.coverage;
  });

  return matches.slice(0, limit);
}

function getContentWords(words) {
  return words.filter((word) => !STOP_WORDS.has(word) && word.length >= 3);
}

function getSharedContentWordCount(inputText, example) {
  const inputWords = new Set(getContentWords(tokenize(inputText)));
  const exampleWords = new Set([
    ...getContentWords(tokenize(example.user || "")),
    ...getContentWords(tokenize(getExampleReply(example))),
  ]);

  let count = 0;
  for (const word of inputWords) {
    if (exampleWords.has(word)) {
      count += 1;
    }
  }

  return count;
}

function getSharedContentWords(inputText, example) {
  const inputWords = new Set(getContentWords(tokenize(inputText)));
  const exampleWords = new Set([
    ...getContentWords(tokenize(example.user || "")),
    ...getContentWords(tokenize(getExampleReply(example))),
  ]);

  const shared = [];
  for (const word of inputWords) {
    if (exampleWords.has(word)) {
      shared.push(word);
    }
  }

  return shared;
}

function isWeakTopicPrompt(inputText) {
  const words = tokenize(inputText);
  const contentWords = getContentWords(words);
  return contentWords.length <= 2;
}

function maybeParaphrase(text) {
  const variants = [
    [/^i am\b/i, "I'm"],
    [/\bi am\b/gi, "I'm"],
    [/\byou are\b/gi, "you're"],
    [/\bit is\b/gi, "it's"],
    [/\bthat is\b/gi, "that's"],
    [/\bdo not\b/gi, "don't"],
    [/\bcan not\b/gi, "can't"],
    [/\bbuilt with\b/gi, Math.random() < 0.5 ? "built using" : "made with"],
    [/\bused to\b/gi, Math.random() < 0.5 ? "used to" : "meant to"],
    [/\breally not\b/gi, "not really"],
  ];

  let result = text;
  for (const [pattern, replacement] of variants) {
    if (Math.random() < 0.55) {
      result = result.replace(pattern, replacement);
    }
  }

  return clean(result);
}

function splitInformativeClauses(text) {
  return String(text || "")
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function combineReplies(primaryReply, secondaryReply) {
  const primaryClauses = splitInformativeClauses(primaryReply);
  const secondaryClauses = splitInformativeClauses(secondaryReply);
  const first = primaryClauses[0] || primaryReply;
  const second = secondaryClauses.find((clause) => {
    const a = new Set(tokenize(first));
    const b = tokenize(clause);
    let overlap = 0;
    for (const token of b) {
      if (a.has(token)) {
        overlap += 1;
      }
    }
    return overlap < Math.max(2, Math.floor(b.length * 0.5));
  });

  if (!second) {
    return first;
  }

  const joiner = Math.random() < 0.5 ? ", and " : ". ";
  if (joiner === ". ") {
    return clean(`${first}. ${second}`);
  }

  const lowerSecond = second.charAt(0).toLowerCase() + second.slice(1);
  return clean(`${first}${joiner}${lowerSecond}`);
}

function generateGroundedReply(inputText) {
  const mathReply = trySolveMath(inputText);
  if (mathReply) {
    return mathReply;
  }

  const inputProfile = getPromptProfile(inputText);
  const matches = getTopExampleMatches(inputText, 6);

  if (!matches.length) {
    return null;
  }

  const top = matches[0];
  const exactMatch = normalizeText(top.user) === inputProfile.normalized;
  const strongTop =
    top.score >= 3 ||
    top.coverage >= 0.65 ||
    (inputProfile.isGreeting && top.coverage >= 0.3);

  const sharedContentWords = getSharedContentWordCount(inputText, top);
  const sharedWords = getSharedContentWords(inputText, top);

  if (!strongTop) {
    return null;
  }

  if (inputProfile.isFacty && sharedContentWords === 0) {
    return null;
  }

  if (inputProfile.isQuestion && !inputProfile.isGreeting && sharedContentWords === 0) {
    return null;
  }

  if (
    inputProfile.isFacty &&
    sharedContentWords < 2 &&
    !sharedWords.some((word) => word === "chess" || word === "dog" || word === "laptop")
  ) {
    return null;
  }

  if (
    exactMatch ||
    inputProfile.isGreeting ||
    inputProfile.isThanks ||
    inputProfile.isJoke ||
    tokenize(inputProfile.normalized).length <= 2
  ) {
    return shapeReplyForPrompt(inputText, maybeParaphrase(getExampleReply(top)));
  }

  const supporting = matches.find((match) => {
    if (match === top) {
      return false;
    }
    return match.score >= Math.max(2, top.score * 0.55);
  });

  const composed = supporting
    ? combineReplies(getExampleReply(top), getExampleReply(supporting))
    : getExampleReply(top);

  return shapeReplyForPrompt(inputText, maybeParaphrase(composed));
}

function shouldUseWebFallback(inputText) {
  const profile = getPromptProfile(inputText);
  if (profile.isGreeting || profile.isThanks || profile.isJoke) {
    return false;
  }

  return profile.isFacty || profile.isQuestion;
}

function extractSearchTopic(inputText) {
  const normalized = normalizeText(inputText)
    .replace(/^(what is|what are|who is|who are|tell me about)\s+/i, "")
    .replace(/^(is|are)\s+/i, "")
    .replace(/\?+$/g, "")
    .trim();

  return normalized || normalizeText(inputText);
}

async function fetchWikipediaSummary(topic) {
  if (!topic) {
    return null;
  }

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(topic)}&limit=1&namespace=0&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "mini-lm-local-project/1.0",
        Accept: "application/json",
      },
    });

    if (!searchResponse.ok) {
      return null;
    }

    const searchPayload = await searchResponse.json();
    const firstTitle = Array.isArray(searchPayload?.[1]) ? searchPayload[1][0] : null;

    if (!firstTitle) {
      return null;
    }

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;
    const response = await fetch(summaryUrl, {
      headers: {
        "User-Agent": "mini-lm-local-project/1.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload.extract) {
      return null;
    }

    return {
      text: payload.extract,
      source: payload.content_urls?.desktop?.page || payload.content_urls?.mobile?.page || "",
      title: payload.title || firstTitle,
    };
  } catch {
    return null;
  }
}

async function generateWebFallbackReply(inputText) {
  if (!shouldUseWebFallback(inputText)) {
    return null;
  }

  const topic = extractSearchTopic(inputText);
  const summary = await fetchWikipediaSummary(topic);

  if (!summary) {
    return {
      reply: "I could not find a reliable answer for that right now.",
      source: "",
      failed: true,
    };
  }

  const firstSentence = summary.text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)[0];

  if (!firstSentence) {
    return null;
  }

  return {
      reply: clean(firstSentence),
      source: summary.source,
      failed: false,
    };
}

function shouldAllowFreeGeneration(inputText, groundedReply, webFallback) {
  if (groundedReply) {
    return true;
  }

  if (webFallback?.reply) {
    return false;
  }

  const profile = getPromptProfile(inputText);
  if (profile.isFacty || profile.isQuestion || isWeakTopicPrompt(inputText)) {
    return false;
  }

  return true;
}

function isStrongExampleMatch(exampleSeed, inputWords) {
  if (!exampleSeed) {
    return false;
  }

  const inputContentWords = inputWords.filter((word) => !STOP_WORDS.has(word));
  const exampleWords = tokenize(exampleSeed.user);
  const sharedContentWords = inputContentWords.filter((word) =>
    exampleWords.includes(word)
  );

  if (!inputContentWords.length) {
    return exampleSeed.coverage >= 1.2;
  }

  if (sharedContentWords.length === 0) {
    return false;
  }

  return exampleSeed.score >= 2.4 && exampleSeed.coverage >= 0.6;
}

function scoreResponse(text, inputWords, exampleSeed) {
  const words = tokenize(text);
  let score = words.length;

  if (words.length < 5) score -= 20;
  if (/[.!?]$/.test(text)) score += 2;
  if (words.length >= 6) score += 4;
  if (words.length >= 8) score += 2;
  if (words.length > 16) score -= (words.length - 16) * 1.5;
  if (new Set(words).size === words.length) score += 1;

  const repetitionPenalty = words.length - new Set(words).size;
  score -= repetitionPenalty * 3;

  const strongStarts = new Set([
    "hello",
    "hi",
    "yes",
    "i'm",
    "i",
    "technology",
    "javascript",
    "why",
    "sure",
  ]);

  if (words[0] && strongStarts.has(words[0])) {
    score += 3;
  }

  const weakFragments = new Set(["and", "or", "but", "in", "to", "it", "its"]);
  if (words[0] && weakFragments.has(words[0])) {
    score -= 8;
  }

  if (exampleSeed) {
    score += scoreExampleMatch(words, tokenize(getExampleReply(exampleSeed)));
  } else {
    score += scoreExampleMatch(words, inputWords) * 0.5;
  }

  if (conversationState.recentTopic) {
    score += scoreExampleMatch(words, tokenize(conversationState.recentTopic)) * 0.3;
  }

  return score;
}

function generateResponse(inputText, temperature) {
  const intentReply = getIntentResponse(inputText);
  if (intentReply) {
    return intentReply;
  }

  const words = tokenize(inputText);
  const rawExampleSeed = getExampleSeed(inputText);
  const exampleSeed = isStrongExampleMatch(rawExampleSeed, words)
    ? rawExampleSeed
    : null;

  if (
    exampleSeed &&
    normalizeText(exampleSeed.user) === normalizeText(inputText) &&
    words.length <= 3
  ) {
    return clean(getExampleReply(exampleSeed));
  }

  const seeded = exampleSeed ? getSeededResult(getExampleReply(exampleSeed)) : null;
  let key = seeded ? seeded.key : pickStartingKey(words);

  if (!key) {
    return fallbackResponse(inputText);
  }

  const result = seeded ? [...seeded.result] : key.startsWith(START) ? [] : key.split(" ");
  const seenCounts = {};
  const maxWords = 18;
  const minWords = 5;

  for (let i = 0; i < maxWords; i += 1) {
    const probabilityMap = getProbabilityMap(key);
    if (!probabilityMap) break;

    let nextWord = sampleFromProbabilities(probabilityMap, temperature);
    let attempts = 0;

    while (nextWord !== END && seenCounts[nextWord] >= 2 && attempts < 5) {
      nextWord = sampleFromProbabilities(probabilityMap, temperature);
      attempts += 1;
    }

    if (nextWord === END) {
      if (result.length < minWords && attempts < 8) {
        continue;
      }
      break;
    }

    result.push(nextWord);
    seenCounts[nextWord] = (seenCounts[nextWord] || 0) + 1;

    const context = [...Array(CONTEXT_SIZE).fill(START), ...result].slice(-CONTEXT_SIZE);
    key = makeKey(context);
  }

  if (!result.length) {
    return fallbackResponse(inputText);
  }

  if (result.length < minWords) {
    if (exampleSeed) {
      return shapeReplyForPrompt(inputText, getExampleReply(exampleSeed));
    }
    return fallbackResponse(inputText);
  }

  return shapeReplyForPrompt(inputText, result.join(" "));
}

function generateBestResponse(inputText, temperature) {
  const inputWords = tokenize(inputText);
  const rawExampleSeed = getExampleSeed(inputText);
  const exampleSeed = isStrongExampleMatch(rawExampleSeed, inputWords)
    ? rawExampleSeed
    : null;
  const candidates = [];

  for (let i = 0; i < 8; i += 1) {
    candidates.push(generateResponse(inputText, temperature));
  }

  candidates.sort(
    (a, b) =>
      scoreResponse(b, inputWords, exampleSeed) -
      scoreResponse(a, inputWords, exampleSeed)
  );

  conversationState.recentTopic = normalizeText(inputText);
  return candidates[0];
}

function safePathFromUrl(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(ROOT, `.${relativePath}`);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
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

function sampleFromTopK(probabilities, topK, temperature) {
  const indexed = probabilities
    .map((probability, index) => ({ probability, index }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topK)
    .map((item) => ({
      ...item,
      weight: Math.pow(Math.max(item.probability, 1e-9), 1 / temperature),
    }));

  const total = indexed.reduce((sum, item) => sum + item.weight, 0);
  let randomPoint = Math.random() * total;

  for (const item of indexed) {
    randomPoint -= item.weight;
    if (randomPoint <= 0) {
      return item.index;
    }
  }

  return indexed[0].index;
}

function cleanNeuralText(text) {
  return clean(text.replace(/\s+([?.!,])/g, "$1"));
}

function looksReadable(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length < 8) {
    return false;
  }

  if (!/[aeiou]/i.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3) {
    return false;
  }

  const alphaChars = (trimmed.match(/[a-z]/gi) || []).length;
  if (alphaChars < Math.max(6, Math.floor(trimmed.length * 0.45))) {
    return false;
  }

  const weirdRuns = trimmed.match(/([a-z])\1{3,}/gi);
  if (weirdRuns && weirdRuns.length) {
    return false;
  }

  let shortWordCount = 0;
  for (const word of words) {
    if (word.length <= 2) {
      shortWordCount += 1;
    }
  }

  if (shortWordCount > words.length * 0.75) {
    return false;
  }

  const punctuationRuns = trimmed.match(/[?.!,]{2,}/g);
  if (punctuationRuns && punctuationRuns.length) {
    return false;
  }

  return true;
}

function generateCharTransformerReply(inputText, temperature) {
  if (!charTransformer) {
    return null;
  }

  const {
    vocab,
    charToId,
    tokenEmb,
    posEmb,
    wq,
    wk,
    wv,
    wo,
    w1,
    b1,
    w2,
    b2,
    wOut,
    bOut,
    modelDim,
    ffDim,
    maxChars,
    bosId,
    sepId,
    eosId,
    unkId,
    padId,
  } = charTransformer;

  const promptIds = [...normalizeText(inputText)]
    .slice(0, Math.max(1, maxChars - 8))
    .map((char) => charToId[char] ?? unkId);

  const sequence = [bosId, ...promptIds, sepId];
  const maxGenerate = Math.min(64, maxChars - sequence.length);

  function sampleChar(probabilities) {
    const blocked = new Set([padId, bosId, sepId, unkId]);
    const candidates = probabilities
      .map((probability, index) => ({ probability, index }))
      .filter((item) => !blocked.has(item.index))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        weight: Math.pow(Math.max(item.probability, 1e-9), 1 / Math.max(temperature, 0.25)),
      }));

    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let randomPoint = Math.random() * total;

    for (const item of candidates) {
      randomPoint -= item.weight;
      if (randomPoint <= 0) {
        return item.index;
      }
    }

    return candidates[0]?.index ?? eosId;
  }

  function forwardStep(ids) {
    const T = ids.length;
    const x = Array.from({ length: T }, () => Array(modelDim).fill(0));
    const q = Array.from({ length: T }, () => Array(modelDim).fill(0));
    const k = Array.from({ length: T }, () => Array(modelDim).fill(0));
    const v = Array.from({ length: T }, () => Array(modelDim).fill(0));
    const scale = 1 / Math.sqrt(modelDim);

    for (let t = 0; t < T; t += 1) {
      const tokenId = ids[t];
      for (let d = 0; d < modelDim; d += 1) {
        x[t][d] = tokenEmb[tokenId][d] + posEmb[t][d];
      }

      for (let d2 = 0; d2 < modelDim; d2 += 1) {
        let qSum = 0;
        let kSum = 0;
        let vSum = 0;

        for (let d1 = 0; d1 < modelDim; d1 += 1) {
          qSum += x[t][d1] * wq[d1][d2];
          kSum += x[t][d1] * wk[d1][d2];
          vSum += x[t][d1] * wv[d1][d2];
        }

        q[t][d2] = qSum;
        k[t][d2] = kSum;
        v[t][d2] = vSum;
      }
    }

    const t = T - 1;
    const scores = [];
    for (let j = 0; j <= t; j += 1) {
      let dot = 0;
      for (let d = 0; d < modelDim; d += 1) {
        dot += q[t][d] * k[j][d];
      }
      scores.push(dot * scale);
    }

    const attention = softmax(scores);
    const attnVec = Array(modelDim).fill(0);
    for (let j = 0; j <= t; j += 1) {
      for (let d = 0; d < modelDim; d += 1) {
        attnVec[d] += attention[j] * v[j][d];
      }
    }

    const h = Array(modelDim).fill(0);
    for (let d2 = 0; d2 < modelDim; d2 += 1) {
      let sum = 0;
      for (let d1 = 0; d1 < modelDim; d1 += 1) {
        sum += attnVec[d1] * wo[d1][d2];
      }
      h[d2] = x[t][d2] + sum;
    }

    const ff = Array(ffDim).fill(0);
    for (let f = 0; f < ffDim; f += 1) {
      let sum = b1[f];
      for (let d = 0; d < modelDim; d += 1) {
        sum += h[d] * w1[d][f];
      }
      ff[f] = Math.tanh(sum);
    }

    const y = Array(modelDim).fill(0);
    for (let d2 = 0; d2 < modelDim; d2 += 1) {
      let sum = b2[d2];
      for (let f = 0; f < ffDim; f += 1) {
        sum += ff[f] * w2[f][d2];
      }
      y[d2] = h[d2] + sum;
    }

    const logits = Array(vocab.length).fill(0);
    for (let vIndex = 0; vIndex < vocab.length; vIndex += 1) {
      let sum = bOut[vIndex];
      for (let d = 0; d < modelDim; d += 1) {
        sum += y[d] * wOut[d][vIndex];
      }
      logits[vIndex] = sum;
    }

    return softmax(logits);
  }

  const attempts = 4;
  let bestText = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const localSequence = [...sequence];
    const generated = [];

    for (let step = 0; step < maxGenerate; step += 1) {
      const probabilities = forwardStep(localSequence);
      const nextId = sampleChar(probabilities);

      if (nextId === eosId) {
        break;
      }

      localSequence.push(nextId);
      generated.push(vocab[nextId]);
    }

    const text = generated.join("").trim();
    if (!text || /unk/i.test(text)) {
      continue;
    }

    const cleanedText = clean(text);
    if (!looksReadable(cleanedText)) {
      continue;
    }

    const words = cleanedText.split(/\s+/).filter(Boolean);
    let score = words.length;
    if (/[.!?]$/.test(cleanedText)) score += 2;
    if (words.length >= 5) score += 3;
    if (words.length > 14) score -= 2;

    if (score > bestScore) {
      bestScore = score;
      bestText = cleanedText;
    }
  }

  return bestText;
}

function generateNeuralReply(inputText, temperature) {
  if (!neuralModel) {
    return null;
  }

  const tokenToId = neuralModel.tokenToId;
  const idToToken = neuralModel.vocab;
  const padId = tokenToId["<pad>"];
  const bosId = tokenToId["<bos>"];
  const sepId = tokenToId["<sep>"];
  const eosId = tokenToId["<eos>"];
  const unkId = tokenToId["<unk>"];
  const promptIds = tokenize(inputText).map((token) => tokenToId[token] ?? unkId);
  const history = [bosId, ...promptIds, sepId];
  const generated = [];
  const maxTokens = 24;

  for (let step = 0; step < maxTokens; step += 1) {
    const context = Array(neuralModel.contextSize).fill(padId);
    const visible = history.slice(-neuralModel.contextSize);
    context.splice(context.length - visible.length, visible.length, ...visible);

    const x = [];
    for (const tokenId of context) {
      const embedding = neuralModel.embeddings[tokenId];
      for (let i = 0; i < embedding.length; i += 1) {
        x.push(embedding[i]);
      }
    }

    const hidden = Array(neuralModel.hiddenSize).fill(0);
    for (let h = 0; h < neuralModel.hiddenSize; h += 1) {
      let sum = neuralModel.b1[h];
      for (let i = 0; i < x.length; i += 1) {
        sum += x[i] * neuralModel.w1[i][h];
      }
      hidden[h] = Math.tanh(sum);
    }

    const logits = Array(idToToken.length).fill(0);
    for (let v = 0; v < idToToken.length; v += 1) {
      let sum = neuralModel.b2[v];
      for (let h = 0; h < neuralModel.hiddenSize; h += 1) {
        sum += hidden[h] * neuralModel.w2[h][v];
      }
      logits[v] = sum;
    }

    const probabilities = softmax(logits);
    const nextId = sampleFromTopK(probabilities, 20, Math.max(temperature, 0.4));

    if (nextId === eosId) {
      break;
    }

    if (nextId === sepId || nextId === bosId || nextId === padId) {
      continue;
    }

    generated.push(nextId);
    history.push(nextId);
  }

  if (!generated.length) {
    return null;
  }

  const text = generated.map((tokenId) => idToToken[tokenId]).join(" ");
  return cleanNeuralText(text);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = req.url || "/";

  if (method === "GET" && url === "/api/status") {
    return sendJson(res, 200, {
      ready: true,
      mode: charTransformer ? "char-transformer" : neuralModel ? "neural" : "ngram",
      stats: charTransformer
        ? {
            pairs: charTransformer.stats.pairs,
            states: charTransformer.stats.sequences,
            vocabSize: charTransformer.stats.vocabSize,
          }
        : neuralModel
          ? {
            pairs: neuralModel.stats.pairs,
            states: neuralModel.stats.trainingExamples,
            vocabSize: neuralModel.stats.vocabSize,
          }
          : model.stats,
    });
  }

  if (method === "POST" && url === "/api/chat") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const message = String(body.message || "").trim();
      const temperature = Number(body.temperature || 0.9);

      if (!message) {
        return sendJson(res, 400, { error: "Message is required." });
      }

      const normalizedTemperature = Number.isFinite(temperature)
        ? temperature
        : 0.9;
      const groundedReply = generateGroundedReply(message);
      const webFallback = groundedReply ? null : await generateWebFallbackReply(message);
      const shouldStopAfterWebFailure = webFallback?.failed && shouldUseWebFallback(message);
      const allowFreeGeneration = shouldAllowFreeGeneration(
        message,
        groundedReply,
        webFallback
      );
      const reply = shouldStopAfterWebFailure
        ? webFallback.reply
        : groundedReply ||
          webFallback?.reply ||
          (allowFreeGeneration
            ? generateCharTransformerReply(message, normalizedTemperature) ||
              generateNeuralReply(message, normalizedTemperature) ||
              generateBestResponse(message, normalizedTemperature)
            : "I could not find a reliable answer for that right now.");

      return sendJson(res, 200, {
        reply,
        source: webFallback?.source || "",
      });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || "Server error" });
    }
  }

  const filePath = safePathFromUrl(url);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
  if (charTransformer) {
    console.log(
      `Loaded char transformer with ${charTransformer.stats.pairs} pairs and vocab size ${charTransformer.stats.vocabSize}.`
    );
  } else if (neuralModel) {
    console.log(
      `Loaded neural model with ${neuralModel.stats.pairs} pairs and vocab size ${neuralModel.stats.vocabSize}.`
    );
  } else {
    console.log(
      `Loaded n-gram model with ${model.stats.pairs} replies and ${model.stats.states} states.`
    );
  }
});
