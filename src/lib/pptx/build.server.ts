import type { Block, DeckPlan, TemplateBlueprint } from "./types";
import { loadZip } from "./blueprint.server";

const EMU_IN = 914400;
const inEmu = (v: number) => Math.round(v * EMU_IN);
const pt = (v: number) => Math.round(v * 100);

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Ctx = { bp: TemplateBlueprint; W: number; H: number; id: () => number };

function para(text: string, o: { size: number; bold?: boolean; color: string; bullet?: boolean; align?: string }) {
  const buChar = o.bullet ? `<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>` : `<a:buNone/>`;
  return `<a:p><a:pPr${o.bullet ? ' marL="228600" indent="-228600"' : ""}${o.align ? ` algn="${o.align}"` : ""}>${buChar}</a:pPr><a:r><a:rPr lang="en-US" sz="${pt(o.size)}"${o.bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill><a:latin typeface="+mn-lt"/></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p>`;
}

function textBox(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  paras: string,
  anchor: "t" | "ctr" = "t",
) {
  const id = ctx.id();
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${inEmu(x)}" y="${inEmu(y)}"/><a:ext cx="${inEmu(w)}" cy="${inEmu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
}

function rect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  paras = "",
  opts: { round?: boolean; line?: string } = {},
) {
  const id = ctx.id();
  const geom = opts.round ? "roundRect" : "rect";
  const line = opts.line
    ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${opts.line}"/></a:solidFill></a:ln>`
    : `<a:ln><a:noFill/></a:ln>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${inEmu(x)}" y="${inEmu(y)}"/><a:ext cx="${inEmu(w)}" cy="${inEmu(h)}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>${line}</p:spPr><p:txBody><a:bodyPr anchor="ctr" lIns="91440" rIns="91440" tIns="45720" bIns="45720"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras || `<a:p><a:endParaRPr lang="en-US"/></a:p>`}</p:txBody></p:sp>`;
}

