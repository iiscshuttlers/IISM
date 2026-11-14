import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "./supabase";

describe("normalizeSupabaseUrl", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(normalizeSupabaseUrl("abc.supabase.co")).toBe("https://abc.supabase.co");
  });
  it("keeps a full URL and trims spaces and trailing slashes", () => {
    expect(normalizeSupabaseUrl(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
  });
  it("rejects empty or unusable values", () => {
    expect(normalizeSupabaseUrl(undefined)).toBeNull();
    expect(normalizeSupabaseUrl("   ")).toBeNull();
    expect(normalizeSupabaseUrl("https://")).toBeNull();
  });
});
