import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // Middleware already checks this — this is the required server-side double check.
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");
  if (!session.user.adminPinOk) redirect("/admin/pin");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <span className="font-display text-lg">Yoinsta Admin</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
