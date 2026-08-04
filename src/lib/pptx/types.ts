// Client-safe shared types for the template-aware PPT generator.

export type TemplateLayout = {
  index: number;
  file: string;
  name: string;
  placeholders: string[];
  hasTitle: boolean;
  role: "title" | "content" | "divider" | "closing" | "agenda" | "other";
};

export type TemplateBlueprint = {
  slideWidthEmu: number;
  slideHeightEmu: number;
  fonts: { major: string; minor: string };
  colors: {
    dk1: string;
    lt1: string;
    accent1: string;
    accent2: string;
    accent3: string;
    accent4: string;
  };
  masters: number;
  layouts: TemplateLayout[];
  mediaFiles: string[];
  sampleSlideTitles: string[];
  footerText: string | null;
  analyzedAt: string;
};

export type Block =
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "kpis"; items: { label: string; value: string; note?: string }[] }
  | { kind: "timeline"; items: { when: string; what: string }[] }
  | {
      kind: "chart";
      chartTitle?: string;
      unit?: string;
      series: { label: string; value: number }[];
    }
  | {
      kind: "twoCol";
      left: { heading: string; items: string[] };
      right: { heading: string; items: string[] };
    };

export type PlannedSlide = {
  layoutIndex: number;
  kind: "title" | "agenda" | "divider" | "content" | "closing";
  title: string;
  subtitle?: string;
  blocks: Block[];
  notes?: string;
};

export type DeckPlan = {
  deckTitle: string;
  subtitle?: string;
  slides: PlannedSlide[];
};
