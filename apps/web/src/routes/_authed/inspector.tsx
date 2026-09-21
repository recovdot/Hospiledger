import { createFileRoute } from "@tanstack/react-router";
import { DashboardFor, dashboardBeforeLoad } from "@/components/auth/dashboard-route";

export const Route = createFileRoute("/_authed/inspector")({
  beforeLoad: dashboardBeforeLoad("inspector"),
  component: DashboardFor("inspector"),
});
