"use client";

import React from "react";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Pencil, Plus, RefreshCw } from "lucide-react";
import { Badge, Button, Textarea } from "@veda/ui";
import { PaperRule, PaperSheet } from "./paper-sheet";

type Question = {
  _id?: string;
  questionText: string;
  type: string;
  difficulty: "Easy" | "Moderate" | "Challenging";
  marks: number;
  options?: string[];
  bloomsLevel: string;
  answerKey: string;
  estimatedTime: string;
  confidenceScore: number;
  generationRationale: string;
};
export type Section = { _id?: string; title: string; instruction: string; questions: Question[] };

export function PaperView({
  assignment,
  sections,
  showAnswers,
  disabled = false,
  onRegenerateQuestion,
  onRegenerateSection,
  onSaveSections,
}: {
  assignment: { subject: string; grade: string; timeLimit: number; totalMarks: number; school: string };
  sections: Section[];
  showAnswers: boolean;
  disabled?: boolean;
  onRegenerateQuestion: (id: string) => void;
  onRegenerateSection: (id: string) => void;
  onSaveSections: (sections: Section[]) => void;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ section: number; question: number }>();
  const [draft, setDraft] = useState(sections);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(sections);
    setDirty(false);
  }, [sections]);

  function updateQuestion(sectionIndex: number, questionIndex: number, text: string) {
    setDirty(true);
    setDraft((current) =>
      current.map((section, currentSection) =>
        currentSection !== sectionIndex
          ? section
          : {
              ...section,
              questions: section.questions.map((question, currentQuestion) =>
                currentQuestion === questionIndex ? { ...question, questionText: text } : question,
              ),
            },
      ),
    );
  }

  function addQuestion(sectionIndex: number) {
    setDirty(true);
    setDraft((current) => current.map((section, index) => index === sectionIndex ? {
      ...section,
      questions: [...section.questions, {
        questionText: "New teacher-authored question",
        type: "Short Questions",
        difficulty: "Moderate",
        marks: 2,
        options: [],
        bloomsLevel: "Understand",
        answerKey: "Add the expected answer.",
        estimatedTime: "3 minutes",
        confidenceScore: 1,
        generationRationale: "Added manually by the teacher.",
      }],
    } : section));
  }

  return (
    <PaperSheet className="mt-4 px-5 py-8 text-[#373737] md:mt-5 md:px-10 md:py-12 lg:px-14">
      <header className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Question Paper</p>
        <h1 className="mt-2 text-xl font-bold leading-snug md:text-[26px]">{assignment.school}</h1>
        <PaperRule className="mx-auto mt-3 max-w-[280px]" />
        <p className="mt-3 text-sm font-semibold md:text-base">Subject: {assignment.subject}</p>
        <p className="mt-1 text-sm font-semibold md:text-base">Class: {assignment.grade}</p>
      </header>

      <div className="mt-8 grid gap-2 border-y border-[#ececec] py-3 text-sm font-semibold sm:grid-cols-2 sm:justify-items-stretch md:text-[15px]">
        <p>Time Allowed: {assignment.timeLimit} minutes</p>
        <p className="sm:text-right">Maximum Marks: {assignment.totalMarks}</p>
      </div>

      <div className="mt-6 text-sm leading-7 md:text-[15px]">
        <p className="font-bold">General Instructions</p>
        <p className="mt-1 text-[#555]">All questions are compulsory unless stated otherwise.</p>
      </div>

      <dl className="mt-6 grid gap-y-2 text-sm font-semibold leading-7 md:text-[15px]">
        <div className="flex gap-3">
          <dt className="w-28 shrink-0">Name</dt>
          <dd className="paper-fill-line flex-1" />
        </div>
        <div className="flex gap-3">
          <dt className="w-28 shrink-0">Roll Number</dt>
          <dd className="paper-fill-line flex-1" />
        </div>
        <div className="flex gap-3">
          <dt className="w-28 shrink-0">Class / Section</dt>
          <dd className="flex-1">
            {assignment.grade}
            <span className="paper-fill-line ml-3 inline-block min-w-[7rem] align-baseline" />
          </dd>
        </div>
      </dl>

      {draft.map((section, sectionIndex) => {
        const key = section._id || section.title;
        const isCollapsed = collapsed.includes(key);
        return (
          <section key={key} className="mt-10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex-1 text-center text-lg font-bold md:text-xl">{section.title}</h2>
              <div className="paper-toolbar flex gap-1">
                {section._id && <Button disabled={disabled} title="Regenerate section" variant="ghost" size="icon" onClick={() => onRegenerateSection(section._id!)}><RefreshCw size={15} /></Button>}
                <Button title={isCollapsed ? "Expand section" : "Collapse section"} variant="ghost" size="icon" onClick={() => setCollapsed((list) => list.includes(key) ? list.filter((item) => item !== key) : [...list, key])}>
                  {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
                </Button>
              </div>
            </div>
            {!isCollapsed && (
              <>
                <h3 className="mt-6 text-sm font-bold md:text-base">{section.questions[0]?.type}</h3>
                <p className="mt-1 text-sm italic leading-6 text-[#555]">{section.instruction}</p>
                <ol className="mt-6 space-y-6 pl-0 text-sm leading-7 md:text-[15px]">
                  {section.questions.map((question, questionIndex) => (
                    <li key={question._id || questionIndex} className="group">
                      {editing?.section === sectionIndex && editing.question === questionIndex ? (
                        <div>
                          <Textarea value={question.questionText} onChange={(event) => updateQuestion(sectionIndex, questionIndex, event.target.value)} />
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" onClick={() => { setEditing(undefined); setDirty(false); onSaveSections(draft); }}>Save question</Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditing(undefined)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p>
                              <span className="mr-2 font-bold">{questionIndex + 1}.</span>
                              <Badge
                                tone={question.difficulty === "Easy" ? "easy" : question.difficulty === "Moderate" ? "moderate" : "hard"}
                                className="paper-toolbar mr-2 align-middle"
                              >
                                {question.difficulty}
                              </Badge>
                              {question.questionText}{" "}
                              <strong>[{question.marks} Marks]</strong>
                              <span className="paper-toolbar ml-2 hidden text-xs text-[#777] md:inline">Bloom: {question.bloomsLevel}</span>
                            </p>
                            {question.type === "Multiple Choice Questions" && Boolean(question.options?.length) && (
                              <ul className="mt-3 grid gap-1.5 text-sm text-[#444] sm:grid-cols-2">
                                {question.options!.map((option, optionIndex) => (
                                  <li key={`${question._id || questionIndex}-${option}`}>
                                    <span className="font-semibold">({String.fromCharCode(65 + optionIndex)})</span>{" "}
                                    {option}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="paper-toolbar flex shrink-0 gap-1 md:hidden md:group-hover:flex md:group-focus-within:flex">
                            <Button title="Copy question" variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(question.questionText)}><Copy size={15} /></Button>
                            <Button disabled={disabled} title="Edit question" variant="ghost" size="icon" onClick={() => setEditing({ section: sectionIndex, question: questionIndex })}><Pencil size={15} /></Button>
                            {question._id && <Button disabled={disabled} title="Regenerate question" variant="ghost" size="icon" onClick={() => onRegenerateQuestion(question._id!)}><RefreshCw size={15} /></Button>}
                          </div>
                        </div>
                      )}
                      {showAnswers && (
                        <p className="mt-3 border-l-2 border-[#f66c48] bg-[#fafafa] px-3 py-2.5 text-sm leading-6 text-[#555]">
                          <strong>Answer:</strong> {question.answerKey}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
                <Button disabled={disabled} className="paper-toolbar mt-6" size="sm" variant="secondary" onClick={() => addQuestion(sectionIndex)}>
                  <Plus size={15} /> Add custom question
                </Button>
              </>
            )}
          </section>
        );
      })}
      {dirty && (
        <div className="paper-toolbar mt-8 flex justify-end">
          <Button onClick={() => { onSaveSections(draft); setDirty(false); }}>Save paper changes</Button>
        </div>
      )}
      <p className="mt-12 text-center text-sm font-bold tracking-wide">*** End of Question Paper ***</p>
    </PaperSheet>
  );
}
