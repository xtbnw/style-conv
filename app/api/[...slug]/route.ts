import { NextRequest, NextResponse } from "next/server";
import {
  AppError,
  addCorpusFiles,
  createPersona,
  type LlmConfig,
  listPersonas,
  rebuildPersona,
  rewriteText,
  updatePersonaMapping,
  type MappingEntry,
  type RewriteRequest,
} from "@/lib/core";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function toStatus(error: unknown) {
  if (error instanceof AppError) {
    return error.status;
  }
  return 500;
}

function readLlmFromForm(form: FormData): LlmConfig {
  return {
    baseUrl: String(form.get("baseUrl") ?? ""),
    apiKey: String(form.get("apiKey") ?? ""),
    model: String(form.get("model") ?? ""),
  };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await context.params;
  if (slug.length === 1 && slug[0] === "personas") {
    const personas = await listPersonas();
    return NextResponse.json({ personas });
  }
  return jsonError("未找到接口", 404);
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await context.params;

  try {
    if (slug.length === 1 && slug[0] === "rewrite") {
      const body = (await request.json()) as RewriteRequest;
      const result = await rewriteText(body);
      return NextResponse.json(result);
    }

    if (slug.length === 1 && slug[0] === "personas") {
      const body = (await request.json()) as { name?: string; description?: string };
      if (!body.name?.trim()) {
        return jsonError("请输入 persona 名称");
      }
      const persona = await createPersona(body.name, body.description ?? "");
      return NextResponse.json({ persona });
    }

    if (slug.length === 3 && slug[0] === "personas" && slug[2] === "corpus") {
      const personaId = decodeURIComponent(slug[1] ?? "");
      const form = await request.formData();
      const llm = readLlmFromForm(form);
      const uploads = form.getAll("files");
      if (uploads.length === 0) {
        return jsonError("请至少上传一个语料文件");
      }
      const files = await Promise.all(
        uploads.map(async (item) => {
          if (!(item instanceof File)) {
            throw new Error("无效文件");
          }
          return {
            name: item.name,
            content: await item.text(),
          };
        }),
      );
      const result = await addCorpusFiles(personaId, files, llm);
      return NextResponse.json(result);
    }

    if (slug.length === 3 && slug[0] === "personas" && slug[2] === "rebuild") {
      const personaId = decodeURIComponent(slug[1] ?? "");
      const body = (await request.json()) as { llm: LlmConfig };
      const result = await rebuildPersona(personaId, body.llm);
      return NextResponse.json(result);
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "请求失败", toStatus(error));
  }

  return jsonError("未找到接口", 404);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await context.params;
  if (!(slug.length === 3 && slug[0] === "personas" && slug[2] === "mapping")) {
    return jsonError("未找到接口", 404);
  }

  try {
    const body = (await request.json()) as { entries?: MappingEntry[] };
    if (!Array.isArray(body.entries)) {
      return jsonError("映射表格式不正确");
    }
    const mapping = await updatePersonaMapping(decodeURIComponent(slug[1] ?? ""), body.entries);
    return NextResponse.json({ mapping });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "更新失败", toStatus(error));
  }
}
