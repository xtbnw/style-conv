import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";

export type RewriteMode = "basic" | "persona" | "mapping";

export interface StyleMetrics {
  corpusCount: number;
  averageSentenceLength: number;
  averageParagraphLength: number;
  topConnectors: string[];
  topColloquials: string[];
  abstractWordRatio: number;
  examplePreference: "high" | "medium" | "low";
  structurePreference: string;
}

export interface StylePortrait {
  summary: string;
  promptProfile: string;
  fewShotExamples: FewShotExample[];
  metrics: StyleMetrics;
}

export interface FewShotExample {
  id: string;
  content: string;
  source: "auto" | "manual";
}

export interface MappingEntry {
  id: string;
  official: string;
  preferred: string;
  note: string;
  source: "auto" | "manual";
  enabled: boolean;
}

export interface LexicalMapping {
  entries: MappingEntry[];
  preferredConnectors: string[];
  logicHabits: string[];
  summary: string;
  updatedAt: string;
}

export interface PersonaProfile {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  portrait: StylePortrait;
}

function normalizePortrait(portrait: StylePortrait): StylePortrait {
  return {
    ...portrait,
    fewShotExamples: Array.isArray(portrait.fewShotExamples) ? portrait.fewShotExamples : [],
  };
}

export interface PersonaSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  corpusCount: number;
  profileSummary: string;
  mappingSummary: string;
  metrics: StyleMetrics;
  mapping: LexicalMapping;
}

