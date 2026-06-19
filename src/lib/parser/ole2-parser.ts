function parseOLE2(buffer: Buffer): Map<string, Buffer> {
  const streams = new Map<string, Buffer>()
  if (buffer.length < 512) return streams
  if (buffer.readUInt16LE(0) !== 0xCFD0) return streams

  const sectorSize = 1 << buffer.readUInt16LE(30)
  const dirSector = buffer.readUInt32LE(48)
  const fatSectors: number[] = []
  for (let i = 0; i < 109; i++) {
    const s = buffer.readUInt32LE(76 + i * 4)
    if (s === 0xFFFFFFFF) break
    fatSectors.push(s)
  }

  function readSector(n: number): Buffer {
    return buffer.subarray((n + 1) * sectorSize, (n + 2) * sectorSize)
  }

  const fat: number[] = []
  for (const fs of fatSectors) {
    const data = readSector(fs)
    for (let i = 0; i < sectorSize; i += 4) fat.push(data.readUInt32LE(i))
  }

  function readChain(start: number): Buffer {
    const bufs: Buffer[] = []
    let s = start
    const seen = new Set<number>()
    while (s < 0xFFFFFF00 && !seen.has(s)) {
      seen.add(s)
      bufs.push(readSector(s))
      s = fat[s]
    }
    return Buffer.concat(bufs)
  }

  if (dirSector === 0xFFFFFFFE) return streams
  const chain = readChain(dirSector)

  for (let off = 0; off + 128 <= chain.length; off += 128) {
    const nameLen = chain.readUInt16LE(off + 64)
    if (nameLen < 2) continue
    const name = chain.subarray(off, off + nameLen).toString('utf16le').replace(/\u0000/g, '').trim()
    const type = chain.readUInt8(off + 66)
    const start = chain.readUInt32LE(off + 116)
    if (type === 2 || type === 5) {
      streams.set(name, readChain(start))
    }
  }

  return streams
}

function isBoilerplate(text: string): boolean {
  return /版权所有|华德学院|数据科学与信息工程学院|方宏广|《Java程序设计》|___PPT|单击此处编辑母版/.test(text)
}

export function extractOLE2Text(buffer: Buffer): string[] {
  const rawTexts: string[] = []
  const streams = parseOLE2(buffer)

  for (const [, data] of streams) {
    if (data.length < 8) continue
    for (let off = 0; off + 8 <= data.length; off++) {
      const rType = data.readUInt16LE(off + 2)
      if (rType !== 4000) continue
      const rLen = data.readUInt32LE(off + 4)
      if (rLen <= 0 || rLen > 65536 || off + 8 + rLen > data.length) continue
      const payload = data.subarray(off + 8, off + 8 + rLen)
      const text = payload.toString('utf16le').replace(/\u0000/g, '').trim()
      if (text.length >= 3 && !isBoilerplate(text)) {
        rawTexts.push(text)
      }
    }
  }

  const paragraphs: string[] = []
  let current = ""
  for (const text of rawTexts) {
    if (/[A-D]\s*[、.．]/.test(text) && current.length > 10) {
      paragraphs.push(current.trim())
      current = ""
    }
    current += (current ? "\n" : "") + text
  }
  if (current.trim().length > 10) paragraphs.push(current.trim())

  return paragraphs
}
