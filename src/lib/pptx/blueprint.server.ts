import JSZip from "jszip";
import type { TemplateBlueprint, TemplateLayout } from "./types";

export async function loadZip(bytes: ArrayBuffer | Uint8Array) {
  return JSZip.loadAsync(bytes);
}

function xmlDecode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function roleFor(name: string, placeholders: string[]): TemplateLayout["role"] {
  const n = name.toLowerCase();
  if (/thank|closing|q&a/.test(n)) return "closing";
  if (/divider|section/.test(n)) return "divider";
  if (/agenda/.test(n)) return "agenda";
  if (/title slide|title &|title and subtitle/.test(n)) return "title";
  if (/content|header/.test(n)) return "content";
  if (placeholders.includes("body") && placeholders.includes("title")) return "title";
  return "other";
}

export async function analyzeTemplate(
  bytes: ArrayBuffer | Uint8Array,
): Promise<TemplateBlueprint> {
  const zip = await loadZip(bytes);

  const pres = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
  const size = /sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);

  const layoutFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f))
    .sort((a, b) => num(a) - num(b));

  const layouts: TemplateLayout[] = [];
  for (let i = 0; i < layoutFiles.length; i++) {
    const file = layoutFiles[i]!;
    const xml = (await zip.file(file)?.async("string")) ?? "";
    const name = xmlDecode(/<p:cSld[^>]*name="([^"]*)"/.exec(xml)?.[1] ?? `Layout ${i + 1}`);
    const placeholders = Array.from(xml.matchAll(/<p:ph[^>]*type="([^"]+)"/g)).map((m) => m[1]!);
    if (/<p:ph(?![^>]*type=)/.test(xml)) placeholders.push("body");
    layouts.push({
      index: num(file),
      file,
      name,
      placeholders: Array.from(new Set(placeholders)),
      hasTitle: placeholders.includes("title") || placeholders.includes("ctrTitle"),
      role: roleFor(name, placeholders),
    });
  }

  const themeXml = (await zip.file("ppt/theme/theme1.xml")?.async("string")) ?? "";
  const color = (tag: string, fallback: string) =>
    new RegExp(`<a:${tag}>[\\s\\S]*?val="([0-9A-Fa-f]{6})"`).exec(themeXml)?.[1]?.toUpperCase() ??
    fallback;
  const fonts = Array.from(themeXml.matchAll(/<a:latin typeface="([^"]+)"/g)).map((m) => m[1]!);

  const masters = Object.keys(zip.files).filter((f) =>
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f),
  ).length;

  const masterXml = (await zip.file("ppt/slideMasters/slideMaster1.xml")?.async("string")) ?? "";
  const masterTexts = Array.from(masterXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) =>
    xmlDecode(m[1]!),
  );
  const classification = masterTexts.join("").match(/Information Classification:.*/i)?.[0] ?? null;

  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => num(a) - num(b))
    .slice(0, 12);
  const sampleSlideTitles: string[] = [];
  for (const f of slideFiles) {
    const xml = (await zip.file(f)?.async("string")) ?? "";
    const t = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g))
      .map((m) => xmlDecode(m[1]!).trim())
      .filter(Boolean)[0];
    if (t) sampleSlideTitles.push(t.slice(0, 90));
  }

  return {
    slideWidthEmu: Number(size?.[1] ?? 12192000),
    slideHeightEmu: Number(size?.[2] ?? 6858000),
    fonts: { major: fonts[0] ?? "Calibri", minor: fonts[1] ?? fonts[0] ?? "Calibri" },
    colors: {
      dk1: color("dk1", "1F1F1F"),
      lt1: color("lt1", "FFFFFF"),
      accent1: color("accent1", "074F9D"),
      accent2: color("accent2", "047BC1"),
      accent3: color("accent3", "24AADE"),
      accent4: color("accent4", "F05A29"),
    },
    masters,
    layouts,
    mediaFiles: Object.keys(zip.files).filter((f) => f.startsWith("ppt/media/")),
    sampleSlideTitles,
    footerText: classification,
    analyzedAt: new Date().toISOString(),
  };
}

export function num(path: string) {
  return Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);
}
