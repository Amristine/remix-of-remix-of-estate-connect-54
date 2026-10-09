import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Estatery CRM" },
      { name: "description", content: "Real estate CRM for leads and cold data." },
      { property: "og:title", content: "Estatery CRM" },
      { property: "og:description", content: "Real estate CRM for leads and cold data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/leads" });
  },
});
