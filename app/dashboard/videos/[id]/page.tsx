import { VideoEditor } from "@/components/video/video-editor";

export default function EditVideoPage({ params }: { params: { id: string } }) {
  return <VideoEditor videoId={params.id} />;
}
