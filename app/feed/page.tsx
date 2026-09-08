import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SocialApp } from "@/components/social-app";
import type { User } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Feed() {
  const user = await currentUser();
  if (!user) redirect("/register");
  return <SocialApp initialUser={JSON.parse(JSON.stringify(user)) as User} />;
}
