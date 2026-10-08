/* MD5 checksum of a file, read in pieces (so large PDFs don't need one huge buffer).
   Used only to check that a copy in Google Drive is byte-for-byte the same as the file on
   this phone (Drive reports each file's MD5) before the phone's copy is removed. Not for security. */

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

function block(h, w) {
  let [a, b, c, d] = h;
  for (let i = 0; i < 64; i++) {
    let f; let g;
    if (i < 16) { f = (b & c) | (~b & d); g = i; } else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; }
    const tmp = d; d = c; c = b;
    const x = (a + f + K[i] + w[g]) >>> 0;
    b = (b + ((x << S[i]) | (x >>> (32 - S[i])))) >>> 0;
    a = tmp;
  }
  h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
}

export function md5Hasher() {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const buf = new Uint8Array(64); let used = 0; let total = 0;
  const w = new Uint32Array(16);
  const flush = () => { for (let i = 0; i < 16; i++) w[i] = buf[i * 4] | (buf[i * 4 + 1] << 8) | (buf[i * 4 + 2] << 16) | (buf[i * 4 + 3] << 24); block(h, w); used = 0; };
  return {
    update(bytes) {
      total += bytes.length;
      let i = 0;
      while (i < bytes.length && used) { buf[used++] = bytes[i++]; if (used === 64) flush(); }
      // Whole 64-byte blocks straight from the input (the fast path).
      for (; i + 64 <= bytes.length; i += 64) {
        for (let j = 0; j < 16; j++) { const o = i + j * 4; w[j] = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24); }
        block(h, w);
      }
      while (i < bytes.length) { buf[used++] = bytes[i++]; if (used === 64) flush(); }
    },
    hex() {
      const bits = total * 8;
      this.update(new Uint8Array([0x80])); total -= 1;
      while (used !== 56) this.update(new Uint8Array([0])), total -= 1;
      const len = new Uint8Array(8);
      for (let i = 0; i < 8; i++) len[i] = Math.floor(bits / 2 ** (8 * i)) & 0xff;
      this.update(len);
      return h.map((v) => [0, 8, 16, 24].map((s) => ((v >>> s) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
    }
  };
}

/** MD5 of a Blob/File as lowercase hex. onProgress(done, total) is optional. */
export async function md5Blob(blob, onProgress) {
  const hasher = md5Hasher();
  const STEP = 4 * 1048576;
  for (let at = 0; at < blob.size; at += STEP) {
    hasher.update(new Uint8Array(await blob.slice(at, at + STEP).arrayBuffer()));
    onProgress?.(Math.min(blob.size, at + STEP), blob.size);
  }
  return hasher.hex();
}
