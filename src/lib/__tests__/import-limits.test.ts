import { describe, expect, it } from "vitest"
import { MAX_IMPORT_FILE_BYTES, isImportFileSizeAllowed } from "../import-limits"

describe("导入文件大小限制", () => {
  it("允许上限以内的文件，拒绝超过上限的文件", () => {
    expect(isImportFileSizeAllowed(MAX_IMPORT_FILE_BYTES)).toBe(true)
    expect(isImportFileSizeAllowed(MAX_IMPORT_FILE_BYTES + 1)).toBe(false)
  })

  it("上限为 20 MiB，避免误把单位写成字节数", () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(20 * 1024 * 1024)
  })
})