export interface PersonaDetail {
  profile: PersonaProfile;
  mapping: LexicalMapping;
  corpusCount: number;
  corpusFiles: string[];
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface RewriteRequest {
  mode: RewriteMode;
  personaId?: string;
  sourceText: string;
  instructions?: string;
  llm: LlmConfig;
}

export interface RewriteResponse {
  rewrittenText: string;
  usedMode: RewriteMode;
  profileSummary?: string;
  mappingSummary?: string;
  warnings: string[];
}

export class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

interface PersonaLlmUpdate {
  profileSummary: string;
  promptProfile: string;
  mappingSummary: string;
  preferredConnectors: string[];
  logicHabits: string[];
  fewShotExamples?: Array<{
    content: string;
    reason?: string;
  }>;
  entries: Array<{
    official: string;
    preferred: string;
    note?: string;
    enabled?: boolean;
  }>;
}

const DATA_ROOT = path.join(process.cwd(), "data", "personas");

const CONNECTOR_SEEDS = [
  "首先",
  "其次",
  "最后",
  "另外",
  "而且",
  "然后",
  "其实",
  "所以",
  "不过",
  "但是",
  "同时",
  "总的来说",
  "综上所述",
  "另一方面",
  "再者",
  "说白了",
  "说到底",
];

const COLLOQUIAL_SEEDS = [
  "我觉得",
  "其实",
  "真的",
  "有点",
  "感觉",
  "就是",
  "然后",
  "大概",
  "反正",
  "说白了",
  "说实话",
  "说到底",
  "还挺",
  "挺",
  "蛮",
  "先说",
  "再说",
];

const ABSTRACT_SEEDS = [
  "意义",
  "价值",
  "层面",
  "视角",
  "维度",
  "机制",
  "路径",
  "体系",
  "能力",
  "优化",
  "提升",
  "进一步",
  "有效",
  "显著",
];

const OFFICIAL_PHRASE_SEEDS = [
  "首先",
  "其次",
  "最后",
  "总的来说",
  "综上所述",
  "值得注意的是",
  "不可忽视的是",
  "从某种意义上来说",
  "在此基础上",
  "进一步来说",
  "由此可见",
  "换言之",
  "就此而言",
  "纵观来看",
  "笔者认为",
  "毋庸置疑",
  "需要指出的是",
  "归根结底",
  "与此同时",
  "从这个角度看",
  "从本质上讲",
  "显而易见",
  "有必要指出",
  "值得一提的是",
  "不可否认的是",
];

const OFFICIAL_DEFAULTS: Record<string, string[]> = {
  "首先": ["先说", "先看", "先讲"],
  "其次": ["然后", "再说", "再看"],
  "最后": ["最后再说", "最后一点", "收回来讲"],
  "总的来说": ["总的看", "整体上看", "大体来说"],
  "综上所述": ["总的看", "总的来说", "说到底"],
  "值得注意的是": ["其实", "有一点得说", "顺带一提"],
  "不可忽视的是": ["别忽略", "还有个点", "还有一点"],
  "从某种意义上来说": ["往简单了说", "换个说法", "某种程度上"],
  "在此基础上": ["接着往下说", "顺着这个", "在这个前提下"],
  "进一步来说": ["再往下说", "再展开点", "再补一句"],
  "由此可见": ["能看出来", "大概能说明", "也就能理解了"],
  "换言之": ["换个说法", "换句话说", "说白了"],
  "就此而言": ["这么看", "照这个看", "从这点看"],
  "纵观来看": ["整体看", "看下来", "大体看"],
  "笔者认为": ["我觉得", "我自己的看法是", "在我看来"],
  "毋庸置疑": ["基本可以确定", "这点没太大悬念", "差不多可以确定"],
  "需要指出的是": ["得先说明", "这里得提一句", "先补一句"],
  "归根结底": ["说到底", "往根上说", "归根到底"],
  "与此同时": ["同时", "另外一边", "同一时间"],
  "从这个角度看": ["这么看", "换个角度看", "从这点看"],
  "从本质上讲": ["往根上说", "说到底", "本质上看"],
  "显而易见": ["很明显", "基本一眼能看出来", "看得出来"],
  "有必要指出": ["得补一句", "这里得说清楚", "有个点得提"],
  "值得一提的是": ["顺带一提", "另外提一句", "有个细节挺重要"],
  "不可否认的是": ["得承认", "不能不承认", "有一说一"],
};

const DISTINCTIVE_PHRASE_BLACKLIST = new Set([
  "我们",
  "你们",
  "他们",
  "这个",
  "那个",
  "一种",
  "自己",
  "没有",
  "不是",
  "因为",
  "所以",
  "但是",
  "如果",
  "然后",
  "其实",
  "的话",
  "就是",
  "可以",
  "比较",
  "觉得",
  "进行",
  "以及",
  "对于",
  "通过",
  "为了",
]);

async function ensureDir(target: string) {
  await mkdir(target, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeSlug(input: string) {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "persona";
}

function personaDir(personaId: string) {
  return path.join(DATA_ROOT, personaId);
}

function profilePath(personaId: string) {
  return path.join(personaDir(personaId), "profile.json");
}

function mappingPath(personaId: string) {
  return path.join(personaDir(personaId), "mapping.json");
}

function corpusDir(personaId: string) {
  return path.join(personaDir(personaId), "corpus");
}

async function readJsonFile<T>(target: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(target, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(target: string, value: unknown) {
  await ensureDir(path.dirname(target));
  await writeFile(target, JSON.stringify(value, null, 2), "utf8");
}

function validateLlmConfig(llm: LlmConfig) {
  if (!llm.baseUrl.trim() || !llm.apiKey.trim() || !llm.model.trim()) {
    throw new AppError("请先填写完整的模型配置", 400);
  }
}

function splitParagraphs(content: string) {
  return content
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSentences(content: string) {
  return content
    .split(/[。！？!?；;\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function average(numbers: number[]) {
  if (numbers.length === 0) {
    return 0;
  }
  const sum = numbers.reduce((acc, item) => acc + item, 0);
  return Number((sum / numbers.length).toFixed(1));
}

function countPhraseHits(content: string, seeds: string[]) {
  return seeds
    .map((seed) => {
      const matches = content.match(new RegExp(seed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
      return {
        phrase: seed,
        count: matches?.length ?? 0,
      };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);
}

function inferStructurePreference(content: string) {
  const exampleHits = ["比如", "例如", "举个例子", "像", "拿"].reduce(
    (acc, phrase) => acc + (content.match(new RegExp(phrase, "g"))?.length ?? 0),
    0,
  );
  const conclusionHits = ["所以", "因此", "总的来说", "综上", "由此可见"].reduce(
    (acc, phrase) => acc + (content.match(new RegExp(phrase, "g"))?.length ?? 0),
    0,
  );

  if (exampleHits >= conclusionHits + 2) {
    return "解释时更爱先举例，再慢慢收束观点";
  }
  if (conclusionHits >= exampleHits + 2) {
    return "更常先给判断，再补理由和细节";
  }
  return "整体偏顺着思路展开，不会刻意把逻辑写得过满";
}

function normalizeSnippet(content: string, maxLength = 120) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  const clipped = compact.slice(0, maxLength);
  const punctuationIndex = Math.max(clipped.lastIndexOf("。"), clipped.lastIndexOf("！"), clipped.lastIndexOf("？"));
  const safeEnd = punctuationIndex >= 20 ? punctuationIndex + 1 : maxLength;
  return `${compact.slice(0, safeEnd).trim()}……`;
}

function normalizeCorpusText(content: string) {
  return content.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function dedupeCorpusTexts(contents: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const content of contents) {
    const normalized = normalizeCorpusText(content);
    const fingerprint = normalized.replace(/\s+/g, "");
    if (!normalized || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    unique.push(normalized);
  }

  return unique;
}

function scoreSnippet(content: string) {
  let score = 0;
  if (/[我我们]/.test(content)) {
    score += 3;
  }
  if (/(其实|不过|但是|所以|然后|另外|我觉得|有点|说白了|换个角度看)/.test(content)) {
    score += 4;
  }
  if (/[（(].+[）)]/.test(content)) {
    score += 2;
  }
  if (/(比如|例如|举个例子)/.test(content)) {
    score += 2;
  }
  const length = content.replace(/\s+/g, "").length;
  if (length >= 30 && length <= 180) {
    score += 3;
  }
  return score;
}

function selectRepresentativeSnippets(contents: string[], limit = 10) {
  const candidates = contents.flatMap((content) =>
    splitParagraphs(content)
      .map((paragraph) => normalizeSnippet(paragraph, 180))
      .filter((paragraph) => paragraph.length >= 28 && paragraph.length <= 180),
  );

  return candidates
    .map((content) => ({ content, score: scoreSnippet(content) }))
    .sort((left, right) => right.score - left.score || right.content.length - left.content.length)
    .reduce<string[]>((acc, item) => {
      if (!acc.includes(item.content)) {
        acc.push(item.content);
      }
      return acc;
    }, [])
    .slice(0, limit);
}

function extractDistinctivePhrases(contents: string[], limit = 18) {
  const counts = new Map<string, number>();
  const merged = contents.join("\n");
  const matches = merged.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [];

  for (const phrase of matches) {
    if (phrase.length < 2 || DISTINCTIVE_PHRASE_BLACKLIST.has(phrase)) {
      continue;
    }
    if (/^(一个|一些|一种|一样|什么|怎么|为什么|时候|事情|问题|东西|地方)$/.test(phrase)) {
      continue;
    }
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .map(([phrase]) => phrase)
    .filter((phrase, index, list) => !list.some((other, otherIndex) => otherIndex < index && other.includes(phrase)))
    .slice(0, limit);
}

function buildCorpusDigest(contents: string[]) {
  const uniqueContents = dedupeCorpusTexts(contents);
  return {
    uniqueContents,
    distinctivePhrases: extractDistinctivePhrases(uniqueContents),
    representativeSnippets: selectRepresentativeSnippets(uniqueContents),
  };
}

function buildFewShotExamples(contents: string[]) {
  const paragraphCandidates = contents.flatMap((content) =>
    splitParagraphs(content)
      .map((paragraph) => normalizeSnippet(paragraph, 120))
      .filter((paragraph) => paragraph.length >= 24 && paragraph.length <= 130),
  );

  const sentenceCandidates = contents.flatMap((content) =>
    splitSentences(content)
      .map((sentence) => normalizeSnippet(sentence, 60))
      .filter((sentence) => sentence.length >= 12 && sentence.length <= 60),
  );

  const candidates = [...paragraphCandidates, ...sentenceCandidates];
  const seen = new Set<string>();
  const examples: FewShotExample[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    examples.push({
      id: `example-${examples.length + 1}`,
      content: candidate,
      source: "auto",
    });
    if (examples.length >= 3) {
      break;
    }
  }

  return examples;
}

function buildPortrait(metrics: StyleMetrics, fewShotExamples: FewShotExample[] = []) {
  const connectorLine = metrics.topConnectors.length > 0 ? metrics.topConnectors.join("、") : "连接词使用不密";
  const colloquialLine = metrics.topColloquials.length > 0 ? metrics.topColloquials.join("、") : "口头词不固定";
  const sentenceBias =
    metrics.averageSentenceLength <= 18
      ? "句子偏短，通常一句只说一个意思。"
      : metrics.averageSentenceLength <= 28
        ? "句子长度中等，不喜欢特别长的绕句。"
        : "句子偏长，但整体还是以自然解释为主。";
  const abstractBias =
    metrics.abstractWordRatio < 0.03 ? "抽象词不多，更偏具体表达。" : "偶尔会用抽象词，但不明显堆概念。";
  const exampleBias =
    metrics.examplePreference === "high"
      ? "写说明时会主动举例。"
      : metrics.examplePreference === "medium"
        ? "会穿插例子，但不追求每段都举。"
        : "不依赖例子，更像边想边写。";

  const summary = [
    sentenceBias,
    `${abstractBias}${exampleBias}`,
    `常见连接词是 ${connectorLine}。`,
    `口头习惯更接近 ${colloquialLine}。`,
    metrics.structurePreference,
  ].join("");

  const promptProfile = [
    "请沿用下面这组写作习惯：",
    `1. ${sentenceBias}`,
    `2. ${abstractBias}${exampleBias}`,
    `3. 连接时优先考虑 ${connectorLine}，少用“首先/其次/最后/综上所述”这类标准模板。`,
    `4. 更像本人正常写作，口头习惯接近 ${colloquialLine}。`,
    `5. ${metrics.structurePreference}。`,
    "6. 可以保留少量主观感，不要把每一段都写成标准答案。",
  ].join("\n");

  return {
    summary,
    promptProfile,
    fewShotExamples,
    metrics,
  } satisfies StylePortrait;
}

function collectMetrics(contents: string[]) {
  const merged = contents.join("\n");
  const paragraphs = contents.flatMap(splitParagraphs);
  const sentences = contents.flatMap(splitSentences);
  const connectors = countPhraseHits(merged, CONNECTOR_SEEDS).slice(0, 5).map((item) => item.phrase);
  const colloquials = countPhraseHits(merged, COLLOQUIAL_SEEDS).slice(0, 6).map((item) => item.phrase);
  const abstractHits = ABSTRACT_SEEDS.reduce(
    (acc, phrase) => acc + (merged.match(new RegExp(phrase, "g"))?.length ?? 0),
    0,
  );
  const exampleHits = ["比如", "例如", "举个例子", "像", "拿"].reduce(
    (acc, phrase) => acc + (merged.match(new RegExp(phrase, "g"))?.length ?? 0),
    0,
  );
  const sentenceLengths = sentences.map((item) => item.replace(/\s+/g, "").length).filter((item) => item > 0);
  const paragraphLengths = paragraphs.map((item) => item.replace(/\s+/g, "").length).filter((item) => item > 0);
  const totalChars = merged.replace(/\s+/g, "").length || 1;

  return {
    corpusCount: contents.length,
    averageSentenceLength: average(sentenceLengths),
    averageParagraphLength: average(paragraphLengths),
    topConnectors: connectors,
    topColloquials: colloquials,
    abstractWordRatio: Number((abstractHits / totalChars).toFixed(4)),
    examplePreference: exampleHits >= 8 ? "high" : exampleHits >= 3 ? "medium" : "low",
    structurePreference: inferStructurePreference(merged),
  } satisfies StyleMetrics;
}

function selectPreferredConnector(metrics: StyleMetrics, used: string[]) {
  return (
    metrics.topConnectors.find((item) => !used.includes(item) && !["首先", "其次", "最后", "综上所述"].includes(item)) ??
    metrics.topColloquials.find((item) => !used.includes(item)) ??
    "然后"
  );
}

function buildMapping(metrics: StyleMetrics) {
  const usedPreferred: string[] = [];
  const entries: MappingEntry[] = OFFICIAL_PHRASE_SEEDS.map((official, index) => {
    const fallback = OFFICIAL_DEFAULTS[official] ?? ["换个自然说法"];
    const preferred =
      fallback.find((item) => metrics.topColloquials.includes(item)) ??
      fallback.find((item) => metrics.topConnectors.includes(item)) ??
      selectPreferredConnector(metrics, usedPreferred) ??
      fallback[0];
    usedPreferred.push(preferred);
    return {
      id: `${safeSlug(official)}-${index}`,
      official,
      preferred,
      note: "自动生成，可手动修改",
      source: "auto",
      enabled: true,
    };
  });

  const preferredConnectors = Array.from(new Set([...metrics.topConnectors, ...metrics.topColloquials])).slice(0, 6);
  const logicHabits = [
    metrics.structurePreference,
    metrics.examplePreference === "high" ? "更适合在抽象观点后补一个具体例子" : "不需要强行给每个点都配例子",
    metrics.averageParagraphLength > 120 ? "段落稍长，但不要故意拆成特别工整的三段论" : "段落保持自然长短，不追求整齐",
  ];
  const summary = [
    `优先把官样连接词替换成 ${preferredConnectors.join("、") || "更自然的过渡词"}`,
    `整体逻辑习惯：${logicHabits.join("；")}`,
  ].join("。");

  return {
    entries,
    preferredConnectors,
    logicHabits,
    summary,
    updatedAt: nowIso(),
  } satisfies LexicalMapping;
}

function buildEntryIndex(entries: MappingEntry[]) {
  const index = new Map<string, MappingEntry>();
  for (const entry of entries) {
    const official = entry.official.trim();
    const preferred = entry.preferred.trim();
    if (!official || !preferred || index.has(official)) {
      continue;
    }
    index.set(official, {
      ...entry,
      official,
      preferred,
    });
  }
  return index;
}

function dedupeStrings(values: string[], limit: number) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function sanitizeFewShotExamples(
  examples: PersonaLlmUpdate["fewShotExamples"],
  fallback: FewShotExample[],
  previous?: FewShotExample[],
) : FewShotExample[] {
  const manualExamples = (previous ?? []).filter((item) => item.source === "manual");
  const autoExamples: FewShotExample[] = [];

  for (const [index, item] of (examples ?? []).entries()) {
    const content = item.content.trim();
    if (!content) {
      continue;
    }
    const normalized = normalizeSnippet(content, 140);
    if (!normalized || autoExamples.some((candidate) => candidate.content === normalized)) {
      continue;
    }
    autoExamples.push({
      id: `example-${index + 1}`,
      content: normalized,
      source: "auto",
    });
    if (autoExamples.length >= 4) {
      break;
    }
  }

  const merged = [...manualExamples, ...autoExamples].slice(0, 4);
  return merged.length > 0 ? merged : fallback;
}

function sanitizeMappingEntries(
  entries: PersonaLlmUpdate["entries"],
  fallback: MappingEntry[],
  previous?: LexicalMapping | null,
  minCount = 12,
  maxCount = 24,
) {
  const fallbackIndex = buildEntryIndex(fallback);

  const manualByOfficial = new Map(
    (previous?.entries ?? [])
      .filter((entry) => entry.source === "manual")
      .map((entry) => [entry.official, entry] as const),
  );

  const nextEntries = entries
    .map((entry, index) => {
      const official = entry.official.trim();
      const preferred = entry.preferred.trim();
      if (!official || !preferred) {
        return null;
      }
      const manual = manualByOfficial.get(official);
      if (manual) {
        return manual;
      }
      return {
        id: `${safeSlug(official)}-${index}`,
        official,
        preferred,
        note: entry.note?.trim() || "由 LLM 结合旧映射和新语料更新",
        enabled: entry.enabled ?? true,
        source: "auto" as const,
      };
    })
    .filter((entry): entry is MappingEntry => Boolean(entry));

  const merged = buildEntryIndex(nextEntries);

  for (const entry of previous?.entries ?? []) {
    if (merged.size >= minCount) {
      break;
    }
    if (!merged.has(entry.official)) {
      merged.set(entry.official, entry);
    }
  }

  for (const [official, entry] of fallbackIndex.entries()) {
    if (merged.size >= maxCount) {
      break;
    }
    if (!merged.has(official)) {
      merged.set(official, entry);
    }
  }

  return Array.from(merged.values()).slice(0, Math.max(minCount, Math.min(maxCount, merged.size || minCount)));
}

async function readCorpusTexts(personaId: string) {
  const dir = corpusDir(personaId);
  await ensureDir(dir);
  const names = await readdir(dir);
  const results: string[] = [];

  for (const name of names) {
    const fullPath = path.join(dir, name);
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      continue;
    }
    const content = await readFile(fullPath, "utf8");
    if (content.trim()) {
      results.push(content.trim());
    }
  }

  return results;
}

async function readCorpusFileNames(personaId: string) {
  const dir = corpusDir(personaId);
  await ensureDir(dir);
  const names = await readdir(dir);
  const files: string[] = [];

  for (const name of names) {
    const fullPath = path.join(dir, name);
    const fileStat = await stat(fullPath).catch(() => null);
    if (fileStat?.isFile()) {
      files.push(name);
    }
  }

  return files.sort();
}

async function loadPersonaBundle(personaId: string) {
  const dirStat = await stat(personaDir(personaId)).catch(() => null);
  if (!dirStat?.isDirectory()) {
    return null;
  }
  const profile = await readJsonFile<PersonaProfile | null>(profilePath(personaId), null);
  const mapping = await readJsonFile<LexicalMapping | null>(mappingPath(personaId), null);
  const corpusTexts = await readCorpusTexts(personaId);

  if (!profile || !mapping) {
    return null;
  }

  return {
    profile: {
      ...profile,
      portrait: normalizePortrait(profile.portrait),
    },
    mapping,
    corpusTexts,
  };
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function extractContent(payload: unknown): string {
  const firstChoice = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0];
  const content = firstChoice?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "object" && item && "text" in item ? String((item as { text: string }).text) : ""))
      .join("")
      .trim();
  }
  return "";
}

async function requestLlmText(
  llm: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.4,
) {
  const url = normalizeBaseUrl(llm.baseUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知网络错误";
    throw new AppError(`模型服务连接失败: ${message}`, 502);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError(`模型调用失败 (${response.status}): ${errorText.slice(0, 280)}`, 502);
  }

  const payload = (await response.json()) as unknown;
  const content = extractContent(payload);
  if (!content) {
    throw new AppError("模型返回了空结果", 502);
  }
  return content;
}

function extractJsonPayload(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AppError("模型没有返回可解析的 JSON", 502);
  }
  return JSON.parse(raw.slice(start, end + 1)) as PersonaLlmUpdate;
}

async function requestStructuredPersonaUpdate(llm: LlmConfig, userPrompt: string) {
  const initialResponse = await requestLlmText(
    llm,
    "你是一个擅长抽取中文写作风格和表达偏好的助手。只输出合法 JSON。",
    userPrompt,
    0.35,
  );

  try {
    return extractJsonPayload(initialResponse);
  } catch {
    const repairedResponse = await requestLlmText(
      llm,
      "你是一个 JSON 修复助手。你的任务不是改写内容，只把给定内容修复成合法 JSON，并保持字段语义不变。只输出 JSON。",
      [
        "把下面这段内容修复成合法 JSON。",
        "要求：",
        "1. 保留原有字段和语义。",
        "2. 不要补充额外解释。",
        "3. 如果有 markdown 代码块，去掉代码块。",
        "",
        initialResponse,
      ].join("\n"),
      0.1,
    );
    return extractJsonPayload(repairedResponse);
  }
}

function buildPersonaRefreshPrompt(args: {
  profile: PersonaProfile;
  previousMapping: LexicalMapping | null;
  existingCorpusCount: number;
  newCorpusTexts: string[];
  basePortrait: StylePortrait;
  baseMapping: LexicalMapping;
}) {
  const previousMappings = (args.previousMapping?.entries ?? [])
    .slice(0, 20)
    .map((entry) => `- ${entry.official} -> ${entry.preferred} (${entry.source})`)
    .join("\n");

  const newCorpus = args.newCorpusTexts
    .map((content, index) => `### 新语料 ${index + 1}\n${content}`)
    .join("\n\n");

  return [
    "你在帮助维护一个中文写作 persona。",
    "任务不是改写正文，而是更新 persona 的风格总结和词汇映射表。",
    "你会拿到旧的人设总结、旧映射表、这次新增的语料，以及一份规则统计结果。",
    "请重点根据新增语料修正总结，但要保持与旧 persona 的连续性，不要完全推翻已有风格。",
    "输出必须是 JSON，不要包含 Markdown 代码块，不要解释。",
    "",
    `persona 名称：${args.profile.name}`,
    `persona 说明：${args.profile.description || "无"}`,
    `历史语料篇数（本次上传前）：${args.existingCorpusCount}`,
    "",
    `旧风格总结：${args.profile.portrait.summary}`,
    `旧 prompt 风格约束：${args.profile.portrait.promptProfile}`,
    `旧映射摘要：${args.previousMapping?.summary || "无"}`,
    previousMappings ? `旧映射条目：\n${previousMappings}` : "旧映射条目：无",
    "",
    `规则统计得到的新画像参考：${args.basePortrait.summary}`,
    `规则统计得到的新映射摘要：${args.baseMapping.summary}`,
    `规则统计推荐连接词：${args.baseMapping.preferredConnectors.join("、") || "无"}`,
    `规则统计推荐逻辑习惯：${args.baseMapping.logicHabits.join("；") || "无"}`,
    "",
    "新增语料如下：",
    newCorpus,
    "",
    "JSON 格式要求：",
    JSON.stringify(
      {
        profileSummary: "新的风格总结，120字以内",
        promptProfile: "给改写模型使用的风格约束，可多行",
        mappingSummary: "新的映射表摘要，80字以内",
        preferredConnectors: ["连接词1", "连接词2"],
        logicHabits: ["逻辑习惯1", "逻辑习惯2"],
        entries: [
          {
            official: "首先",
            preferred: "先说",
            note: "为什么这样替换",
            enabled: true,
          },
        ],
      },
      null,
      2,
    ),
    "",
    "要求：",
    "1. profileSummary 要像风格画像，不要空泛。",
    "2. promptProfile 要能直接给改写模型用，明确句长、语气、连接词和逻辑展开习惯。",
    "3. entries 控制在 8 到 15 条之间，优先覆盖官样连接词和官样表达。",
    "4. 如果旧映射里有明显符合当前风格的内容，可以保留或微调。",
  ].join("\n");
}

function buildPersonaRefreshPromptV2(args: {
  profile: PersonaProfile;
  previousMapping: LexicalMapping | null;
  existingCorpusCount: number;
  totalCorpusCount: number;
  newCorpusTexts: string[];
  allCorpusTexts: string[];
  basePortrait: StylePortrait;
  baseMapping: LexicalMapping;
}) {
  const previousMappings = (args.previousMapping?.entries ?? [])
    .slice(0, 20)
    .map((entry) => `- ${entry.official} -> ${entry.preferred} (${entry.source})`)
    .join("\n");
  const previousFewShots = args.profile.portrait.fewShotExamples.map((item) => `- ${item.content}`).join("\n");
  const newDigest = buildCorpusDigest(args.newCorpusTexts);
  const allDigest = buildCorpusDigest(args.allCorpusTexts);
  const newCorpus = newDigest.representativeSnippets.map((content, index) => `### 新语料代表片段 ${index + 1}\n${content}`).join("\n\n");
  const allCorpus = allDigest.representativeSnippets.map((content, index) => `### 全量语料代表片段 ${index + 1}\n${content}`).join("\n\n");
  const targetEntryCount = Math.min(24, Math.max(12, Math.ceil(allDigest.uniqueContents.length * 2.5)));

  return [
    "你在帮助维护一个中文写作 persona。",
    "你的任务不是改写正文，而是根据现有 persona 和新增语料，输出新的风格总结、few-shot 示例和映射规则。",
    "请优先依据真实语料归纳，不要凭空脑补。",
    "输出必须是合法 JSON，不要输出 markdown 代码块，不要解释。",
    "",
    `persona 名称：${args.profile.name}`,
    `persona 说明：${args.profile.description || "无"}`,
    `本次新增前的历史语料数：${args.existingCorpusCount}`,
    `当前总语料数（去重前）：${args.totalCorpusCount}`,
    `当前总语料数（去重后）：${allDigest.uniqueContents.length}`,
    "",
    `旧风格总结：${args.profile.portrait.summary}`,
    `旧 prompt 风格约束：${args.profile.portrait.promptProfile}`,
    `旧 few-shot 示例：\n${previousFewShots || "- 无"}`,
    `旧映射摘要：${args.previousMapping?.summary || "无"}`,
    previousMappings ? `旧映射条目：\n${previousMappings}` : "旧映射条目：无",
    "",
    `规则统计生成的兜底风格总结：${args.basePortrait.summary}`,
    `规则统计生成的兜底映射摘要：${args.baseMapping.summary}`,
    `规则统计推荐连接词：${args.baseMapping.preferredConnectors.join("、") || "无"}`,
    `规则统计推荐逻辑习惯：${args.baseMapping.logicHabits.join("；") || "无"}`,
    `从全量语料抽到的高频风格短语：${allDigest.distinctivePhrases.join("、") || "无"}`,
    `从新增语料抽到的高频风格短语：${newDigest.distinctivePhrases.join("、") || "无"}`,
    "",
    "新增语料代表片段如下：",
    newCorpus || "无",
    "",
    "全量语料代表片段如下：",
    allCorpus || "无",
    "",
    "请返回下面这个 JSON 结构：",
    JSON.stringify(
      {
        profileSummary: "新的整体风格总结，60-140字",
        promptProfile: "供改写模型直接使用的风格约束，可多行",
        mappingSummary: "新的映射摘要，40-100字",
        preferredConnectors: ["连接词1", "连接词2"],
        logicHabits: ["逻辑习惯1", "逻辑习惯2"],
        fewShotExamples: [
          {
            content: "最能代表风格的原文短片段",
            reason: "为什么这段有代表性",
          },
        ],
        entries: [
          {
            official: "首先",
            preferred: "先说",
            note: "为什么这么替换",
            enabled: true,
          },
        ],
      },
      null,
      2,
    ),
    "",
    "要求：",
    "1. profileSummary 要像风格画像，不要空泛。",
    "2. promptProfile 要能直接给改写模型使用，明确句长、语气、连接词、结构习惯和禁用表达。",
    "3. fewShotExamples 选 2 到 4 段最有代表性的原文短片段，只能来自语料，不要改写，不要太长。",
    `4. entries 尽量输出 ${targetEntryCount} 条，至少 12 条，最多 24 条，优先覆盖官样连接词、模板词、书面表达和常见空泛收束句。`,
    "5. 不要把普通高频基础词强行做成映射。",
    "6. 如果旧映射仍然合理，可以保留或微调。",
    "7. profileSummary 和 promptProfile 要尽量具体，写出常见语气词、句法节奏、展开方式、自我修正习惯、是否爱举例、是否爱下定义、是否爱先抛观点后补解释。",
  ].join("\n");
}

async function summarizePersonaWithLlm(args: {
  llm: LlmConfig;
  profile: PersonaProfile;
  previousMapping: LexicalMapping | null;
  existingCorpusCount: number;
  allCorpusTexts: string[];
  newCorpusTexts: string[];
}) {
  const uniqueAllCorpusTexts = dedupeCorpusTexts(args.allCorpusTexts);
  const uniqueNewCorpusTexts = dedupeCorpusTexts(args.newCorpusTexts);
  const metrics = collectMetrics(uniqueAllCorpusTexts);
  const fallbackFewShotExamples = buildFewShotExamples(uniqueAllCorpusTexts);
  const basePortrait = buildPortrait(metrics, fallbackFewShotExamples);
  const baseMapping = buildMapping(metrics);
  const targetEntryCount = Math.min(24, Math.max(12, Math.ceil(uniqueAllCorpusTexts.length * 2.5)));
  const parsed = await requestStructuredPersonaUpdate(
    args.llm,
    buildPersonaRefreshPromptV2({
      profile: args.profile,
      previousMapping: args.previousMapping,
      existingCorpusCount: args.existingCorpusCount,
      totalCorpusCount: args.allCorpusTexts.length,
      allCorpusTexts: uniqueAllCorpusTexts,
      newCorpusTexts: uniqueNewCorpusTexts.length > 0 ? uniqueNewCorpusTexts : uniqueAllCorpusTexts,
      basePortrait,
      baseMapping,
    }),
  );
  const entries = sanitizeMappingEntries(parsed.entries ?? [], baseMapping.entries, args.previousMapping, targetEntryCount, 24);
  const fewShotExamples = sanitizeFewShotExamples(
    parsed.fewShotExamples,
    fallbackFewShotExamples,
    args.profile.portrait.fewShotExamples,
  );

  return {
    portrait: {
      summary: parsed.profileSummary?.trim() || basePortrait.summary,
      promptProfile: parsed.promptProfile?.trim() || basePortrait.promptProfile,
      fewShotExamples,
      metrics,
    } satisfies StylePortrait,
    mapping: {
      entries,
      preferredConnectors: dedupeStrings(parsed.preferredConnectors ?? [], 8).length
        ? dedupeStrings(parsed.preferredConnectors ?? [], 8)
        : baseMapping.preferredConnectors,
      logicHabits: dedupeStrings(parsed.logicHabits ?? [], 6).length
        ? dedupeStrings(parsed.logicHabits ?? [], 6)
        : baseMapping.logicHabits,
      summary: parsed.mappingSummary?.trim() || baseMapping.summary,
      updatedAt: nowIso(),
    } satisfies LexicalMapping,
  };
}

function applyMappingHints(sourceText: string, mapping: LexicalMapping) {
  return mapping.entries.reduce((acc, entry) => {
    if (!entry.enabled || !entry.preferred.trim()) {
      return acc;
    }
    return acc.replaceAll(entry.official, entry.preferred);
  }, sourceText);
}

function buildSystemPrompt(request: RewriteRequest, profile?: PersonaProfile, mapping?: LexicalMapping) {
  const lines = [
    "你是一个写作改写助手。",
    "任务是把用户已有文本改写得更自然、更像平时真实表达，而不是写成标准范文。",
    "必须保留原文核心观点，不新增用户没有表达过的立场，也不要替用户扩写成立即可交的满分范文。",
    "避免套话、官样文章、口号化收束和过度完整的总分总。",
    "少用“首先、其次、最后、综上所述、由此可见、值得注意的是”等模板连接词。",
    "允许局部保留一点口语感、主观感和不那么工整的自然衔接。",
    "输出只给最终改写后的正文，不要解释。",
  ];
  const extraInstructions = request.instructions?.trim();
  if (extraInstructions) {
    lines.push(`额外要求：${extraInstructions}`);
  }

  if (profile) {
    lines.push(profile.portrait.promptProfile);
    if (profile.portrait.fewShotExamples.length > 0) {
      lines.push(
        [
          "下面是这个 persona 的 few-shot 风格片段，只模仿语气、句长、衔接和表达习惯，不要照抄内容：",
          ...profile.portrait.fewShotExamples.map((item, index) => `示例${index + 1}：${item.content}`),
        ].join("\n"),
      );
    }
  }

  if (mapping) {
    const enabledEntries = mapping.entries.filter((item) => item.enabled).slice(0, 10);
    if (enabledEntries.length > 0) {
      lines.push(["下面是优先参考的个人化表达映射：", ...enabledEntries.map((item) => `- ${item.official} -> ${item.preferred}`)].join("\n"));
    }
    if (mapping.preferredConnectors.length > 0) {
      lines.push(`更自然的连接和转折优先使用：${mapping.preferredConnectors.join("、")}`);
    }
    if (mapping.logicHabits.length > 0) {
      lines.push(`逻辑展开习惯：${mapping.logicHabits.join("；")}`);
    }
  }

  return lines.join("\n\n");
}

export async function listPersonas(): Promise<PersonaSummary[]> {
  await ensureDir(DATA_ROOT);
  const names = await readdir(DATA_ROOT);
  const items: PersonaSummary[] = [];

  for (const name of names) {
    const entryStat = await stat(path.join(DATA_ROOT, name)).catch(() => null);
    if (!entryStat?.isDirectory()) {
      continue;
    }
    const bundle = await loadPersonaBundle(name);
    if (!bundle) {
      continue;
    }
    items.push({
      id: bundle.profile.id,
      name: bundle.profile.name,
      description: bundle.profile.description,
      createdAt: bundle.profile.createdAt,
      updatedAt: bundle.profile.updatedAt,
      corpusCount: bundle.corpusTexts.length,
      profileSummary: bundle.profile.portrait.summary,
      mappingSummary: bundle.mapping.summary,
      metrics: bundle.profile.portrait.metrics,
      mapping: bundle.mapping,
    });
  }

  return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getPersonaDetail(personaId: string): Promise<PersonaDetail> {
  const bundle = await loadPersonaBundle(personaId);
  if (!bundle) {
    throw new AppError("persona 不存在", 404);
  }

  return {
    profile: bundle.profile,
    mapping: bundle.mapping,
    corpusCount: bundle.corpusTexts.length,
    corpusFiles: await readCorpusFileNames(personaId),
  };
}

export async function createPersona(name: string, description: string) {
  await ensureDir(DATA_ROOT);
  const personaId = `${safeSlug(name)}-${Date.now().toString().slice(-6)}`;
  const createdAt = nowIso();
  const metrics: StyleMetrics = {
    corpusCount: 0,
    averageSentenceLength: 0,
    averageParagraphLength: 0,
    topConnectors: [],
    topColloquials: [],
    abstractWordRatio: 0,
    examplePreference: "low",
    structurePreference: "暂时没有足够语料，先按自然表达处理",
  };
  const profile: PersonaProfile = {
    id: personaId,
    name: name.trim(),
    description: description.trim(),
    createdAt,
    updatedAt: createdAt,
    portrait: buildPortrait(metrics, []),
  };
  const mapping = buildMapping(metrics);

  await ensureDir(corpusDir(personaId));
  await writeJsonFile(profilePath(personaId), profile);
  await writeJsonFile(mappingPath(personaId), mapping);

  return profile;
}

export async function deletePersona(personaId: string) {
  const dir = personaDir(personaId);
  const dirStat = await stat(dir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new AppError("persona 不存在", 404);
  }
  await rm(dir, { recursive: true, force: true });
}

export async function rebuildPersona(personaId: string, llm: LlmConfig) {
  validateLlmConfig(llm);
  const profile = await readJsonFile<PersonaProfile | null>(profilePath(personaId), null);
  if (!profile) {
    throw new AppError("persona 不存在", 404);
  }

  const corpusTexts = await readCorpusTexts(personaId);
  if (corpusTexts.length === 0) {
    throw new AppError("当前 persona 还没有语料", 400);
  }

  const previousMapping = await readJsonFile<LexicalMapping | null>(mappingPath(personaId), null);
  const summarized = await summarizePersonaWithLlm({
    llm,
    profile,
    previousMapping,
    existingCorpusCount: corpusTexts.length,
    allCorpusTexts: corpusTexts,
    newCorpusTexts: corpusTexts,
  });
  const nextProfile: PersonaProfile = {
    ...profile,
    updatedAt: nowIso(),
    portrait: summarized.portrait,
  };

  await writeJsonFile(profilePath(personaId), nextProfile);
  await writeJsonFile(mappingPath(personaId), summarized.mapping);

  return {
    profile: nextProfile,
    mapping: summarized.mapping,
    corpusCount: corpusTexts.length,
  };
}

export async function addCorpusFiles(personaId: string, files: Array<{ name: string; content: string }>, llm: LlmConfig) {
  validateLlmConfig(llm);
  const profile = await readJsonFile<PersonaProfile | null>(profilePath(personaId), null);
  if (!profile) {
    throw new AppError("persona 不存在", 404);
  }

  const dir = corpusDir(personaId);
  await ensureDir(dir);
  const existingCorpusTexts = await readCorpusTexts(personaId);
  const newCorpusTexts: string[] = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    if (![".txt", ".md"].includes(ext)) {
      throw new AppError(`不支持的文件类型: ${file.name}`, 400);
    }
    const trimmedContent = file.content.trim();
    const safeName = `${Date.now()}-${safeSlug(path.basename(file.name, ext))}${ext}`;
    await writeFile(path.join(dir, safeName), trimmedContent, "utf8");
    if (trimmedContent) {
      newCorpusTexts.push(trimmedContent);
    }
  }

  const allCorpusTexts = [...existingCorpusTexts, ...newCorpusTexts];
  if (allCorpusTexts.length === 0) {
    throw new AppError("当前 persona 还没有语料", 400);
  }

  const previousMapping = await readJsonFile<LexicalMapping | null>(mappingPath(personaId), null);
  const summarized = await summarizePersonaWithLlm({
    llm,
    profile,
    previousMapping,
    existingCorpusCount: existingCorpusTexts.length,
    allCorpusTexts,
    newCorpusTexts: newCorpusTexts.length > 0 ? newCorpusTexts : allCorpusTexts,
  });
  const nextProfile: PersonaProfile = {
    ...profile,
    updatedAt: nowIso(),
    portrait: summarized.portrait,
  };

  await writeJsonFile(profilePath(personaId), nextProfile);
  await writeJsonFile(mappingPath(personaId), summarized.mapping);

  return {
    profile: nextProfile,
    mapping: summarized.mapping,
    corpusCount: allCorpusTexts.length,
  };
}

export async function updatePersonaMapping(personaId: string, entries: MappingEntry[]) {
  const mapping = await readJsonFile<LexicalMapping | null>(mappingPath(personaId), null);
  if (!mapping) {
    throw new AppError("mapping 不存在", 404);
  }

  const nextMapping: LexicalMapping = {
    ...mapping,
    entries: entries.map((entry) => ({ ...entry, source: "manual" })),
    updatedAt: nowIso(),
  };

  await writeJsonFile(mappingPath(personaId), nextMapping);
  return nextMapping;
}

export async function updatePersonaProfile(personaId: string, updates: { summary?: string; promptProfile?: string }) {
  const profile = await readJsonFile<PersonaProfile | null>(profilePath(personaId), null);
  if (!profile) {
    throw new AppError("persona 不存在", 404);
  }

  const nextSummary = updates.summary?.trim();
  const nextPromptProfile = updates.promptProfile?.trim();
  if (!nextSummary && !nextPromptProfile) {
    throw new AppError("请至少提供一项画像更新内容", 400);
  }

  const nextProfile: PersonaProfile = {
    ...profile,
    updatedAt: nowIso(),
    portrait: {
      ...profile.portrait,
      summary: nextSummary || profile.portrait.summary,
      promptProfile: nextPromptProfile || profile.portrait.promptProfile,
    },
  };

  await writeJsonFile(profilePath(personaId), nextProfile);
  return nextProfile;
}

export async function rewriteText(request: RewriteRequest): Promise<RewriteResponse> {
  validateLlmConfig(request.llm);
  if (!request.sourceText.trim()) {
    throw new AppError("请输入需要改写的正文", 400);
  }

  const warnings: string[] = [];
  let profile: PersonaProfile | undefined;
  let mapping: LexicalMapping | undefined;
  let sourceText = request.sourceText.trim();

  if (request.mode !== "basic") {
    if (!request.personaId) {
      throw new AppError("当前模式需要先选择语料角色", 400);
    }
    const bundle = await loadPersonaBundle(request.personaId);
    if (!bundle || bundle.corpusTexts.length === 0) {
      throw new AppError("所选角色还没有可用语料", 400);
    }
    profile = bundle.profile;
    if (request.mode === "mapping") {
      mapping = bundle.mapping;
      sourceText = applyMappingHints(sourceText, mapping);
      warnings.push("已在提交给模型前应用一次本地映射提示。");
    }
  }

  const prompt = [
    "请改写下面这段文字。",
    "要求：",
    "1. 保留原意，不新增观点。",
    "2. 删除明显套话、口号式表达和过度工整的模板逻辑。",
    "3. 少用标准连接词，不要写成标准范文。",
    "4. 如果原文已经比较自然，就只做必要修改。",
    "",
    "原文：",
    sourceText,
  ].join("\n");

  const rewrittenText = await requestLlmText(request.llm, buildSystemPrompt(request, profile, mapping), prompt, 0.7);

  return {
    rewrittenText,
    usedMode: request.mode,
    profileSummary: profile?.portrait.summary,
    mappingSummary: mapping?.summary,
    warnings,
  };
}
