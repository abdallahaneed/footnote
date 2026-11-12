// The "/" menu of the Ask bar: every recipe, as Option rows.
import { recipesList } from "../data/api";
import { useLive } from "../data/store";
import type { Option } from "../ui/notes";

export function useRecipeOptions(): Option[] {
  const list = useLive(() => recipesList(), []);
  return (list.data ?? []).map((r) => ({ id: r.id, label: `/${r.slug}`, detail: r.name, hint: r.scope === "single" ? "one meeting" : "several" }));
}
