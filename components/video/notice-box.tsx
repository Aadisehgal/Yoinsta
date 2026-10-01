import { cn } from "@/lib/utils";

export interface Notice {
  kind: "ok" | "error";
  text: string;
  code?: string;
}

/** Success / error message. When YouTube needs a fresh permission it adds a Reconnect button. */
export function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        notice.kind === "ok" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-400"
      )}
    >
      <p>{notice.text}</p>
      {notice.code === "needs_reconnect" && (
        <a
          href="/api/youtube/connect"
          className="mt-2 inline-block rounded-md bg-saffron-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-saffron-400"
        >
          Reconnect YouTube
        </a>
      )}
    </div>
  );
}
