import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginHero } from "@/components/login/LoginHero";
import { DemoStage } from "@/components/login/DemoStage";
import { GoogleButton } from "@/components/login/GoogleButton";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="bg-void w-full">
      <LoginHero />
      <DemoStage
        cta={
          <div className="mt-[22px] flex flex-col items-center gap-[18px]">
            <div className="text-[12.5px] text-[#8a8a8a]">
              Ready to put it to work?
            </div>
            <GoogleButton size="md" />
          </div>
        }
      />
    </main>
  );
}
