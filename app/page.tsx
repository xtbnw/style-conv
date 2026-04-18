"use client";

import { useEffect, useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";

type RewriteMode = "basic" | "persona" | "mapping";
type WorkspaceView = "workbench" | "personas" | "settings";

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

interface PersonaProfile {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  portrait: {
    summary: string;
    promptProfile: string;
    metrics: StyleMetrics;
  };
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

interface PersonaDetail {
  profile: PersonaProfile;
  mapping: LexicalMapping;
  corpusCount: number;
  corpusFiles: string[];
}

interface RewriteResponse {
  rewrittenText: string;
  usedMode: RewriteMode;
  profileSummary?: string;
  mappingSummary?: string;
  warnings: string[];
}

interface IconProps {
  className?: string;
}

const LLM_STORAGE_KEY = "writing-rewriter-mvp.llm-config";

const MODE_OPTIONS: Array<{ value: RewriteMode; label: string }> = [
  { value: "basic", label: "基础改写" },
  { value: "persona", label: "贴合 persona" },
  { value: "mapping", label: "映射增强" },
];

const VIEW_OPTIONS: Array<{
  value: WorkspaceView;
  label: string;
  icon: (props: IconProps) => ReactElement;
}> = [
  { value: "workbench", label: "工作台", icon: EditIcon },
  { value: "personas", label: "语料角色", icon: PersonaIcon },
  { value: "settings", label: "API 设置", icon: GearIcon },
];

function IconBase({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

function EditIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 17.25V20h2.75L17.8 8.95l-2.75-2.75L4 17.25Zm14.7-9.34a1 1 0 0 0 0-1.41l-1.2-1.2a1 1 0 0 0-1.41 0l-.93.93 2.75 2.75.79-.77ZM4 5h7v2H6v11h11v-5h2v7H4V5Z" fill="currentColor" />
    </IconBase>
  );
}

function PersonaIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M10.5 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm6 8v-1c0-2.02-1.48-3.76-3.62-4.5A5.97 5.97 0 0 1 18.5 18v2h-2Zm-6-6c-3.31 0-6 1.79-6 4v2h12v-2c0-2.21-2.69-4-6-4Zm9-3h-2V9h-2V7h2V5h2v2h2v2h-2v2Z" fill="currentColor" />
    </IconBase>
  );
}

function GearIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m19.14 12.94.04-.44-.04-.44 1.68-1.31a.5.5 0 0 0 .12-.64l-1.6-2.77a.5.5 0 0 0-.6-.22l-1.98.8a6.97 6.97 0 0 0-.76-.44l-.3-2.1a.5.5 0 0 0-.5-.42h-3.2a.5.5 0 0 0-.5.42l-.3 2.1a6.97 6.97 0 0 0-.76.44l-1.98-.8a.5.5 0 0 0-.6.22L3.06 10.1a.5.5 0 0 0 .12.64l1.68 1.31-.04.44.04.44-1.68 1.31a.5.5 0 0 0-.12.64l1.6 2.77a.5.5 0 0 0 .6.22l1.98-.8c.24.17.49.32.76.44l.3 2.1a.5.5 0 0 0 .5.42h3.2a.5.5 0 0 0 .5-.42l.3-2.1c.27-.12.52-.27.76-.44l1.98.8a.5.5 0 0 0 .6-.22l1.6-2.77a.5.5 0 0 0-.12-.64l-1.68-1.31ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z" fill="currentColor" />
    </IconBase>
  );
}

function UploadIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 3 7.5 7.5l1.41 1.41L11 6.83V15h2V6.83l2.09 2.08 1.41-1.41L12 3Zm-7 14h14v3H5v-3Z" fill="currentColor" />
    </IconBase>
  );
}

function TrashIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M8 4h8l1 2h4v2H3V6h4l1-2Zm1 6h2v7H9v-7Zm4 0h2v7h-2v-7Zm-6 0h2v7H7v-7Z" fill="currentColor" />
    </IconBase>
  );
}

function RefreshIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 5a7 7 0 0 1 6.26 3.87L20 8v5h-5l2.17-2.17A5 5 0 1 0 17 14h2a7 7 0 1 1-7-9Z" fill="currentColor" />
    </IconBase>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor" />
    </IconBase>
  );
}

function CopyIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M8 7V4h11v13h-3v3H5V7h3Zm2 0h6v10h1V6h-7v1Zm-3 2v9h7V9H7Z" fill="currentColor" />
    </IconBase>
  );
}

function BackIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m11 18-6-6 6-6 1.41 1.41L8.83 11H19v2H8.83l3.58 3.59L11 18Z" fill="currentColor" />
    </IconBase>
  );
}

export default function HomePage() {
  const [view, setView] = useState<WorkspaceView>("workbench");
  const [mode, setMode] = useState<RewriteMode>("basic");
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [personaDetail, setPersonaDetail] = useState<PersonaDetail | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [result, setResult] = useState<RewriteResponse | null>(null);
  const [instructions, setInstructions] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [llmSaved, setLlmSaved] = useState(false);
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const [corpusFiles, setCorpusFiles] = useState<FileList | null>(null);
  const [profileSummaryDraft, setProfileSummaryDraft] = useState("");
  const [mappingDraft, setMappingDraft] = useState<MappingEntry[]>([]);
  const [status, setStatus] = useState("准备就绪");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRebuildModal, setShowRebuildModal] = useState(false);
  const [pendingUploadPersonaId, setPendingUploadPersonaId] = useState("");
  const [pendingRebuildPersonaId, setPendingRebuildPersonaId] = useState("");
  const [rebuildingPersonaId, setRebuildingPersonaId] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedPersona = useMemo(
    () => personas.find((item) => item.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  );

  const llmReady = Boolean(baseUrl.trim() && apiKey.trim() && model.trim());

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

  useEffect(() => {
    if (!(view === "personas" && selectedPersonaId && personaDetail)) {
      return;
    }
    startTransition(() => {
      loadPersonaDetail(selectedPersonaId).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "读取 persona 详情失败");
      });
    });
  }, [view, selectedPersonaId, personaDetail]);

  useEffect(() => {
    setProfileSummaryDraft(personaDetail?.profile.portrait.summary ?? "");
    setMappingDraft(personaDetail?.mapping.entries ?? []);
  }, [personaDetail]);

  function ensureLlmConfig() {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      throw new Error("请先填写完整的模型配置");
    }
  }

  async function loadPersonas(nextSelectedId?: string) {
    const response = await fetch("/api/personas");
    const payload = (await response.json()) as { personas?: PersonaSummary[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "读取 persona 失败");
    }
    const nextPersonas = payload.personas ?? [];
    setPersonas(nextPersonas);
    const nextId =
      nextSelectedId ??
      (nextPersonas.some((item) => item.id === selectedPersonaId) ? selectedPersonaId : nextPersonas[0]?.id ?? "");
    setSelectedPersonaId(nextId);
  }

  async function loadPersonaDetail(personaId: string) {
    const response = await fetch(`/api/personas/${encodeURIComponent(personaId)}`);
    const payload = (await response.json()) as PersonaDetail & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "读取 persona 详情失败");
    }
    setPersonaDetail(payload);
  }

  async function handleRewrite() {
    ensureLlmConfig();
    setError("");
    setStatus("正在改写...");
    const response = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        personaId: mode === "basic" ? undefined : selectedPersonaId || undefined,
        sourceText,
        instructions,
        llm: { baseUrl, apiKey, model },
      }),
    });
    const payload = (await response.json()) as RewriteResponse & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "改写失败");
    }
    setResult(payload);
    setCopied(false);
    setStatus("改写完成");
  }

  async function handleCopy() {
    if (!result?.rewrittenText) {
      throw new Error("当前没有可复制的结果");
    }
    await navigator.clipboard.writeText(result.rewrittenText);
    setCopied(true);
    setStatus("已复制到剪贴板");
  }

  async function handleSaveLlmConfig() {
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
    setStatus("模型配置已保存");
  }

  async function handleCreatePersona() {
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: personaName,
        description: personaDescription,
      }),
    });
    const payload = (await response.json()) as { persona?: { id: string }; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "创建 persona 失败");
    }
    setPersonaName("");
    setPersonaDescription("");
    setShowCreateModal(false);
    await loadPersonas(payload.persona?.id);
    setSelectedPersonaId(payload.persona?.id ?? "");
    setStatus("persona 已创建");
  }

  function openUploadModal(personaId: string) {
    setPendingUploadPersonaId(personaId);
    setCorpusFiles(null);
    setShowUploadModal(true);
  }

  function openRebuildModal(personaId: string) {
    setPendingRebuildPersonaId(personaId);
    setShowRebuildModal(true);
  }

  async function handleUploadCorpus() {
    ensureLlmConfig();
    if (!pendingUploadPersonaId) {
      throw new Error("请先选择语料角色");
    }
    if (!corpusFiles?.length) {
      throw new Error("请先选择语料文件");
    }
    const form = new FormData();
    Array.from(corpusFiles).forEach((file) => form.append("files", file));
    form.append("baseUrl", baseUrl);
    form.append("apiKey", apiKey);
    form.append("model", model);
    const response = await fetch(`/api/personas/${encodeURIComponent(pendingUploadPersonaId)}/corpus`, {
      method: "POST",
      body: form,
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "上传失败");
    }
    setShowUploadModal(false);
    setCorpusFiles(null);
    await loadPersonas(pendingUploadPersonaId);
    if (selectedPersonaId === pendingUploadPersonaId) {
      await loadPersonaDetail(pendingUploadPersonaId);
    }
    setStatus("语料已更新");
  }

  async function handleRebuildPersona(personaId: string) {
    ensureLlmConfig();
    const response = await fetch(`/api/personas/${encodeURIComponent(personaId)}/rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm: { baseUrl, apiKey, model },
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "重建失败");
    }
    await loadPersonas(personaId);
    if (selectedPersonaId === personaId) {
      await loadPersonaDetail(personaId);
    }
    setStatus("persona 已重绘");
  }

  async function handleConfirmRebuildPersona() {
    if (!pendingRebuildPersonaId) {
      throw new Error("请先选择 persona");
    }
    const personaId = pendingRebuildPersonaId;
    setShowRebuildModal(false);
    setPendingRebuildPersonaId("");
    setRebuildingPersonaId(personaId);
    try {
      await handleRebuildPersona(personaId);
    } finally {
      setRebuildingPersonaId((current) => (current === personaId ? "" : current));
    }
  }

  async function handleDeletePersona(personaId: string) {
    const response = await fetch(`/api/personas/${encodeURIComponent(personaId)}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "删除失败");
    }
    const nextSelected = selectedPersonaId === personaId ? "" : selectedPersonaId;
    if (selectedPersonaId === personaId) {
      setPersonaDetail(null);
      setSelectedPersonaId("");
    }
    await loadPersonas(nextSelected);
    setStatus("persona 已删除");
  }

  async function handleSavePersonaDetail() {
    if (!selectedPersonaId) {
      throw new Error("请先选择 persona");
    }
    const profileResponse = await fetch(`/api/personas/${encodeURIComponent(selectedPersonaId)}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: profileSummaryDraft,
      }),
    });
    const profilePayload = (await profileResponse.json()) as { error?: string };
    if (!profileResponse.ok) {
      throw new Error(profilePayload.error ?? "画像更新失败");
    }

    const mappingResponse = await fetch(`/api/personas/${encodeURIComponent(selectedPersonaId)}/mapping`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: mappingDraft }),
    });
    const mappingPayload = (await mappingResponse.json()) as { error?: string };
    if (!mappingResponse.ok) {
      throw new Error(mappingPayload.error ?? "映射更新失败");
    }

    await loadPersonas(selectedPersonaId);
    await loadPersonaDetail(selectedPersonaId);
    setStatus("persona 详情已保存");
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
    <main className="studio-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <h1>StyleConv</h1>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {VIEW_OPTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                className={`sidebar-link ${view === item.value ? "is-active" : ""}`}
                onClick={() => setView(item.value)}
              >
                <Icon className="nav-icon" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-help">
          <span className="help-badge">?</span>
          <span>Help</span>
        </div>
      </aside>

      <section className="studio-main">
        {view === "workbench" ? (
          <section className="workbench-screen">
            <div className="editor-grid">
              <article className="editor-panel">
                <div className="panel-meta">
                  <div className="meta-heading">
                    <span>Input</span>
                    <strong>原文本</strong>
                  </div>
                </div>

                <textarea
                  className="text-board"
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder="把你想要处理的原始正文放在这里。"
                />

                <div className="input-toolbar">
                  <button className="toolbar-chip generate-button" type="button" onClick={() => runAction(handleRewrite)} disabled={isPending || !llmReady}>
                    生成
                  </button>
                </div>
              </article>

              <article className="editor-panel output-panel">
                <div className="panel-meta">
                  <div className="meta-heading">
                    <span>输出</span>
                    <strong>改写结果</strong>
                  </div>
                  <span className="quality-pill">{result ? "已生成" : "待生成"}</span>
                </div>

                <div className="text-board output-board">
                  {result?.rewrittenText ? result.rewrittenText : <span className="output-placeholder">这里会显示改写后的正文。</span>}
                </div>

                <div className="output-toolbar">
                  <button className="toolbar-chip output-copy" type="button" onClick={() => runAction(handleCopy)} disabled={!result?.rewrittenText}>
                    <CopyIcon className="chip-icon" />
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
              </article>
            </div>

            <article className="notes-panel">
              <label htmlFor="instructions">附加约束</label>
              <textarea
                id="instructions"
                className="notes-input"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="你想要为本次生成额外添加的约束放在这里"
              />
              {error ? <div className="workspace-warning">{error}</div> : null}
            </article>

            <div className="dock-row">
              <label className="select-card">
                <span className="dock-label">选择 Persona</span>
                <select value={selectedPersonaId} onChange={(event) => setSelectedPersonaId(event.target.value)}>
                  <option value="">未选择</option>
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="select-card">
                <span className="dock-label">改写模式</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as RewriteMode)}>
                  {MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        ) : null}

        {view === "personas" ? (
          <section className="detail-screen">
            {!personaDetail ? (
              <>
                <header className="detail-header personas-header">
                  <div>
                    <h2>语料角色卡库</h2>
                    <p>管理你的表达角色卡。每张卡片都对应一套语料、风格总结和映射习惯。</p>
                  </div>
                </header>

                <div className="persona-card-grid">
                  {personas.map((persona) => (
                    <article key={persona.id} className="persona-card-tile">
                      <button
                        type="button"
                        className="persona-card-main"
                        onClick={() => {
                          setSelectedPersonaId(persona.id);
                          runAction(() => loadPersonaDetail(persona.id));
                        }}
                      >
                        <div className="persona-card-meta">
                          <span className="persona-card-time">{new Date(persona.updatedAt).toLocaleDateString("zh-CN")}</span>
                          {rebuildingPersonaId === persona.id ? <span className="settings-state">重绘中</span> : null}
                        </div>
                        <h3>{persona.name}</h3>
                        <p>{persona.description || persona.profileSummary}</p>
                      </button>
                      <div className="persona-card-actions">
                        <button type="button" onClick={() => openUploadModal(persona.id)}>
                          添加语料
                        </button>
                        <button type="button" onClick={() => openRebuildModal(persona.id)} disabled={rebuildingPersonaId === persona.id}>
                          重绘
                        </button>
                        <button type="button" onClick={() => runAction(() => handleDeletePersona(persona.id))}>
                          删除
                        </button>
                      </div>
                    </article>
                  ))}

                  <button type="button" className="persona-create-tile" onClick={() => setShowCreateModal(true)}>
                    <span className="create-plus">
                      <PlusIcon className="plus-icon" />
                    </span>
                    <strong>新建语料角色</strong>
                    <p>从一段描述开始，建立新的语料角色卡。</p>
                  </button>
                </div>
              </>
            ) : (
              <>
                <header className="detail-header analysis-header">
                  <div className="analysis-title-row">
                    <button
                      type="button"
                      className="back-button"
                      onClick={() => {
                        setPersonaDetail(null);
                        setSelectedPersonaId("");
                      }}
                    >
                      <BackIcon className="chip-icon" />
                      返回 Persona 列表
                    </button>
                    <span className="analysis-kicker">当前 Persona</span>
                    <h2>{personaDetail.profile.name}</h2>
                  </div>
                  <div className="analysis-tags">
                    <span>{personaDetail.profile.description || "Persona 档案"}</span>
                    <span>{personaDetail.corpusCount} 篇语料</span>
                  </div>
                </header>

                <article className="summary-card">
                  <div className="summary-main">
                    <span className="summary-label">Profile Summary</span>
                    <textarea
                      className="summary-editor"
                      value={profileSummaryDraft}
                      onChange={(event) => setProfileSummaryDraft(event.target.value)}
                    />
                  </div>
                  <div className="summary-side">
                    <span>风格类型</span>
                    <strong>{personaDetail.mapping.logicHabits[0] || "自然表达"}</strong>
                    <span>最近分析</span>
                    <strong>{new Date(personaDetail.profile.updatedAt).toLocaleString("zh-CN")}</strong>
                  </div>
                </article>

                <section className="metrics-section">
                  <span className="section-label">统计与结构分析</span>
                  <div className="analysis-metrics">
                    <article>
                      <span>平均句长</span>
                      <strong>{personaDetail.profile.portrait.metrics.averageSentenceLength || "-"}</strong>
                    </article>
                    <article>
                      <span>段落长度</span>
                      <strong>{personaDetail.profile.portrait.metrics.averageParagraphLength || "-"}</strong>
                    </article>
                    <article>
                      <span>常用连接词</span>
                      <strong>{personaDetail.profile.portrait.metrics.topConnectors.slice(0, 2).join(" / ") || "暂无"}</strong>
                    </article>
                    <article>
                      <span>举例倾向</span>
                      <strong>{personaDetail.profile.portrait.metrics.examplePreference}</strong>
                    </article>
                  </div>
                </section>

                <section className="mapping-section">
                  <div className="mapping-section-head">
                    <span className="section-label">词汇映射</span>
                    <button className="save-detail-button" type="button" onClick={() => runAction(handleSavePersonaDetail)}>
                      保存修改
                    </button>
                  </div>
                  <div className="mapping-sheet">
                    <div className="mapping-sheet-head">
                      <span>官样词</span>
                      <span>自然表达</span>
                      <span>分析 / 备注</span>
                    </div>
                    {mappingDraft.map((entry, index) => (
                      <div className="mapping-sheet-row" key={entry.id}>
                        <input value={entry.official} readOnly />
                        <input
                          value={entry.preferred}
                          onChange={(event) => {
                            const next = [...mappingDraft];
                            next[index] = { ...entry, preferred: event.target.value };
                            setMappingDraft(next);
                          }}
                        />
                        <input
                          value={entry.note}
                          onChange={(event) => {
                            const next = [...mappingDraft];
                            next[index] = { ...entry, note: event.target.value };
                            setMappingDraft(next);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </section>
        ) : null}

        {view === "settings" ? (
          <section className="detail-screen">
            <header className="detail-header settings-header">
              <div>
                <h2>API 设置</h2>
                <p>在这里配置模型连接信息，用于改写和语料重建。</p>
              </div>
            </header>

            <article className="settings-card-large">
              <div className="settings-grid">
                <label>
                  <span>Base URL</span>
                  <input
                    value={baseUrl}
                    onChange={(event) => {
                      setBaseUrl(event.target.value);
                      setLlmSaved(false);
                    }}
                    placeholder="https://api.openai.com/v1"
                  />
                  <small>输入你的模型服务地址。</small>
                </label>

                <label>
                  <span>API Key</span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setLlmSaved(false);
                    }}
                    placeholder="sk-..."
                  />
                  <small>仅保存在当前浏览器本地。</small>
                </label>

                <label>
                  <span>Model</span>
                  <input
                    value={model}
                    onChange={(event) => {
                      setModel(event.target.value);
                      setLlmSaved(false);
                    }}
                    placeholder="gpt-4o-mini"
                  />
                  <small>输入你的 model，例如 `gpt-4o-mini`。</small>
                </label>
              </div>

              <div className="settings-actions">
                <button className="settings-save" type="button" onClick={() => runAction(handleSaveLlmConfig)} disabled={isPending || !llmReady}>
                  保存配置
                </button>
                <span className={`settings-state ${llmSaved ? "is-saved" : ""}`}>{llmSaved ? "已保存到本地" : "未保存"}</span>
              </div>
            </article>
          </section>
        ) : null}
      </section>

      {showRebuildModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setShowRebuildModal(false);
            setPendingRebuildPersonaId("");
          }}
        >
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>确认重建 Persona</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setShowRebuildModal(false);
                  setPendingRebuildPersonaId("");
                }}
              >
                x
              </button>
            </div>
            <p>确认后会根据当前 persona 的已有语料重新生成风格总结和映射表。</p>
            <small className="modal-caption">这会调用 LLM 对其进行重绘。</small>
            <div className="modal-actions">
              <button
                className="toolbar-chip"
                type="button"
                onClick={() => {
                  setShowRebuildModal(false);
                  setPendingRebuildPersonaId("");
                }}
              >
                取消
              </button>
              <button className="generate-button" type="button" onClick={() => runAction(handleConfirmRebuildPersona)}>
                确认重建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUploadModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowUploadModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>上传语料</h3>
              <button type="button" className="modal-close" onClick={() => setShowUploadModal(false)}>
                  ×
              </button>
            </div>
            <p>上传新的 txt / md 语料后，会结合现有总结与映射表一起更新 persona。</p>
              <div className="file-picker">
                <input
                  id="corpus-upload"
                  className="file-input-hidden"
                  type="file"
                  multiple
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={(event) => setCorpusFiles(event.target.files)}
                />
                <label htmlFor="corpus-upload" className="toolbar-chip file-picker-trigger">
                  选择文件
                </label>
                <span className="file-picker-status">{corpusFiles?.length ? `已选择 ${corpusFiles.length} 个文件` : "支持 txt / md，可多选"}</span>
              </div>
            <div className="modal-actions">
              <button className="settings-save" type="button" onClick={() => runAction(handleUploadCorpus)} disabled={isPending || !llmReady || !corpusFiles?.length}>
                更新语料
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowCreateModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>新建语料角色</h3>
              <button type="button" className="modal-close" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-form">
              <label>
                <span>标题</span>
                <input value={personaName} onChange={(event) => setPersonaName(event.target.value)} placeholder="例如：官样词修正者" />
              </label>
              <label>
                <span>简介</span>
                <textarea value={personaDescription} onChange={(event) => setPersonaDescription(event.target.value)} placeholder="例如：更自然、少虚词、偏口语一点。" />
              </label>
            </div>
            <div className="modal-actions">
              <button className="settings-save" type="button" onClick={() => runAction(handleCreatePersona)} disabled={isPending || !personaName.trim()}>
                创建 Persona
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
