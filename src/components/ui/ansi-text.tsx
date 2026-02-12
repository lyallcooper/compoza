import { parseAnsi } from "@/lib/format";

export function AnsiText({ text }: { text: string }) {
  return parseAnsi(text).map((span, i) => {
    if (!span.color && !span.bold && !span.dim) return span.text;
    return (
      <span
        key={i}
        style={{
          color: span.color,
          fontWeight: span.bold ? "bold" : undefined,
          opacity: span.dim ? 0.6 : undefined,
        }}
      >
        {span.text}
      </span>
    );
  });
}
