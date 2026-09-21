import { createFileRoute } from "@tanstack/react-router";
import { DashboardFor, dashboardBeforeLoad } from "@/components/auth/dashboard-route";

export const Route = createFileRoute("/_authed/seller")({
  beforeLoad: dashboardBeforeLoad("seller"),
  component: DashboardFor("seller"),
});
