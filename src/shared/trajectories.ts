/**
 * Shared trajectory entry parsing from protobuf-encoded blobs.
 */

import { decodeVarint } from "./protobuf";

/**
 * Parse trajectory entries from a decoded protobuf blob.
 *
 * Returns a Map of conversationId → base64-encoded info string,
 * and an array preserving insertion order (needed by save operations).
 */
export function parseTrajectoryEntries(decoded: Uint8Array): {
  entries: Map<string, string>;
  rawEntries: Map<string, Uint8Array>;
  order: string[];
} {
  const entries = new Map<string, string>();
  const rawEntries = new Map<string, Uint8Array>();
  const order: string[] = [];
  let pos = 0;

  while (pos < decoded.length) {
    const tag = decodeVarint(decoded, pos);
    pos = tag.pos;
    if ((tag.value & 7) !== 2) break;

    const len = decodeVarint(decoded, pos);
    pos = len.pos;
    const entry = decoded.slice(pos, pos + len.value);
    pos += len.value;

    let ep = 0;
    let uid: string | null = null;
    let infoB64: string | null = null;

    while (ep < entry.length) {
      const t = decodeVarint(entry, ep);
      ep = t.pos;
      const fn = t.value >> 3;
      const wt = t.value & 7;

      if (wt === 2) {
        const l = decodeVarint(entry, ep);
        ep = l.pos;
        const content = entry.slice(ep, ep + l.value);
        ep += l.value;

        if (fn === 1) {
          uid = new TextDecoder().decode(content);
        } else if (fn === 2) {
          let sp = 0;
          const st = decodeVarint(content, sp);
          sp = st.pos;
          const sl = decodeVarint(content, sp);
          sp = sl.pos;
          infoB64 = new TextDecoder().decode(content.slice(sp, sp + sl.value));
        }
      } else if (wt === 0) {
        const v = decodeVarint(entry, ep);
        ep = v.pos;
      } else {
        break;
      }
    }

    if (uid && infoB64) {
      entries.set(uid, infoB64);
      rawEntries.set(uid, entry);
      order.push(uid);
    }
  }

  return { entries, rawEntries, order };
}
