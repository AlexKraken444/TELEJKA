import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthScreen } from "@/components/auth-screen";
export const dynamic = "force-dynamic";
export default async function Register() {
  if (await currentUser()) redirect("/feed");
  return <AuthScreen />;
}
