// Folder icons (S06, S23). Stored as a key in folders.icon; unknown or empty keys fall back to the plain folder.
import { BookOpen, Briefcase, Calendar, ChartLine, Code, Folder, GraduationCap, Handshake, Heart, Lightbulb, Megaphone, Rocket, Star, Target, User, Users, type LucideIcon } from "lucide-react";

export const FOLDER_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  folder: { label: "Folder", Icon: Folder }, briefcase: { label: "Briefcase", Icon: Briefcase }, users: { label: "Team", Icon: Users },
  user: { label: "Person", Icon: User }, handshake: { label: "Customers", Icon: Handshake }, target: { label: "Goals", Icon: Target },
  rocket: { label: "Launch", Icon: Rocket }, chart: { label: "Numbers", Icon: ChartLine }, code: { label: "Engineering", Icon: Code },
  megaphone: { label: "Marketing", Icon: Megaphone }, lightbulb: { label: "Ideas", Icon: Lightbulb }, calendar: { label: "Planning", Icon: Calendar },
  book: { label: "Reading", Icon: BookOpen }, cap: { label: "Learning", Icon: GraduationCap }, star: { label: "Favourites", Icon: Star },
  heart: { label: "Personal", Icon: Heart },
};

export function FolderGlyph({ icon, className = "size-4" }: { icon?: string | null; className?: string }) {
  const { Icon } = FOLDER_ICONS[icon ?? ""] ?? FOLDER_ICONS.folder;
  return <Icon className={className} aria-hidden />;
}

// Radio group of icons: arrow keys move, the label is read out, focus ring shows on the tile.
export function FolderIconPicker({ value, onChange }: { value?: string | null; onChange: (key: string) => void }) {
  const current = value && FOLDER_ICONS[value] ? value : "folder";
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Icon</legend>
      <div className="grid grid-cols-8 gap-1">
        {Object.entries(FOLDER_ICONS).map(([key, { label, Icon }]) => (
          <label key={key} title={label} className="relative">
            <input type="radio" name="folder-icon" value={key} checked={current === key} onChange={() => onChange(key)} aria-label={label} className="peer sr-only" />
            <span className="flex size-8 items-center justify-center rounded-md border border-transparent text-muted hover:bg-surface-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              <Icon className="size-4" aria-hidden />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
