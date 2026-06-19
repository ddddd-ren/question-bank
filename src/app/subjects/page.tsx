"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BookMarked, ChevronRight, Edit3, Layers, Loader2, Plus, Save, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { showToast } from "@/components/toast"
import { cn } from "@/lib/utils"

interface Subject {
  id: number
  name: string
  code: string | null
  description: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface KnowledgePoint {
  id: number
  subjectId: number
  name: string
  parentId: number | null
  description: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface SubjectForm {
  name: string
  code: string
  description: string
}

interface KnowledgePointForm {
  name: string
  parentId: string
  description: string
}

const emptySubjectForm: SubjectForm = {
  name: "",
  code: "",
  description: "",
}

const emptyKnowledgePointForm: KnowledgePointForm = {
  name: "",
  parentId: "none",
  description: "",
}

function buildKnowledgeTree(points: KnowledgePoint[]) {
  const children = new Map<number | null, KnowledgePoint[]>()

  points.forEach((point) => {
    const parentId = point.parentId ?? null
    const siblings = children.get(parentId) ?? []
    siblings.push(point)
    children.set(parentId, siblings)
  })

  children.forEach((items) => {
    items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
  })

  const result: Array<{ point: KnowledgePoint; depth: number }> = []
  const visited = new Set<number>()

  function walk(parentId: number | null, depth: number) {
    for (const point of children.get(parentId) ?? []) {
      if (visited.has(point.id)) continue
      visited.add(point.id)
      result.push({ point, depth })
      walk(point.id, depth + 1)
    }
  }

  walk(null, 0)

  for (const point of points) {
    if (!visited.has(point.id)) {
      result.push({ point, depth: 0 })
    }
  }

  return result
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json()
    if (data.details) return `${data.error}：${data.details}`
    return data.error || fallback
  } catch {
    return fallback
  }
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingSubject, setSavingSubject] = useState(false)
  const [savingPoint, setSavingPoint] = useState(false)
  const [subjectForm, setSubjectForm] = useState<SubjectForm>(emptySubjectForm)
  const [pointForm, setPointForm] = useState<KnowledgePointForm>(emptyKnowledgePointForm)
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null)
  const [editingPointId, setEditingPointId] = useState<number | null>(null)

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) ?? null,
    [selectedSubjectId, subjects]
  )

  const selectedPoints = useMemo(
    () => knowledgePoints.filter((point) => point.subjectId === selectedSubjectId),
    [knowledgePoints, selectedSubjectId]
  )

  const treePoints = useMemo(() => buildKnowledgeTree(selectedPoints), [selectedPoints])

  const loadData = useCallback(async (preferredSubjectId?: number | null) => {
    setLoading(true)
    try {
      const [subjectsResponse, pointsResponse] = await Promise.all([
        fetch("/api/subjects"),
        fetch("/api/knowledge-points"),
      ])

      if (!subjectsResponse.ok) {
        throw new Error(await readErrorMessage(subjectsResponse, "获取学科失败"))
      }
      if (!pointsResponse.ok) {
        throw new Error(await readErrorMessage(pointsResponse, "获取知识点失败"))
      }

      const nextSubjects = await subjectsResponse.json() as Subject[]
      const nextPoints = await pointsResponse.json() as KnowledgePoint[]
      const nextSelectedId = preferredSubjectId && nextSubjects.some((subject) => subject.id === preferredSubjectId)
        ? preferredSubjectId
        : nextSubjects[0]?.id ?? null

      setSubjects(nextSubjects)
      setKnowledgePoints(nextPoints)
      setSelectedSubjectId(nextSelectedId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载学科库失败", "error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const resetSubjectForm = useCallback(() => {
    setSubjectForm(emptySubjectForm)
    setEditingSubjectId(null)
  }, [])

  const resetPointForm = useCallback(() => {
    setPointForm(emptyKnowledgePointForm)
    setEditingPointId(null)
  }, [])

  const handleSubjectSubmit = useCallback(async () => {
    const name = subjectForm.name.trim()
    if (!name) {
      showToast("请填写学科名称", "error")
      return
    }

    setSavingSubject(true)
    try {
      const response = await fetch(editingSubjectId ? `/api/subjects/${editingSubjectId}` : "/api/subjects", {
        method: editingSubjectId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: subjectForm.code.trim(),
          description: subjectForm.description.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, editingSubjectId ? "更新学科失败" : "创建学科失败"))
      }

      const saved = await response.json() as Subject
      showToast(editingSubjectId ? "学科已更新" : "学科已创建", "success")
      resetSubjectForm()
      await loadData(saved.id)
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存学科失败", "error")
    } finally {
      setSavingSubject(false)
    }
  }, [editingSubjectId, loadData, resetSubjectForm, subjectForm])

  const handleDeleteSubject = useCallback(async (subject: Subject) => {
    if (!window.confirm(`确定删除学科“${subject.name}”？`)) return

    try {
      const response = await fetch(`/api/subjects/${subject.id}`, { method: "DELETE" })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "删除学科失败"))
      }

      showToast("学科已删除", "success")
      resetSubjectForm()
      resetPointForm()
      await loadData(selectedSubjectId === subject.id ? null : selectedSubjectId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除学科失败", "error")
    }
  }, [loadData, resetPointForm, resetSubjectForm, selectedSubjectId])

  const startEditSubject = useCallback((subject: Subject) => {
    setEditingSubjectId(subject.id)
    setSubjectForm({
      name: subject.name,
      code: subject.code ?? "",
      description: subject.description ?? "",
    })
  }, [])

  const handlePointSubmit = useCallback(async () => {
    if (!selectedSubjectId) {
      showToast("请先选择学科", "error")
      return
    }

    const name = pointForm.name.trim()
    if (!name) {
      showToast("请填写知识点名称", "error")
      return
    }

    const parentId = pointForm.parentId === "none" ? null : Number(pointForm.parentId)
    setSavingPoint(true)

    try {
      const response = await fetch(
        editingPointId ? `/api/knowledge-points/${editingPointId}` : "/api/knowledge-points",
        {
          method: editingPointId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectId: selectedSubjectId,
            name,
            parentId,
            description: pointForm.description.trim(),
          }),
        }
      )

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, editingPointId ? "更新知识点失败" : "创建知识点失败"))
      }

      showToast(editingPointId ? "知识点已更新" : "知识点已创建", "success")
      resetPointForm()
      await loadData(selectedSubjectId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存知识点失败", "error")
    } finally {
      setSavingPoint(false)
    }
  }, [editingPointId, loadData, pointForm, resetPointForm, selectedSubjectId])

  const handleDeletePoint = useCallback(async (point: KnowledgePoint) => {
    if (!window.confirm(`确定删除知识点“${point.name}”？`)) return

    try {
      const response = await fetch(`/api/knowledge-points/${point.id}`, { method: "DELETE" })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "删除知识点失败"))
      }

      showToast("知识点已删除", "success")
      if (editingPointId === point.id) resetPointForm()
      await loadData(selectedSubjectId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除知识点失败", "error")
    }
  }, [editingPointId, loadData, resetPointForm, selectedSubjectId])

  const startEditPoint = useCallback((point: KnowledgePoint) => {
    setEditingPointId(point.id)
    setPointForm({
      name: point.name,
      parentId: point.parentId ? String(point.parentId) : "none",
      description: point.description ?? "",
    })
  }, [])

  const parentOptions = useMemo(
    () => treePoints.filter(({ point }) => point.id !== editingPointId),
    [editingPointId, treePoints]
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="text-3xl font-bold">学科库</h1>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="skeleton h-96" />
          <div className="skeleton h-96" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="page-header">
          <h1 className="text-3xl font-bold">学科库</h1>
          <p className="text-muted-foreground mt-2">维护学科与知识点层级，为题目归类打基础</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
          <div className="rounded-lg border border-border/80 bg-card px-4 py-2">
            <p className="text-xs text-muted-foreground">学科</p>
            <p className="text-xl font-bold">{subjects.length}</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-card px-4 py-2">
            <p className="text-xs text-muted-foreground">知识点</p>
            <p className="text-xl font-bold">{knowledgePoints.length}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookMarked className="h-4 w-4 text-primary" />
                {editingSubjectId ? "编辑学科" : "新增学科"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="学科名称，如 高等数学"
                value={subjectForm.name}
                onChange={(event) => setSubjectForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Input
                placeholder="编码，可选，如 MATH"
                value={subjectForm.code}
                onChange={(event) => setSubjectForm((prev) => ({ ...prev, code: event.target.value }))}
              />
              <Textarea
                placeholder="备注说明，可选"
                value={subjectForm.description}
                onChange={(event) => setSubjectForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSubjectSubmit} disabled={savingSubject}>
                  {savingSubject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {editingSubjectId ? "保存学科" : "创建学科"}
                </Button>
                {editingSubjectId && (
                  <Button variant="outline" onClick={resetSubjectForm}>
                    <X className="mr-2 h-4 w-4" />
                    取消编辑
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-primary" />
                学科列表
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {subjects.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <BookMarked className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="font-medium">还没有学科</p>
                  <p className="mt-1 text-sm text-muted-foreground">先创建一个学科，再维护知识点</p>
                </div>
              ) : (
                subjects.map((subject) => {
                  const isSelected = subject.id === selectedSubjectId
                  const pointCount = knowledgePoints.filter((point) => point.subjectId === subject.id).length

                  return (
                    <div
                      key={subject.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        isSelected ? "border-primary/50 bg-primary/5" : "border-border/80 bg-card hover:bg-muted/50"
                      )}
                    >
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 text-left"
                        onClick={() => {
                          setSelectedSubjectId(subject.id)
                          resetPointForm()
                        }}
                      >
                        <div className={cn("mt-0.5 rounded-lg p-2", isSelected ? "bg-primary text-primary-foreground" : "bg-muted")}>
                          <BookMarked className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{subject.name}</p>
                            {subject.code && <Badge variant="outline">{subject.code}</Badge>}
                            <Badge variant="secondary">{pointCount} 个知识点</Badge>
                          </div>
                          {subject.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subject.description}</p>
                          )}
                        </div>
                        <ChevronRight className={cn("mt-2 h-4 w-4 text-muted-foreground", isSelected && "text-primary")} />
                      </button>
                      <div className="mt-3 flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEditSubject(subject)}>
                          <Edit3 className="mr-1 h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteSubject(subject)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                {editingPointId ? "编辑知识点" : "新增知识点"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <Input
                  placeholder={selectedSubject ? `添加到 ${selectedSubject.name}` : "请先选择学科"}
                  value={pointForm.name}
                  onChange={(event) => setPointForm((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={!selectedSubject}
                />
                <Select
                  value={pointForm.parentId}
                  onValueChange={(value) => setPointForm((prev) => ({ ...prev, parentId: value }))}
                  disabled={!selectedSubject}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="父级知识点" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无父级</SelectItem>
                    {parentOptions.map(({ point, depth }) => (
                      <SelectItem key={point.id} value={String(point.id)}>
                        {"　".repeat(Math.min(depth, 4))}{point.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder="知识点说明，可选"
                value={pointForm.description}
                onChange={(event) => setPointForm((prev) => ({ ...prev, description: event.target.value }))}
                disabled={!selectedSubject}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handlePointSubmit} disabled={!selectedSubject || savingPoint}>
                  {savingPoint ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {editingPointId ? "保存知识点" : "创建知识点"}
                </Button>
                {editingPointId && (
                  <Button variant="outline" onClick={resetPointForm}>
                    <X className="mr-2 h-4 w-4" />
                    取消编辑
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-4 w-4 text-primary" />
                  知识点库
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedSubject ? `${selectedSubject.name} · ${selectedPoints.length} 个知识点` : "请选择学科"}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedSubject ? (
                <div className="rounded-lg border border-dashed p-10 text-center">
                  <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="font-medium">等待选择学科</p>
                  <p className="mt-1 text-sm text-muted-foreground">左侧选择或创建学科后，这里会显示知识点层级</p>
                </div>
              ) : selectedPoints.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center">
                  <Plus className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="font-medium">还没有知识点</p>
                  <p className="mt-1 text-sm text-muted-foreground">创建章节、概念或能力点，后续题目可按此归类</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {treePoints.map(({ point, depth }) => (
                    <div
                      key={point.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-3 transition-colors sm:flex-row sm:items-start",
                        editingPointId === point.id && "border-primary/50 bg-primary/5"
                      )}
                    >
                      <div className="min-w-0 flex-1" style={{ paddingLeft: `${Math.min(depth, 6) * 18}px` }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="number-badge">{depth + 1}</span>
                          <p className="font-medium">{point.name}</p>
                          {point.parentId && <Badge variant="outline">子知识点</Badge>}
                        </div>
                        {point.description && (
                          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{point.description}</p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEditPoint(point)}>
                          <Edit3 className="mr-1 h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeletePoint(point)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
