"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type RewriteMode = "basic" | "persona" | "mapping";

interface StyleMetrics {
  corpusCount: number;
  averageSentenceLength: number;
  averageParagraphLength: number;
  topConnectors: string[];
  topColloquials: string[];
  abstractWordRatio: number;
  examplePreference: "high" | "medium" | "low";
  structurePreference: string;
}

interface MappingEntry {
  id: string;
  official: string;
  preferred: string;
  note: string;
  source: "auto" | "manual";
  enabled: boolean;
}

interface LexicalMapping {
  entries: MappingEntry[];
  preferredConnectors: string[];
  logicHabits: string[];
  summary: string;
  updatedAt: string;
}

interface PersonaSummary {
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

interface RewriteResponse {
  rewrittenText: string;
  usedMode: RewriteMode;
  profileSummary?: string;
  mappingSummary?: string;
  warnings: string[];
}

const MODE_OPTIONS: Array<{
  value: RewriteMode;
  title: string;
  caption: string;
  description: string;
}> = [
  {
    value: "basic",
    title: "基础改写",
    caption: "模式 1",
    description: "只基于正文和固定约束做自然化清理，适合快速压掉套话。",
  },
  {
    value: "persona",
    title: "风格画像",
    caption: "模式 2",
    description: "读取个人语料画像，让句子节奏和表达方式更贴近本人。",
  },
  {
    value: "mapping",
    title: "映射增强",
    caption: "模式 3",
    description: "在画像基础上叠加连接词和用词映射，进一步压掉官样表达。",
  },
];

const STATUS_COPY: Record<RewriteMode, string> = {
  basic: "快速删套话，适合先做一轮轻量自然化处理。",
  persona: "结合语料画像，让改写更贴近你平时的表达习惯。",
  mapping: "在画像基础上再加一层映射约束，进一步减少套路感。",
};

const LLM_STORAGE_KEY = "writing-rewriter-mvp.llm-config";

export default function HomePage() {
  const [mode, setMode] = useState<RewriteMode>("basic");
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [llmSaved, setLlmSaved] = useState(false);
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const [corpusFiles, setCorpusFiles] = useState<FileList | null>(null);
  const [mappingDraft, setMappingDraft] = useState<MappingEntry[]>([]);
  const [result, setResult] = useState<RewriteResponse | null>(null);
  const [status, setStatus] = useState("准备就绪");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function ensureLlmConfig() {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      throw new Error("请先填写完整的模型配置");
    }
  }

