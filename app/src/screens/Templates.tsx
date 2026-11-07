// S13 templates: built-in ones are read-only (duplicate to change), your own can be edited and deleted.
import { useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { Banner, Button, IconButton, Modal, PageHeader, SkeletonRows, TextArea, TextInput, cx } from "../ui/base";
import { LoadError } from "../app/Layout";
import { templateDelete, templateSave, templatesList } from "../data/api";
import { useLive } from "../data/store";
import type { Template } from "../data/types";

const blank = (): Template => ({ id: "", name: "", description: "", builtIn: false, sections: [{ heading: "", instructions: "" }] });

export function Templates() {
  const list = useLive(() => templatesList(), []);
  const [selId, setSelId] = useState<string>();
  const [draft, setDraft] = useState<Template | null>(null);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const all = list.data ?? [];
  const sel = draft ?? all.find((t) => t.id === selId) ?? all[0];
  const choose = (t: Template) => { setSelId(t.id); setDraft(t.builtIn ? null : structuredClone(t)); setError(undefined); setSaved(false); };
  const edit = (f: (d: Template) => void) => setDraft((d) => { const c = structuredClone(d!); f(c); return c; });
  const save = async () => {
    if (!draft) return;
    try { const t = await templateSave(draft); setSelId(t.id); setDraft(t); setError(undefined); setSaved(true); }
    catch (e) { setError((e as Error).message); setSaved(false); }
  };

  const group = (title: string, items: Template[]) => (
    <div className="mb-4">
      <h2 className="px-2 pb-1 text-xs font-semibold text-muted">{title}</h2>
      {items.length === 0 && <p className="px-2 text-sm text-muted">None yet.</p>}
      {items.map((t) => (
        <button key={t.id} onClick={() => choose(t)} aria-current={sel?.id === t.id ? "true" : undefined}
          className={cx("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-base", sel?.id === t.id ? "bg-surface-2 font-semibold" : "hover:bg-surface")}>
          <span className="truncate">{t.name}</span>
          {t.builtIn && <Lock className="ml-auto size-3.5 shrink-0 text-muted" aria-label="Built in" />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <PageHeader title="Templates" description="A template sets the sections your notes are written into."
        actions={<Button icon={<Plus className="size-4" aria-hidden />} onClick={() => { setSelId(undefined); setDraft(blank()); setError(undefined); setSaved(false); }}>New template</Button>} />
      {list.loading ? <SkeletonRows n={4} /> : list.error ? <LoadError message={list.error} onRetry={list.retry} /> : (
        <div className="flex flex-col gap-6 md:flex-row">
          <nav aria-label="Templates" className="md:w-56 md:shrink-0">
            {group("Built in", all.filter((t) => t.builtIn))}
            {group("Yours", all.filter((t) => !t.builtIn))}
          </nav>
          <section aria-label="Template details" className="min-w-0 flex-1 rounded-lg border border-border p-4 md:p-5">
            {!sel ? null : !draft ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg">{sel.name}</h2>
                    <p className="text-sm text-muted">{sel.description}</p>
                  </div>
                  <Button onClick={() => { setSelId(undefined); setDraft({ ...structuredClone(sel), id: "", name: `${sel.name} (copy)`.slice(0, 40), builtIn: false }); setSaved(false); }}>Duplicate</Button>
                </div>
                <ol className="flex flex-col gap-3">
                  {sel.sections.map((s, i) => (
                    <li key={i} className="rounded-md bg-surface p-3">
                      <p className="font-semibold">{s.heading}</p>
                      <p className="text-sm text-muted">{s.instructions}</p>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
                <h2 className="text-lg">{draft.id ? "Edit template" : "New template"}</h2>
                {error && <Banner tone="error">{error}</Banner>}
                {saved && <Banner tone="success">Saved.</Banner>}
                <TextInput label="Name" value={draft.name} max={40} onChange={(e) => edit((d) => { d.name = e.target.value; })} />
                <TextInput label="Description (optional)" value={draft.description} onChange={(e) => edit((d) => { d.description = e.target.value; })} />
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-2 text-sm font-medium">Sections</legend>
                  {draft.sections.map((s, i) => (
                    <div key={i} className="flex gap-2 rounded-md bg-surface p-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <TextInput label={`Section ${i + 1} heading`} value={s.heading} onChange={(e) => edit((d) => { d.sections[i].heading = e.target.value; })} />
                        <TextArea label={`What goes in section ${i + 1}`} value={s.instructions} className="[&_textarea]:min-h-16"
                          onChange={(e) => edit((d) => { d.sections[i].instructions = e.target.value; })} />
                      </div>
                      <IconButton label={`Remove section ${i + 1}`} disabled={draft.sections.length === 1}
                        onClick={() => edit((d) => { d.sections.splice(i, 1); })}><Trash2 className="size-4" aria-hidden /></IconButton>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" className="self-start" icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => edit((d) => { d.sections.push({ heading: "", instructions: "" }); })}>Add section</Button>
                </fieldset>
                <div className="flex gap-2">
                  <Button type="submit" variant="primary">Save</Button>
                  {draft.id && <Button type="button" variant="ghost" className="ml-auto text-danger" onClick={() => setDeleting(true)}>Delete</Button>}
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      <Modal open={deleting} onOpenChange={setDeleting} title="Delete this template?" description="Notes that used it switch to the first built-in template. Notes already written stay as they are."
        footer={<><Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => draft && templateDelete(draft.id).then(() => { setDeleting(false); setDraft(null); setSelId(undefined); }, (e: Error) => { setDeleting(false); setError(e.message); })}>Delete</Button></>} />
    </div>
  );
}
