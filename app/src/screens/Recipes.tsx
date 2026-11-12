// S11/S12 recipes: saved chat prompts. Type /shortcut in Ask to run one. Built-in ones are read-only (duplicate to
// change), your own can be edited and deleted. Same layout as Templates.
import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { Banner, Button, Modal, PageHeader, RadioCards, SkeletonRows, TextArea, TextInput, cx } from "../ui/base";
import { LoadError } from "../app/Layout";
import { recipeDelete, recipeSave, recipesList } from "../data/api";
import { useLive } from "../data/store";
import { slugify } from "../data/format";
import type { Recipe } from "../data/types";

const blank = (): Recipe => ({ id: "", slug: "", name: "", prompt: "", scope: "single", builtIn: false });
const SCOPES: { value: Recipe["scope"]; title: string; body: string }[] = [
  { value: "single", title: "One meeting", body: "Runs in the Ask panel of a note." },
  { value: "multiple", title: "Several meetings", body: "Runs anywhere: a folder, a selection or all notes." },
];

export function Recipes() {
  const list = useLive(() => recipesList(), []);
  const [selId, setSelId] = useState<string>();
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const all = list.data ?? [];
  const sel = draft ?? all.find((r) => r.id === selId) ?? all[0];
  const choose = (r: Recipe) => { setSelId(r.id); setDraft(r.builtIn ? null : { ...r }); setError(undefined); setSaved(false); };
  const edit = (p: Partial<Recipe>) => { setDraft((d) => d && { ...d, ...p }); setSaved(false); };
  const save = async () => {
    if (!draft) return;
    try { const r = await recipeSave(draft); setSelId(r.id); setDraft(r); setError(undefined); setSaved(true); }
    catch (e) { setError((e as Error).message); setSaved(false); }
  };

  const group = (title: string, items: Recipe[]) => (
    <div className="mb-4">
      <h2 className="px-2 pb-1 text-xs font-semibold text-muted">{title}</h2>
      {items.length === 0 && <p className="px-2 text-sm text-muted">None yet. Make one with New recipe.</p>}
      {items.map((r) => (
        <button key={r.id} onClick={() => choose(r)} aria-current={sel?.id === r.id ? "true" : undefined}
          className={cx("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-base", sel?.id === r.id ? "bg-surface-2 font-semibold" : "hover:bg-surface")}>
          <span className="truncate">{r.name}</span>
          <span className="ml-auto shrink-0 text-xs font-normal text-muted">/{r.slug}</span>
          {r.builtIn && <Lock className="size-3.5 shrink-0 text-muted" aria-label="Built in" />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <PageHeader title="Recipes" description="Questions you ask often, saved. Type / and the shortcut in Ask to run one."
        actions={<Button icon={<Plus className="size-4" aria-hidden />} onClick={() => { setSelId(undefined); setDraft(blank()); setError(undefined); setSaved(false); }}>New recipe</Button>} />
      {list.loading ? <SkeletonRows n={4} /> : list.error ? <LoadError message={list.error} onRetry={list.retry} /> : (
        <div className="flex flex-col gap-6 md:flex-row">
          <nav aria-label="Recipes" className="md:w-64 md:shrink-0">
            {group("Built in", all.filter((r) => r.builtIn))}
            {group("Yours", all.filter((r) => !r.builtIn))}
          </nav>
          <section aria-label="Recipe details" className="min-w-0 flex-1 rounded-lg border border-border p-4 md:p-5">
            {!sel ? null : !draft ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg [overflow-wrap:anywhere]">{sel.name}</h2>
                    <p className="text-sm text-muted">/{sel.slug} · {sel.scope === "single" ? "one meeting" : "several meetings"}</p>
                  </div>
                  <Button onClick={() => { setSelId(undefined); setDraft({ ...sel, id: "", builtIn: false, name: `${sel.name} (copy)`.slice(0, 40), slug: "" }); setSaved(false); }}>Duplicate</Button>
                </div>
                <p className="whitespace-pre-wrap rounded-md bg-surface p-3 text-base [overflow-wrap:anywhere]">{sel.prompt}</p>
              </>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
                <h2 className="text-lg">{draft.id ? "Edit recipe" : "New recipe"}</h2>
                {error && <Banner tone="error">{error}</Banner>}
                {saved && <Banner tone="success">Saved. Type /{draft.slug} in Ask to run it.</Banner>}
                <div className="grid gap-3 md:grid-cols-2">
                  <TextInput label="Name" value={draft.name} max={40} onChange={(e) => edit({ name: e.target.value })} />
                  <TextInput label="Shortcut" value={draft.slug} placeholder={slugify(draft.name) || "my-recipe"}
                    onChange={(e) => edit({ slug: e.target.value })} />
                </div>
                <p className="-mt-2 text-sm text-muted">Runs with /{slugify(draft.slug || draft.name) || "…"}</p>
                <RadioCards label="Works on" value={draft.scope} onChange={(v) => edit({ scope: v })} options={SCOPES} />
                <TextArea label="What to ask" value={draft.prompt} max={4000} rows={6} onChange={(e) => edit({ prompt: e.target.value })}
                  placeholder="List the risks that came up, who raised each one, and what we agreed to do about it." />
                <div className="flex gap-2">
                  <Button type="submit" variant="primary">Save</Button>
                  {draft.id && <Button type="button" variant="ghost" className="ml-auto text-danger" onClick={() => setDeleting(true)}>Delete</Button>}
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      <Modal open={deleting} onOpenChange={setDeleting} title="Delete this recipe?" description="Chats that used it keep their answers."
        footer={<><Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => draft && recipeDelete(draft.id).then(() => { setDeleting(false); setDraft(null); setSelId(undefined); }, (e: Error) => { setDeleting(false); setError(e.message); })}>Delete</Button></>} />
    </div>
  );
}
