import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutAction } from "@/app/actions/auth";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

/** Initials for the avatar chip: up to two words, else the email's first char. */
function initialsFor(name: string | null | undefined, email: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  }
  return (email[0] ?? "?").toUpperCase();
}

export default async function Home() {
  const session = await auth();

  // Every visit to the site lands here; unauthenticated visitors get the
  // login screen and come back once Google has signed them in.
  if (!session?.user) redirect("/login");

  const email = session.user.email ?? "unknown";
  const name = session.user.name ?? email;

  return (
    <DashboardApp
      user={{ name, email, initials: initialsFor(session.user.name, email) }}
      onSignOut={signOutAction}
    />
  );
}
