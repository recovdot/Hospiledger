import { createFileRoute } from "@tanstack/react-router";
import { DashboardFor, dashboardBeforeLoad } from "@/components/auth/dashboard-route";

export const Route = createFileRoute("/_authed/buyer")({
  beforeLoad: dashboardBeforeLoad("buyer"),
  component: DashboardFor("buyer"),
});
