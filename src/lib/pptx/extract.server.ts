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
    // Structural/visual reference: theme, fonts, colours, layouts, media, tables & charts.
    const theme = (await zip.file("ppt/theme/theme1.xml")?.async("string")) ?? "";
    const major = /<a:majorFont>[\s\S]*?typeface="([^"]+)"/.exec(theme)?.[1];
    const minor = /<a:minorFont>[\s\S]*?typeface="([^"]+)"/.exec(theme)?.[1];
    const accents = Array.from(theme.matchAll(/<a:accent\d>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/g)).map(
      (m) => `#${m[1]}`,
    );
    const layoutNames: string[] = [];
    for (const f of Object.keys(zip.files).filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f))) {
      const xml = (await zip.file(f)?.async("string")) ?? "";
      const n = /<p:cSld[^>]*name="([^"]*)"/.exec(xml)?.[1];
      if (n) layoutNames.push(n);
    }
    const media = Object.keys(zip.files).filter((f) => /^ppt\/media\//.test(f));
    const structural = [
      `[Template structure] fonts: ${major ?? "?"} / ${minor ?? "?"}`,
      accents.length ? `theme colours: ${accents.join(", ")}` : "",
      layoutNames.length ? `layouts: ${layoutNames.join(" | ")}` : "",
      media.length ? `embedded media/logos: ${media.length} file(s)` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    parts.push(structural);

    const slides = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort(
        (a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0),
      );
    for (let i = 0; i < slides.length; i++) {
      const xml = (await zip.file(slides[i]!)?.async("string")) ?? "";
      const t = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]!);
      const tables = (xml.match(/<a:tbl>/g) ?? []).length;
      const charts = (xml.match(/graphicFrame|chart/g) ?? []).length ? 1 : 0;
      const pics = (xml.match(/<p:pic>/g) ?? []).length;
      const smart = /<dgm:|diagramData/.test(xml) ? 1 : 0;
      const meta = [
        tables ? `${tables} table(s)` : "",
        charts ? "chart/graphic frame" : "",
        pics ? `${pics} image(s)` : "",
        smart ? "SmartArt/diagram" : "",
      ]
        .filter(Boolean)
        .join(", ");
      if (t.length)
        parts.push(`[Slide ${i + 1}${meta ? ` — contains ${meta}` : ""}] ${stripXml(t.join(" | "))}`);

      // Preserve real table grids so the planner can recreate them faithfully.
      for (const tbl of Array.from(xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)).slice(0, 4)) {
        const rows = Array.from(tbl[1]!.matchAll(/<a:tr[\s\S]*?<\/a:tr>/g)).slice(0, 12);
        const grid = rows.map((r) =>
          Array.from(r[0].matchAll(/<a:tc>([\s\S]*?)<\/a:tc>/g))
            .map((c) =>
              Array.from(c[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g))
                .map((m) => m[1]!)
                .join(" ")
                .trim(),
            )
            .join(" | "),
        );
        if (grid.length) parts.push(`[Slide ${i + 1} table]\n${grid.join("\n")}`);
      }
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
    parts.push(`[Workbook structure] ${sheets.length} worksheet(s). Preserve headers, totals and percentages as literal values; convert numeric columns into presentation tables and charts.`);
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
