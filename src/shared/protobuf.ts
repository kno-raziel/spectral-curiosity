/**
 * Protobuf encoding/decoding utilities for Antigravity's state.vscdb
 *
 * Antigravity stores conversation metadata as protobuf-encoded blobs
 * inside base64 strings in a SQLite database. This module provides
 * the primitives to read and modify those blobs.
 */

import type { WorkspaceEntry } from "./types";

/** Encode an integer as a protobuf varint */
export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes.length > 0 ? bytes : [0]);
}

/** Decode a varint from a buffer at a given position */
export function decodeVarint(data: Uint8Array, pos: number): { value: number; pos: number } {
  let result = 0;
  let shift = 0;
  let p = pos;
  while (p < data.length) {
    const b = data[p];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return { value: result, pos: p + 1 };
    }
    shift += 7;
    p += 1;
  }
  return { value: result, pos: p };
}

/** Encode a string as a protobuf field (wire type 2) */
export function encodeStringField(fieldNumber: number, value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const length = encodeVarint(encoded.length);
  return concatBytes(tag, length, encoded);
}

/** Encode raw bytes as a length-delimited protobuf field */
export function encodeLengthDelimited(fieldNumber: number, data: Uint8Array): Uint8Array {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const length = encodeVarint(data.length);
  return concatBytes(tag, length, data);
}

/** Remove all instances of a specific field from protobuf bytes */
export function stripField(data: Uint8Array, targetFieldNumber: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let pos = 0;

  while (pos < data.length) {
    const startPos = pos;
    let decoded: { value: number; pos: number };
    try {
      decoded = decodeVarint(data, pos);
    } catch {
      chunks.push(data.slice(startPos));
      break;
    }
    pos = decoded.pos;
    const tag = decoded.value;
    const wireType = tag & 7;
    const fieldNum = tag >> 3;

    if (wireType === 0) {
      const v = decodeVarint(data, pos);
      pos = v.pos;
    } else if (wireType === 2) {
      const len = decodeVarint(data, pos);
      pos = len.pos + len.value;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      chunks.push(data.slice(startPos));
      break;
    }

    if (fieldNum !== targetFieldNumber) {
      chunks.push(data.slice(startPos, pos));
    }
  }

  return concatBytes(...chunks);
}

/**
 * Build protobuf field 9 (workspace association) matching native format.
 */
export function buildField9(ws: WorkspaceEntry): Uint8Array {
  let inner = concatBytes(encodeStringField(1, ws.uri), encodeStringField(2, ws.uri));

  if (ws.gitSlug && ws.gitRemote) {
    const gitInfo = concatBytes(
      encodeStringField(1, ws.gitSlug),
      encodeStringField(2, ws.gitRemote),
    );
    inner = concatBytes(inner, encodeLengthDelimited(3, gitInfo));
  }

  if (ws.branch) {
    inner = concatBytes(inner, encodeStringField(4, ws.branch));
  }

  return encodeLengthDelimited(9, inner);
}

/** Extract workspace URI from protobuf field 9 */
export function extractField9Uri(innerData: Uint8Array): string | null {
  let pos = 0;

  while (pos < innerData.length) {
    let decoded: { value: number; pos: number };
    try {
      decoded = decodeVarint(innerData, pos);
    } catch {
      break;
    }
    pos = decoded.pos;
    const fn = decoded.value >> 3;
    const wt = decoded.value & 7;

    if (wt === 0) {
      const v = decodeVarint(innerData, pos);
      pos = v.pos;
    } else if (wt === 2) {
      const len = decodeVarint(innerData, pos);
      pos = len.pos;
      if (fn === 9 && len.value > 20) {
        const f9 = innerData.slice(pos, pos + len.value);
        try {
          const t9 = decodeVarint(f9, 0);
          const l9 = decodeVarint(f9, t9.pos);
          return new TextDecoder().decode(f9.slice(l9.pos, l9.pos + l9.value));
        } catch {
          // skip
        }
      }
      pos += len.value;
    } else if (wt === 1) {
      pos += 8;
    } else if (wt === 5) {
      pos += 4;
    } else {
      break;
    }
  }

  return null;
}

/** Concatenate multiple Uint8Arrays */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
