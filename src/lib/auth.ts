import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Me = { id: string; email: string; full_name: string; isAdmin: boolean };

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id),
      ]);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: profile?.full_name || u.email?.split("@")[0] || "User",
        isAdmin: !!roles?.some((r) => r.role === "admin"),
      };
    },
    staleTime: 60_000,
  });
}

export type Profile = { id: string; full_name: string; email: string };

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,email").order("full_name");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
