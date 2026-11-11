/**
 * Does `file` satisfy an HTML `accept` attribute value?
 *
 * Browsers treat `accept` on `<input type="file">` as advisory — the picker's
 * "All Files" option ignores it — so a rule that must actually hold has to be
 * re-checked at upload time, not only declared on the input.
 *
 * Supports the three forms the HTML spec allows: exact MIME types
 * (`image/png`), type wildcards (`image/*`) and extensions (`.pdf`). A file
 * with an empty MIME type only satisfies an extension entry, since there is no
 * declared type to compare against.
 */
export function matchesFileAccept(
  file: { type?: string | null; name?: string | null },
  accept?: string | null,
): boolean {
  if (!accept || !accept.trim()) return true

  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()

  return accept.split(",").some((raw) => {
    const entry = raw.trim().toLowerCase()
    if (!entry) return false
    if (entry.startsWith(".")) return name.endsWith(entry)
    if (entry.endsWith("/*")) return type.startsWith(entry.slice(0, -1))
    return type === entry
  })
}