function tableFrame(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  headers: string[],
  rows: string[][],
) {
  const cols = Math.max(headers.length, 1);
  const colW = Math.floor(inEmu(w) / cols);
  const headH = inEmu(0.45);
  const bodyRows = rows.length || 1;
  const rowH = Math.max(inEmu(0.32), Math.floor((inEmu(h) - headH) / bodyRows));
  const fontSize = cols > 5 || bodyRows > 8 ? 10 : 12;
  const cell = (text: string, header: boolean) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="${pt(header ? fontSize + 1 : fontSize)}"${header ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${header ? "FFFFFF" : "1F2430"}"/></a:solidFill><a:latin typeface="+mn-lt"/></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></a:txBody><a:tcPr marL="68580" marR="68580" marT="45720" marB="45720" anchor="ctr"><a:solidFill><a:srgbClr val="${header ? ctx.bp.colors.accent1 : "FFFFFF"}"/></a:solidFill></a:tcPr></a:tc>`;
  const gridCols = Array.from({ length: cols }, () => `<a:gridCol w="${colW}"/>`).join("");
  const headRow = `<a:tr h="${headH}">${headers.map((hd) => cell(hd, true)).join("")}</a:tr>`;
  const bodyXml = rows
    .map(
      (r) =>
        `<a:tr h="${rowH}">${Array.from({ length: cols }, (_, i) => cell(r[i] ?? "", false)).join("")}</a:tr>`,
    )
    .join("");
  const id = ctx.id();
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${inEmu(x)}" y="${inEmu(y)}"/><a:ext cx="${inEmu(w)}" cy="${inEmu(h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${gridCols}</a:tblGrid>${headRow}${bodyXml}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

function renderBlock(ctx: Ctx, b: Block, x: number, y: number, w: number, h: number): string {
  const c = ctx.bp.colors;
  switch (b.kind) {
    case "bullets":
      return textBox(
        ctx,
        x,
        y,
        w,
        h,
        b.items
          .slice(0, 8)
          .map((t) => para(t, { size: b.items.length > 5 ? 16 : 18, color: "23272F", bullet: true }))
          .join(""),
      );
    case "table":
      return tableFrame(ctx, x, y, w, Math.min(h, 0.5 + b.rows.length * 0.4), b.headers, b.rows);
    case "kpis": {
      const items = b.items.slice(0, 4);
      const gap = 0.25;
      const cw = (w - gap * (items.length - 1)) / Math.max(items.length, 1);
      const ch = Math.min(h, 1.7);
      return items
        .map((k, i) =>
          rect(
            ctx,
            x + i * (cw + gap),
            y,
            cw,
            ch,
            "F4F6FA",
            para(k.value, { size: 28, bold: true, color: c.accent1, align: "ctr" }) +
              para(k.label, { size: 12, bold: true, color: "3A4252", align: "ctr" }) +
              (k.note ? para(k.note, { size: 10, color: "6B7280", align: "ctr" }) : ""),
            { round: true, line: "D8DEE9" },
          ),
        )
        .join("");
    }
    case "timeline": {
      const items = b.items.slice(0, 5);
      const gap = 0.2;
      const cw = (w - gap * (items.length - 1)) / Math.max(items.length, 1);
      const line = rect(ctx, x, y + 0.32, w, 0.03, c.accent3);
      return (
        line +
        items
          .map((it, i) => {
            const cx = x + i * (cw + gap);
            return (
              rect(ctx, cx, y + 0.14, 0.4, 0.4, c.accent4, "", { round: true }) +
              textBox(
                ctx,
                cx,
                y + 0.7,
                cw,
                h - 0.7,
                para(it.when, { size: 12, bold: true, color: c.accent1 }) +
                  para(it.what, { size: 11, color: "3A4252" }),
              )
            );
          })
          .join("")
      );
    }
    case "chart": {
      const series = b.series.slice(0, 7);
      const max = Math.max(...series.map((s) => Math.abs(s.value)), 1);
      const plotH = Math.min(h, 3.1) - 0.75;
      const gap = 0.18;
      const bw = (w - gap * (series.length - 1)) / Math.max(series.length, 1);
      const palette = [c.accent1, c.accent2, c.accent3, c.accent4, c.accent1, c.accent2, c.accent3];
      const head = b.chartTitle
        ? textBox(ctx, x, y, w, 0.3, para(b.chartTitle, { size: 12, bold: true, color: c.accent1 }))
        : "";
      const baseY = y + (b.chartTitle ? 0.35 : 0) + plotH;
      return (
        head +
        rect(ctx, x, baseY, w, 0.02, "D8DEE9") +
        series
          .map((s, i) => {
            const bh = Math.max(0.12, (Math.abs(s.value) / max) * plotH);
            const bx = x + i * (bw + gap);
            return (
              rect(ctx, bx, baseY - bh, bw, bh, palette[i % palette.length]!) +
              textBox(
                ctx,
                bx,
                baseY - bh - 0.28,
                bw,
                0.26,
                para(`${s.value}${b.unit ?? ""}`, { size: 11, bold: true, color: "23272F", align: "ctr" }),
              ) +
              textBox(ctx, bx, baseY + 0.06, bw, 0.4, para(s.label, { size: 10, color: "5A6373", align: "ctr" }))
            );
          })
          .join("")
      );
    }
    case "twoCol": {
      const cw = (w - 0.3) / 2;
      const col = (cx: number, head: string, items: string[]) =>
        rect(ctx, cx, y, cw, Math.min(h, 3.4), "F4F6FA", "", { round: true, line: "D8DEE9" }) +
        textBox(
          ctx,
          cx + 0.2,
          y + 0.15,
          cw - 0.4,
          Math.min(h, 3.4) - 0.3,
          para(head, { size: 15, bold: true, color: c.accent1 }) +
            items
              .slice(0, 6)
              .map((t) => para(t, { size: 13, color: "3A4252", bullet: true }))
              .join(""),
        );
      return col(x, b.left.heading, b.left.items) + col(x + cw + 0.3, b.right.heading, b.right.items);
    }
    default:
      return "";
  }
}

function slideXml(ctx: Ctx, slide: DeckPlan["slides"][number], index: number, total: number) {
  const c = ctx.bp.colors;
  const wIn = ctx.W;
  const hIn = ctx.H;
  const shapes: string[] = [];

  if (slide.kind === "title") {
    shapes.push(
      textBox(
        ctx,
        0.9,
        hIn / 2 - 1.2,
        wIn - 1.8,
        1.5,
        para(slide.title, { size: 40, bold: true, color: c.accent1 }),
        "ctr",
      ),
    );
    if (slide.subtitle)
      shapes.push(
        textBox(ctx, 0.9, hIn / 2 + 0.35, wIn - 1.8, 0.9, para(slide.subtitle, { size: 18, color: "5A6373" })),
      );
  } else if (slide.kind === "divider") {
    shapes.push(rect(ctx, 0.9, hIn / 2 - 0.6, 0.12, 1.2, c.accent4));
    shapes.push(
      textBox(ctx, 1.2, hIn / 2 - 0.7, wIn - 2.4, 1.4, para(slide.title, { size: 32, bold: true, color: c.accent1 }), "ctr"),
    );
  } else {
    shapes.push(textBox(ctx, 0.6, 0.45, wIn - 1.2, 0.8, para(slide.title, { size: 26, bold: true, color: c.accent1 })));
    shapes.push(rect(ctx, 0.62, 1.22, 1.4, 0.045, c.accent4));
    if (slide.subtitle)
      shapes.push(textBox(ctx, 0.62, 1.32, wIn - 1.4, 0.4, para(slide.subtitle, { size: 13, color: "5A6373" })));

    let y = slide.subtitle ? 1.85 : 1.55;
    const bottom = hIn - 0.85;
    const blocks = slide.blocks.slice(0, 3);
    for (const b of blocks) {
      const remaining = bottom - y;
      if (remaining < 0.6) break;
      const share = remaining / Math.max(1, blocks.length - blocks.indexOf(b));
      const h = Math.max(0.7, Math.min(remaining, share));
      shapes.push(renderBlock(ctx, b, 0.62, y, wIn - 1.24, h));
      y += h + 0.25;
    }
  }

  if (ctx.bp.footerText) {
    shapes.push(
      textBox(ctx, 0.6, hIn - 0.5, wIn - 2, 0.3, para(ctx.bp.footerText, { size: 9, color: "8A93A3" })),
    );
  }
  shapes.push(
    textBox(ctx, wIn - 1.3, hIn - 0.5, 0.8, 0.3, para(`${index + 1}/${total}`, { size: 9, color: "8A93A3", align: "r" })),
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

/**
 * Rebuilds the uploaded template package with AI-generated slides while keeping
 * every branding part intact: slide masters, layouts, themes, media, fonts.
 */
export async function buildDeckFromTemplate(
  bytes: ArrayBuffer | Uint8Array,
  bp: TemplateBlueprint,
  plan: DeckPlan,
): Promise<Uint8Array> {
  const zip = await loadZip(bytes);
  const W = bp.slideWidthEmu / EMU_IN;
  const H = bp.slideHeightEmu / EMU_IN;

  // 1. Drop existing slides + notes slides.
  const removed: string[] = [];
  for (const path of Object.keys(zip.files)) {
    if (
      /^ppt\/slides\//.test(path) ||
      /^ppt\/notesSlides\//.test(path)
    ) {
      removed.push(path);
      zip.remove(path);
    }
  }

  // 2. Content types: strip removed overrides, add new slide overrides.
  let ct = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
  ct = ct.replace(/<Override[^>]*PartName="\/ppt\/(?:slides|notesSlides)\/[^"]*"[^>]*\/>/g, "");
  const newOverrides = plan.slides
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("");
  ct = ct.replace("</Types>", `${newOverrides}</Types>`);
  zip.file("[Content_Types].xml", ct);

  // 3. presentation.xml.rels: strip slide rels, add new ones.
  let prel = (await zip.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? "";
  prel = prel.replace(
    /<Relationship[^>]*Type="[^"]*\/(?:slide|notesSlide)"[^>]*\/>/g,
    "",
  );
  let maxId = 0;
  for (const m of prel.matchAll(/Id="rId(\d+)"/g)) maxId = Math.max(maxId, Number(m[1]));
  const slideRIds: string[] = [];
  const relAdds = plan.slides
    .map((_, i) => {
      const rid = `rId${++maxId}`;
      slideRIds.push(rid);
      return `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`;
    })
    .join("");
  prel = prel.replace("</Relationships>", `${relAdds}</Relationships>`);
  zip.file("ppt/_rels/presentation.xml.rels", prel);

  // 4. presentation.xml sldIdLst.
  let pres = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
  const sldIdLst = `<p:sldIdLst>${slideRIds
    .map((rid, i) => `<p:sldId id="${256 + i}" r:id="${rid}"/>`)
    .join("")}</p:sldIdLst>`;
  if (/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/.test(pres)) {
    pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, sldIdLst);
  } else {
    pres = pres.replace(/(<\/p:sldMasterIdLst>)/, `$1${sldIdLst}`);
  }
  zip.file("ppt/presentation.xml", pres);

  // 5. Write the new slides, each bound to a real template layout.
  let idSeq = 100;
  const ctx: Ctx = { bp, W, H, id: () => ++idSeq };
  plan.slides.forEach((slide, i) => {
    const layout =
      bp.layouts.find((l) => l.index === slide.layoutIndex) ?? bp.layouts[0]!;
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(ctx, slide, i, plan.slides.length));
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${layout.index}.xml"/></Relationships>`,
    );
  });

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
