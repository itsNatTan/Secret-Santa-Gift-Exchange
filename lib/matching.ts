export type AssignmentPair = { giver_id: string; recipient_id: string };
export class DrawConstraintError extends Error {}

export function parseForcedPairs(value: unknown): AssignmentPair[] {
  if (!Array.isArray(value) || value.some(pair => !pair || typeof pair.giver_id !== "string" || typeof pair.recipient_id !== "string")) {
    throw new DrawConstraintError("Choose a giver and recipient for every forced pairing.");
  }
  return value.map(pair => ({ giver_id: pair.giver_id, recipient_id: pair.recipient_id }));
}

// Forced edges form disjoint paths and closed cycles. Randomly join the open
// paths into a cycle, preserving every forced edge without exponential search.
export function makeSecretSanta(ids: string[], forcedPairs: AssignmentPair[] = []) {
  if (ids.length < 3) throw new DrawConstraintError("At least 3 participants are required for a valid non-reciprocal draw.");
  const members = new Set(ids), result = new Map<string, string>(), usedRecipients = new Set<string>();
  if (members.size !== ids.length) throw new DrawConstraintError("Participants must be unique.");
  for (const { giver_id: giver, recipient_id: recipient } of forcedPairs) {
    if (!members.has(giver) || !members.has(recipient)) throw new DrawConstraintError("Forced pairings must use participants from this event.");
    if (giver === recipient) throw new DrawConstraintError("A participant cannot give to themselves.");
    if (result.has(giver)) throw new DrawConstraintError("Each giver can have only one forced recipient.");
    if (usedRecipients.has(recipient)) throw new DrawConstraintError("Each recipient can have only one forced giver.");
    if (result.get(recipient) === giver) throw new DrawConstraintError("Reciprocal pairings are not allowed.");
    result.set(giver, recipient);
    usedRecipients.add(recipient);
  }

  function shuffle<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  const paths: { head: string; tail: string }[] = [];
  let openParticipants = 0;
  for (const head of ids.filter(id => !usedRecipients.has(id))) {
    let tail = head;
    openParticipants++;
    while (result.has(tail)) { tail = result.get(tail)!; openParticipants++; }
    paths.push({ head, tail });
  }
  if (openParticipants > 0 && openParticipants < 3) {
    throw new DrawConstraintError("These forced pairings leave fewer than 3 participants outside a fixed cycle. Remove or change a pairing so everyone can be assigned.");
  }
  shuffle(paths);
  paths.forEach((path, index) => result.set(path.tail, paths[(index + 1) % paths.length].head));
  return ids.map(giver_id => ({ giver_id, recipient_id: result.get(giver_id)! }));
}
