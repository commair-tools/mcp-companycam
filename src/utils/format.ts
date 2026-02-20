// ─── Response Helpers ────────────────────────────────────────────────────────

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

export function unixToStr(ts: number | null | undefined): string {
  if (!ts) return "N/A";
  return new Date(ts * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

export function formatAddress(addr: Record<string, string> | null | undefined): string {
  if (!addr) return "No address";
  const parts = [
    addr.street_address_1 ?? "",
    addr.street_address_2 ?? "",
    addr.city ?? "",
    addr.state ?? "",
    addr.postal_code ?? "",
  ];
  const result = parts.filter((p) => p).join(", ");
  return result || "No address";
}

export function getPhotoUrl(
  uris: Array<{ type?: string; url?: string; uri?: string }> | undefined,
  size = "web",
): string {
  if (!uris || uris.length === 0) return "No URL available";
  for (const u of uris) {
    if (u.type === size) {
      return u.url ?? u.uri ?? "";
    }
  }
  // Fallback to first available
  return uris[0].url ?? uris[0].uri ?? "No URL available";
}

export function formatProjectSummary(project: Record<string, unknown>): string {
  const addr = formatAddress(project.address as Record<string, string> | null);
  const name = (project.name as string) || "Unnamed";
  const pid = project.id ?? "?";
  const status = project.status ?? "?";
  const archived = project.archived ? " [ARCHIVED]" : "";
  const created = unixToStr(project.created_at as number | null);
  const updated = unixToStr(project.updated_at as number | null);
  const url = project.project_url as string | undefined;
  const notepad = project.notepad as string | undefined;

  const lines = [
    `**${name}** (ID: ${pid})${archived}`,
    `  Status: ${status}`,
    `  Address: ${addr}`,
    `  Created: ${created} | Updated: ${updated}`,
  ];
  if (url) lines.push(`  URL: ${url}`);
  if (notepad) {
    const truncated = notepad.length > 200 ? notepad.slice(0, 200) + "..." : notepad;
    lines.push(`  Notepad: ${truncated}`);
  }

  // Show primary contact if present
  const contact = project.primary_contact as Record<string, string> | null | undefined;
  if (contact?.name) {
    const contactParts = [contact.name];
    if (contact.phone_number) contactParts.push(contact.phone_number);
    if (contact.email) contactParts.push(contact.email);
    lines.push(`  Contact: ${contactParts.join(" | ")}`);
  }

  // Show integrations if present
  const integrations = project.integrations as Array<Record<string, string>> | undefined;
  if (integrations && integrations.length > 0) {
    const intStrs = integrations.map(
      (i) => `${i.type ?? "?"}:${i.relation_id ?? "?"}`,
    );
    lines.push(`  Integrations: ${intStrs.join(", ")}`);
  }

  return lines.join("\n");
}

export function formatPhotoSummary(photo: Record<string, unknown>): string {
  const pid = photo.id ?? "?";
  const creator = (photo.creator_name as string) || "Unknown";
  const desc = photo.description as string | undefined;
  const captured = unixToStr(photo.captured_at as number | null);
  const url = getPhotoUrl(
    photo.uris as Array<{ type?: string; url?: string; uri?: string }>,
  );
  const internal = photo.internal ? " [INTERNAL]" : "";
  const photoLink = photo.photo_url as string | undefined;

  const lines = [
    `Photo ${pid}${internal} — by ${creator} on ${captured}`,
  ];
  if (desc) lines.push(`  Description: ${desc}`);
  lines.push(`  Image: ${url}`);
  if (photoLink) lines.push(`  Web: ${photoLink}`);
  return lines.join("\n");
}
