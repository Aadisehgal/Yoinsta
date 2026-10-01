import { cn } from "@/lib/utils";
import { parseBlocks, parseInline, type ListItem } from "@/lib/markdown-lite";

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) => {
        if (part.kind === "bold") return <strong key={i}>{part.text}</strong>;
        if (part.kind === "italic") return <em key={i}>{part.text}</em>;
        if (part.kind === "code") {
          return (
            <code key={i} className="rounded bg-ink-800 px-1 py-0.5 text-xs">
              {part.text}
            </code>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}

function List({ items }: { items: ListItem[] }) {
  const ordered = items[0]?.ordered ?? false;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={cn("mt-2 space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
      {items.map((item, i) => (
        <li key={i}>
          <InlineText text={item.text} />
          {item.children.length > 0 && <List items={item.children} />}
        </li>
      ))}
    </Tag>
  );
}

/** Renders AI chat text as readable paragraphs / lists / bold instead of raw ** and ### symbols. */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={cn("space-y-1 break-words", className)}>
      {blocks.map((block, i) => {
        if (block.type === "hr") return <hr key={i} className="my-3 border-border" />;
        if (block.type === "heading") {
          return (
            <p key={i} className={cn("mt-3 font-medium", block.level <= 2 ? "font-display text-base" : "text-sm")}>
              <InlineText text={block.text} />
            </p>
          );
        }
        if (block.type === "list") return <List key={i} items={block.items} />;
        return (
          <p key={i} className="mt-2 first:mt-0">
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <InlineText text={line} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
