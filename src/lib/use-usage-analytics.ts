import { useEffect, useRef } from "react";
import { startUsageTracker } from "./usage-tracker";
export function useUsageAnalytics(userId: number | undefined, section: string) {
  const sectionRef = useRef(section);
  useEffect(() => {
    sectionRef.current = section;
    window.dispatchEvent(new Event("itemstracker-section-change"));
  }, [section]);
  useEffect(() => {
    if (!userId) return;
    return startUsageTracker({
      kind: "user",
      apiBase: import.meta.env.VITE_API_BASE_URL || "",
      getSection: () => sectionRef.current,
      getToken: () => localStorage.getItem("med_auth_token") || "",
    });
  }, [userId]);
}
