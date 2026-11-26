import { TextbookWorkspace } from "@/components/textbooks/workspace"

export default async function TextbookPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams])
  const initialView = view === "progress" || view === "links" ? view : "read"
  return <TextbookWorkspace key={`${id}:${initialView}`} id={id} initialView={initialView} />
}
