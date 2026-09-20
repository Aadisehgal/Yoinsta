import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { AccessCodesPanel } from "@/components/admin/access-codes-panel";

export default function AdminHomePage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="sm:col-span-2">
        <CardTitle>Access codes</CardTitle>
        <CardDescription>Generate ad-free access codes and view their usage.</CardDescription>
        <div className="mt-4">
          <AccessCodesPanel />
        </div>
      </Card>
      <Card>
        <CardTitle>Users</CardTitle>
        <CardDescription>View all users and their current plan.</CardDescription>
      </Card>
      <Card>
        <CardTitle>Admin logs</CardTitle>
        <CardDescription>Every admin action, with actor, timestamp, and metadata.</CardDescription>
      </Card>
    </div>
  );
}