  function handleSaveLlmConfig() {
    ensureLlmConfig();
    const nextConfig = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    };
    window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(nextConfig));
    setBaseUrl(nextConfig.baseUrl);
    setApiKey(nextConfig.apiKey);
    setModel(nextConfig.model);
    setLlmSaved(true);
    setError("");
    setStatus("模型配置已保存");
  }

  async function loadPersonas(nextSelectedId?: string) {
    const response = await fetch("/api/personas");
    const payload = (await response.json()) as { personas?: PersonaSummary[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "读取 persona 失败");
    }
    const nextPersonas = payload.personas ?? [];
    setPersonas(nextPersonas);
    const targetId =
      nextSelectedId ??
      (nextPersonas.some((item) => item.id === selectedPersonaId) ? selectedPersonaId : nextPersonas[0]?.id ?? "");
    setSelectedPersonaId(targetId);
  }

  useEffect(() => {
    startTransition(() => {
      loadPersonas().catch((reason) => {
        setError(reason instanceof Error ? reason.message : "读取 persona 失败");
      });
    });
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(LLM_STORAGE_KEY);
    if (!saved) {
      return;
    }
    try {
      const parsed = JSON.parse(saved) as { baseUrl?: string; apiKey?: string; model?: string };
      if (parsed.baseUrl) {
        setBaseUrl(parsed.baseUrl);
      }
      if (parsed.apiKey) {
        setApiKey(parsed.apiKey);
      }
      if (parsed.model) {
        setModel(parsed.model);
      }
      if (parsed.baseUrl && parsed.apiKey && parsed.model) {
        setLlmSaved(true);
      }
    } catch {
      window.localStorage.removeItem(LLM_STORAGE_KEY);
    }
  }, []);

  const selectedPersona = useMemo(
    () => personas.find((item) => item.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  );

  const activeMode = useMemo(
    () => MODE_OPTIONS.find((item) => item.value === mode) ?? MODE_OPTIONS[0],
    [mode],
  );

  useEffect(() => {
    setMappingDraft(selectedPersona?.mapping.entries ?? []);
  }, [selectedPersona]);

  const needsPersona = mode !== "basic";
  const textCount = sourceText.trim().length;
  const llmReady = Boolean(baseUrl.trim() && apiKey.trim() && model.trim());
  const selectedCorpusNames = corpusFiles ? Array.from(corpusFiles).map((file) => file.name) : [];

  async function handleCreatePersona() {
    setError("");
    setStatus("正在创建 persona...");
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: personaName,
        description: personaDescription,
      }),
    });
    const payload = (await response.json()) as { error?: string; persona?: { id: string } };
    if (!response.ok) {
      throw new Error(payload.error ?? "创建 persona 失败");
    }
    setPersonaName("");
    setPersonaDescription("");
    await loadPersonas(payload.persona?.id);
    setStatus("persona 已创建");
  }

  async function handleUploadCorpus() {
    if (!selectedPersonaId) {
      throw new Error("请先选择 persona");
    }
    if (!corpusFiles || corpusFiles.length === 0) {
      throw new Error("请先选择语料文件");
    }
    ensureLlmConfig();
    setStatus("正在上传语料并更新 persona...");
    const form = new FormData();
    Array.from(corpusFiles).forEach((file) => form.append("files", file));
    form.append("baseUrl", baseUrl);
    form.append("apiKey", apiKey);
    form.append("model", model);
    const response = await fetch(`/api/personas/${encodeURIComponent(selectedPersonaId)}/corpus`, {
      method: "POST",
      body: form,
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "上传失败");
    }
    setCorpusFiles(null);
    await loadPersonas(selectedPersonaId);
    setStatus("语料已更新，persona 已重新总结");
  }

  async function handleRebuildPersona() {
    if (!selectedPersonaId) {
      throw new Error("请先选择 persona");
    }
    ensureLlmConfig();
    setStatus("正在用当前语料重建 persona...");
    const response = await fetch(`/api/personas/${encodeURIComponent(selectedPersonaId)}/rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm: {
          baseUrl,
          apiKey,
          model,
        },
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "重建失败");
    }
    await loadPersonas(selectedPersonaId);
    setStatus("画像与映射已重建");
  }

  async function handleSaveMapping() {
    if (!selectedPersonaId) {
      throw new Error("请先选择 persona");
    }
    setStatus("正在保存映射表...");
    const response = await fetch(`/api/personas/${encodeURIComponent(selectedPersonaId)}/mapping`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: mappingDraft }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "保存失败");
    }
    await loadPersonas(selectedPersonaId);
    setStatus("映射表已保存");
  }

  async function handleRewrite() {
    setError("");
    ensureLlmConfig();
    setStatus("正在请求模型改写...");
    const response = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        personaId: needsPersona ? selectedPersonaId : undefined,
        sourceText,
        instructions,
        llm: {
          baseUrl,
          apiKey,
          model,
        },
      }),
    });
    const payload = (await response.json()) as RewriteResponse & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "改写失败");
    }
    setResult(payload);
    setStatus("改写完成");
  }

  function runAction(task: () => Promise<void>) {
    startTransition(() => {
      task().catch((reason) => {
        setError(reason instanceof Error ? reason.message : "操作失败");
        setStatus("操作失败");
      });
    });
  }

  return (
    <main className="shell">
      <section className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">Writing Rewriter MVP</p>
          <h1>把套话磨薄，把你自己的语气留住。</h1>
          <p className="lede">
            这个工具不是把草稿改得更像标准答案，而是把空泛、官样、套路连接词压下去，让文字回到更自然的表达。
          </p>
        </div>

        <div className="masthead-aside">
          <div className="callout">
            <span>当前模式</span>
            <strong>{activeMode.title}</strong>
            <p>{STATUS_COPY[mode]}</p>
          </div>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">API</p>
                <h2>模型配置</h2>
              </div>
              <div className="panel-note">{llmSaved ? "已保存到本地" : "未保存"}</div>
            </div>

            <div className="field">
              <label htmlFor="base-url">Base URL</label>
              <input
                id="base-url"
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  setLlmSaved(false);
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="api-key">API Key</label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setLlmSaved(false);
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="model">Model</label>
              <input
                id="model"
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  setLlmSaved(false);
                }}
              />
            </div>

            <div className="action-row">
              <button className="btn" disabled={isPending || !llmReady} onClick={() => runAction(async () => handleSaveLlmConfig())}>
                保存配置
              </button>
            </div>

            <div className="mini-metrics">
              <div>
                <span>正文字符</span>
                <strong>{textCount}</strong>
              </div>
              <div>
                <span>persona</span>
                <strong>{personas.length}</strong>
              </div>
              <div>
                <span>映射条目</span>
                <strong>{selectedPersona?.mapping.entries.length ?? 0}</strong>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="mode-strip" aria-label="模式说明">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`mode-card ${mode === option.value ? "is-active" : ""}`}
            onClick={() => setMode(option.value)}
          >
            <span>{option.caption}</span>
            <strong>{option.title}</strong>
            <p>{option.description}</p>
          </button>
        ))}
      </section>

      <section className="workspace">
        <div className="main-column">
          <article className="panel composer-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Rewrite</p>
                <h2>正文与改写条件</h2>
              </div>
              <div className="panel-note">{needsPersona ? "当前模式依赖 persona" : "可直接改写"}</div>
            </div>

            <div className="field">
              <label htmlFor="source-text">正文</label>
              <textarea
                id="source-text"
                className="editor editor-primary"
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder="把要处理的课程报告、草稿、说明文字贴在这里。"
              />
            </div>

            <div className="dual-fields">
              <div className="field">
                <label htmlFor="instructions">附加要求</label>
                <textarea
                  id="instructions"
                  className="editor"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="例如：保留第一人称；不要太像发言稿；篇幅不要变长。"
                />
              </div>

              <div className="field">
                <label htmlFor="persona-select">persona</label>
                <select
                  id="persona-select"
                  value={selectedPersonaId}
                  onChange={(event) => setSelectedPersonaId(event.target.value)}
                  disabled={personas.length === 0}
                >
                  <option value="">未选择</option>
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
                <p className="field-footnote">
                  {needsPersona
                    ? "模式 2 和模式 3 需要先选 persona，并且该 persona 已有语料。"
                    : "基础模式可不选 persona，直接做一轮轻量去模板化。"}
                </p>
              </div>
            </div>

            <div className="action-row">
              <button className="btn" disabled={isPending || !llmReady} onClick={() => runAction(handleRewrite)}>
                开始改写
              </button>
              <button
                className="btn secondary"
                disabled={isPending}
                onClick={() => {
                  setSourceText("");
                  setInstructions("");
                  setResult(null);
                  setError("");
                  setStatus("已清空正文与结果");
                }}
              >
                清空正文
              </button>
            </div>

            {!llmReady ? <p className="field-footnote">先在右上角保存完整的模型配置，改写功能才会启用。</p> : null}
          </article>

          <article className="panel result-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Output</p>
                <h2>改写结果</h2>
              </div>
              <div className={`state-pill ${error ? "is-danger" : isPending ? "is-busy" : ""}`}>{status}</div>
            </div>

            {error ? <div className="warning">{error}</div> : null}

            <div className="result-box">{result?.rewrittenText || "提交后，这里会显示改写结果。"}</div>

            {result?.warnings?.length ? <div className="hint">{result.warnings.map((item) => `- ${item}`).join("\n")}</div> : null}

            <div className="result-details">
              <details className="details">
                <summary>查看风格画像</summary>
                <div className="details-content">
                  {result?.profileSummary || selectedPersona?.profileSummary || "当前没有可展示的风格画像。"}
                </div>
              </details>

              <details className="details">
                <summary>查看映射表摘要</summary>
                <div className="details-content">
                  {result?.mappingSummary || selectedPersona?.mappingSummary || "当前没有可展示的映射摘要。"}
                </div>
              </details>
            </div>
          </article>
        </div>

        <aside className="side-column">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Persona</p>
                <h2>语料档案</h2>
              </div>
              <div className="panel-note">本地持久化</div>
            </div>

            <div className="field">
              <label htmlFor="persona-name">名称</label>
              <input
                id="persona-name"
                value={personaName}
                onChange={(event) => setPersonaName(event.target.value)}
                placeholder="例如：课程报告文风"
              />
            </div>

            <div className="field">
              <label htmlFor="persona-description">说明</label>
              <textarea
                id="persona-description"
                className="editor editor-compact"
                value={personaDescription}
                onChange={(event) => setPersonaDescription(event.target.value)}
                placeholder="例如：自然表达、先举例再展开、少用标准连接词。"
              />
            </div>

            <div className="action-row">
              <button className="btn" disabled={isPending || !personaName.trim()} onClick={() => runAction(handleCreatePersona)}>
                创建 persona
              </button>
              <button
                className="btn secondary"
                disabled={isPending || !selectedPersonaId || !llmReady}
                onClick={() => runAction(handleRebuildPersona)}
              >
                重建画像
              </button>
            </div>

            <div className="field">
              <label htmlFor="corpus-files">上传语料（txt / md）</label>
              <input
                id="corpus-files"
                type="file"
                multiple
                accept=".txt,.md,text/plain,text/markdown"
                onChange={(event) => setCorpusFiles(event.target.files)}
              />
              <p className="field-footnote">
                {selectedCorpusNames.length > 0 ? `已选择 ${selectedCorpusNames.join("、")}` : "支持 txt 和 md，上传后会更新当前 persona。"}
              </p>
            </div>

            <button
              className="btn tertiary"
              disabled={isPending || !selectedPersonaId || !corpusFiles?.length || !llmReady}
              onClick={() => runAction(handleUploadCorpus)}
            >
              上传并更新语料
            </button>

            {!llmReady ? <p className="field-footnote">先在右上角保存完整的模型配置，才能上传语料或重建画像。</p> : null}

            <div className="persona-list">
              {personas.length === 0 ? (
                <div className="empty">还没有 persona。先创建一个，再上传自己的历史语料。</div>
              ) : (
                personas.map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    className={`persona-card ${selectedPersonaId === persona.id ? "active" : ""}`}
                    onClick={() => setSelectedPersonaId(persona.id)}
                  >
                    <div className="persona-row">
                      <h3>{persona.name}</h3>
                      <span>{persona.corpusCount} 篇</span>
                    </div>
                    <p>{persona.description || "未填写说明"}</p>
                  </button>
                ))
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Portrait</p>
                <h2>当前 persona 画像</h2>
              </div>
            </div>

            {selectedPersona ? (
              <div className="stack">
                <div className="metric-grid">
                  <div className="metric">
                    <span>平均句长</span>
                    <strong>{selectedPersona.metrics.averageSentenceLength || "-"}</strong>
                  </div>
                  <div className="metric">
                    <span>平均段长</span>
                    <strong>{selectedPersona.metrics.averageParagraphLength || "-"}</strong>
                  </div>
                  <div className="metric">
                    <span>举例倾向</span>
                    <strong>{selectedPersona.metrics.examplePreference}</strong>
                  </div>
                </div>

                <div className="hint">{selectedPersona.profileSummary}</div>

                <div className="portrait-notes">
                  <p>
                    <span>常用连接词</span>
                    {selectedPersona.metrics.topConnectors.join("、") || "暂无"}
                  </p>
                  <p>
                    <span>常见口头词</span>
                    {selectedPersona.metrics.topColloquials.join("、") || "暂无"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="empty">选中 persona 后，这里会显示风格画像。</div>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Mapping</p>
                <h2>词汇映射表</h2>
              </div>
            </div>

            {selectedPersona ? (
              <div className="stack">
                <div className="hint">{selectedPersona.mappingSummary}</div>

                <div className="mapping-table">
                  <div className="mapping-head">
                    <span>官样词</span>
                    <span>个人习惯词</span>
                    <span>备注</span>
                  </div>
                  {mappingDraft.map((entry, index) => (
                    <div className="mapping-row" key={entry.id}>
                      <input value={entry.official} readOnly />
                      <input
                        value={entry.preferred}
                        onChange={(event) => {
                          const next = [...mappingDraft];
                          next[index] = {
                            ...entry,
                            preferred: event.target.value,
                          };
                          setMappingDraft(next);
                        }}
                      />
                      <input
                        value={entry.note}
                        onChange={(event) => {
                          const next = [...mappingDraft];
                          next[index] = {
                            ...entry,
                            note: event.target.value,
                          };
                          setMappingDraft(next);
                        }}
                      />
                    </div>
                  ))}
                </div>

                <button className="btn tertiary" disabled={isPending || mappingDraft.length === 0} onClick={() => runAction(handleSaveMapping)}>
                  保存映射表
                </button>
              </div>
            ) : (
              <div className="empty">选中 persona 后，可以编辑自动生成的词汇映射。</div>
            )}
          </article>
        </aside>
      </section>
    </main>
  );
}
