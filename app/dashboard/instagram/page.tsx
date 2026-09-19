import { Instagram } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default function InstagramPage() {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <Card className="items-center py-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-800">
          <Instagram className="text-platform-instagram" size={22} />
        </div>
        <CardTitle>Instagram — coming soon</CardTitle>
        <CardDescription>
          Instagram needs its own Meta Developer app and access review, separate from the YouTube
          setup — that&apos;s next on the build order.
        </CardDescription>
      </Card>
    </div>
  );
}
