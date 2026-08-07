import JSZip from "jszip";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

export type ReferenceDigest = {
  name: string;
  kind: string;
  chars: number;
  text: string;
};

const MAX_PER_FILE = 24000;

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function stripXml(xml: string) {
  return xml
    .replace(/<\/a:p>|<\/w:p>|<\/w:tr>|<\/a:tr>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function textFromOfficeZip(bytes: Uint8Array, kind: "pptx" | "docx" | "xlsx") {
  const zip = await JSZip.loadAsync(bytes);
  const parts: string[] = [];

  if (kind === "pptx") {
    const slides = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort(
        (a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0),
      );
    for (let i = 0; i < slides.length; i++) {
      const xml = (await zip.file(slides[i]!)?.async("string")) ?? "";
      const t = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]!);
      if (t.length) parts.push(`[Slide ${i + 1}] ${stripXml(t.join(" | "))}`);
    }
    const notes = Object.keys(zip.files).filter((f) => /notesSlide\d+\.xml$/.test(f));
    for (const n of notes.slice(0, 40)) {
      const xml = (await zip.file(n)?.async("string")) ?? "";
      const t = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]!);
      if (t.join("").trim()) parts.push(`[Notes] ${stripXml(t.join(" "))}`);
    }
  }

  if (kind === "docx") {
    const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    parts.push(stripXml(xml));
  }

  if (kind === "xlsx") {
    const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
    const shared = Array.from(sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) =>
      stripXml(m[1]!),
    );
    const sheets = Object.keys(zip.files)
      .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
      .sort();
    for (const s of sheets.slice(0, 8)) {
      const xml = (await zip.file(s)?.async("string")) ?? "";
      const rows = Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)).slice(0, 200);
      const lines = rows.map((r) => {
        const cells = Array.from(r[1]!.matchAll(/<c[^>]*?(t="(\w+)")?[^>]*>([\s\S]*?)<\/c>/g)).map(
          (c) => {
            const v = /<v>([\s\S]*?)<\/v>/.exec(c[3]!)?.[1] ?? "";
            if (c[2] === "s") return shared[Number(v)] ?? "";
            if (c[2] === "inlineStr") return stripXml(c[3]!);
            return v;
          },
        );
        return cells.join(" | ");
      });
      parts.push(`[${s.split("/").pop()}]\n${lines.filter((l) => l.replace(/\|/g, "").trim()).join("\n")}`);
    }
  }

  return parts.join("\n");
}

async function textFromPdf(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text ?? "");
}

async function describeImage(name: string, mime: string, b64: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return "";
  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3.5-flash"),
      maxRetries: 1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this reference image for use in a corporate presentation. Extract every visible label, number, metric, axis, table cell and diagram relationship as structured text. Be exhaustive and factual.",
            },
            { type: "image", image: `data:${mime};base64,${b64}` },
          ],
        },
      ],
    });
    return text;
  } catch {
    return `Image "${name}" could not be analysed.`;
  }
}

export async function extractReference(file: {
  name: string;
  mime?: string;
  base64: string;
}): Promise<ReferenceDigest> {
  const lower = file.name.toLowerCase();
  const ext = lower.split(".").pop() ?? "";
  let text = "";
  let kind = ext || "file";

  try {
    if (ext === "pptx" || ext === "ppt") {
      kind = "powerpoint";
      text = await textFromOfficeZip(b64ToBytes(file.base64), "pptx");
    } else if (ext === "docx" || ext === "doc") {
      kind = "word";
      text = await textFromOfficeZip(b64ToBytes(file.base64), "docx");
    } else if (ext === "xlsx" || ext === "xlsm") {
      kind = "excel";
      text = await textFromOfficeZip(b64ToBytes(file.base64), "xlsx");
    } else if (ext === "pdf") {
      kind = "pdf";
      text = await textFromPdf(b64ToBytes(file.base64));
    } else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      kind = "image";
      text = await describeImage(file.name, file.mime || `image/${ext === "jpg" ? "jpeg" : ext}`, file.base64);
    } else {
      kind = ext === "csv" ? "csv" : ext === "md" ? "markdown" : "text";
      text = new TextDecoder().decode(b64ToBytes(file.base64));
    }
  } catch (e) {
    text = `Could not read "${file.name}": ${e instanceof Error ? e.message : "unsupported file"}`;
  }

  text = text.replace(/\u0000/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return {
    name: file.name,
    kind,
    chars: text.length,
    text: text.slice(0, MAX_PER_FILE),
  };
}

export function buildReferenceCorpus(digests: ReferenceDigest[], budget = 60000) {
  if (!digests.length) return "";
  const per = Math.max(2000, Math.floor(budget / digests.length));
  return digests
    .map(
      (d) =>
        `### REFERENCE FILE: ${d.name} (${d.kind})\n${d.text.slice(0, per)}${d.text.length > per ? "\n…[truncated]" : ""}`,
    )
    .join("\n\n");
}
