export function participantDetails(b: Record<string, unknown>) {
  return {
    name: String(b.name || "").trim().slice(0, 100),
    categories: Array.isArray(b.categories) ? b.categories.slice(0, 12).map(x => String(x).slice(0, 100)) : [],
    wishlist_links: Array.isArray(b.wishlist_links) ? b.wishlist_links.slice(0, 5).map(String).filter(x => {
      try { return ["http:", "https:"].includes(new URL(x).protocol); } catch { return false; }
    }) : [],
    likes: String(b.likes || "").slice(0, 1000), dislikes: String(b.dislikes || "").slice(0, 1000),
    updated_at: new Date().toISOString()
  };
}
