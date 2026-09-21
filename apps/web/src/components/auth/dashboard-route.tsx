import { useEffect, useState } from "react";
import type { RouterAppContext } from "@/routes/__root";
import { redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { SelfSelectableRole } from "@hospiledger/shared";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/utils/trpc";
import { RoleDashboard } from "./role-dashboard";
import { isProfileMissing } from "./auth-field";

export function dashboardBeforeLoad(role: Exclude<SelfSelectableRole, "admin">) {
  return async ({ context }: { context: RouterAppContext }) => {
    try {
      const { profile } = await context.queryClient.ensureQueryData(trpc.profile.me.queryOptions());
      if (profile.role !== role) {
        throw redirect({ to: "/app" });
      }
    } catch (error) {
      if (isProfileMissing(error)) {
        throw redirect({ to: "/register" });
      }
      throw error;
    }
  };
}

export function DashboardFor(role: Exclude<SelfSelectableRole, "admin">) {
  return function Dashboard() {
    const [email, setEmail] = useState("");
    const { data } = useQuery(trpc.profile.me.queryOptions());
    useEffect(() => {
      supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ""));
    }, []);
    if (!data) return null;
    return (
      <RoleDashboard
        role={role}
        profile={{ name: data.profile.name, companyName: data.company?.name ?? "" }}
        email={email}
      />
    );
  };
}
