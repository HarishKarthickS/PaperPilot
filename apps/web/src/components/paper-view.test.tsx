import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaperView } from "./paper-view";

describe("PaperView", () => {
  it("renders multiple choice options below the question", () => {
    render(
      <PaperView
        assignment={{
          school: "Veda School",
          subject: "Math",
          grade: "Grade 4",
          timeLimit: 30,
          totalMarks: 1,
        }}
        sections={[
          {
            _id: "section-1",
            title: "Section A",
            instruction: "Choose the correct answer.",
            questions: [
              {
                _id: "question-1",
                questionText: "Which number is even?",
                type: "Multiple Choice Questions",
                difficulty: "Easy",
                marks: 1,
                options: ["3", "5", "8", "9"],
                bloomsLevel: "Remember",
                answerKey: "8",
                estimatedTime: "1 minute",
                confidenceScore: 1,
                generationRationale: "Checks number parity.",
              },
            ],
          },
        ]}
        showAnswers={false}
        onRegenerateQuestion={vi.fn()}
        onRegenerateSection={vi.fn()}
        onSaveSections={vi.fn()}
      />,
    );

    expect(screen.getByText("(A)")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("(C)")).toBeVisible();
    expect(screen.getByText("8")).toBeVisible();
  });
});
