export function participantDetails(b: Record<string, unknown>) {
  return {
    name: String(b.name || "").trim().slice(0, 100),
    categories: Array.isArray(b.categories) ? b.categories.slice(0, 12).map(x => String(x).slice(0, 100)) : [],
    likes: String(b.likes || "").slice(0, 1000), dislikes: String(b.dislikes || "").slice(0, 1000),
    updated_at: new Date().toISOString()
  };
}
