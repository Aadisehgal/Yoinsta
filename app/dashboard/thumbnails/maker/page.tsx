import { ThumbnailMaker } from "@/components/thumbnail/thumbnail-maker";

export default function ThumbnailMakerPage({ searchParams }: { searchParams: { video?: string } }) {
  // Only pass a clean 11-character video ID through (the editor links here with ?video=ID).
  const video = typeof searchParams.video === "string" && /^[\w-]{11}$/.test(searchParams.video) ? searchParams.video : undefined;
  return <ThumbnailMaker initialVideo={video} />;
}
