import { Card, CardTitle, CardDescription } from "@/components/ui/card";

export default function AdminHomePage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardTitle>Access codes</CardTitle>
        <CardDescription>
          Generate ad-free access codes and view redemption history. Coming in Build Order
          Step 5.
        </CardDescription>
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
