import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-error"

const JSON_TEMPLATE = {
  version: "1.0",
  description: "Question Bank Import Template - JSON Format",
  questionTypes: {
    single: "Single Choice",
    multiple: "Multiple Choice",
    truefalse: "True/False",
    fill: "Fill in the Blank",
    calculation: "Calculation",
    essay: "Essay",
    code: "Code"
  },
  questions: [
    {
      type: "single",
      content: "Which of the following is a JavaScript data type?",
      options: ["A. String", "B. Number", "C. Boolean", "D. All of the above"],
      answer: "D",
      explanation: "JavaScript includes String, Number, Boolean and other basic data types",
      tags: ["JavaScript", "Basics"]
    },
    {
      type: "multiple",
      content: "Which of the following are CSS layout methods?",
      options: ["A. Flexbox", "B. Grid", "C. Float", "D. Table"],
      answer: "ABCD",
      explanation: "Flexbox, Grid, Float and Table can all be used for CSS layout",
      tags: ["CSS", "Layout"]
    },
    {
      type: "truefalse",
      content: "JavaScript is a statically typed language",
      answer: "false",
      explanation: "JavaScript is a dynamically typed language",
      tags: ["JavaScript", "Basics"]
    },
    {
      type: "fill",
      content: "In HTML, the ____ tag is used to create hyperlinks",
      answer: "a",
      explanation: "HTML uses the a tag to create hyperlinks",
      tags: ["HTML", "Basics"]
    },
    {
      type: "code",
      content: "Write a JavaScript function to remove duplicates from an array",
      answer: "function unique(arr) { return [...new Set(arr)]; }",
      explanation: "ES6 Set data structure can quickly remove array duplicates",
      tags: ["JavaScript", "Algorithm"]
    }
  ]
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "json"

    if (format === "csv") {
      const csvLines = [
        "type,content,options,answer,explanation,tags",
        'single,Which is a JS data type?,"A. String|B. Number|C. Boolean|D. All",D,Includes String Number Boolean,"JavaScript|Basics"',
        'multiple,Which are CSS layouts?,"A. Flexbox|B. Grid|C. Float|D. Table",ABCD,All can be used,"CSS|Layout"',
        'truefalse,JS is statically typed,false,JS is dynamically typed,"JavaScript|Basics"',
        "fill,HTML uses ____ tag for links,a,Uses a tag,\"HTML,Basics\"",
        'code,JS function to remove duplicates,"function unique(arr) { return [...new Set(arr)]; }",Uses ES6 Set,"JavaScript|Algorithm"'
      ]
      return new NextResponse(csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=question-template.csv"
        }
      })
    }

    return new NextResponse(JSON.stringify(JSON_TEMPLATE, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=question-template.json"
      }
    })
  } catch (error) {
    return handleApiError(error)
  }
}
