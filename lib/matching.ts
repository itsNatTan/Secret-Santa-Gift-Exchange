// Finds a random permutation with no self-assignments and no reciprocal pairs.
// Backtracking makes the constraints explicit; random candidate order makes results unpredictable.
export function makeSecretSanta(ids: string[]) {
  if (ids.length < 3) throw new Error("At least 3 participants are required for a valid non-reciprocal draw.");
  const givers = [...ids];
  const recipients = [...ids];
  const result = new Map<string, string>();

  function shuffle<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function search(index: number, remaining: string[]): boolean {
    if (index === givers.length) return true;
    const giver = givers[index];
    for (const recipient of shuffle([...remaining])) {
      if (recipient === giver) continue;
      // If recipient already gives to giver, this would create a 2-person reciprocal pair.
      if (result.get(recipient) === giver) continue;
      result.set(giver, recipient);
      if (search(index + 1, remaining.filter(x => x !== recipient))) return true;
      result.delete(giver);
    }
    return false;
  }

  if (!search(0, recipients)) throw new Error("Could not find a valid draw. Please try again.");
  return [...result.entries()].map(([giver_id, recipient_id]) => ({ giver_id, recipient_id }));
}
