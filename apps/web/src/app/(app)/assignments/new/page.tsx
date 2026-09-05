"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  bloomLevelSchema,
  createAssignmentSchema,
  difficultyPreferenceSchema,
  questionTotals,
  questionTypeSchema,
} from "@veda/contracts";
import { Badge, Button, Input, Label, Textarea, cn } from "@veda/ui";
import { CalendarDays, Check, ChevronDown, CloudUpload, FileText, Mic, Plus, X, ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { NumberStepper } from "@/components/number-stepper";
import { CustomSelect } from "@/components/custom-select";
import { apiRequest } from "@/lib/api";
import { uploadFiles } from "@/lib/uploadthing";
import { defaultAssignment, useAssignmentDraft } from "@/store/assignment-draft";

const formSchema = createAssignmentSchema.omit({ dueDate: true }).extend({
  dueDate: z.string().min(1, "Choose a due date."),
});
type AssignmentForm = z.infer<typeof formSchema>;
type BackgroundUpload = {
  sourceDraftId: string;
  sourceDocumentId?: string;
  fileName: string;
  fileSize: number;
  status: "idle" | "uploading" | "uploaded" | "failed";
};

function localQuestionTotals(groups: any[]) {
  return (groups || []).reduce(
    (total, group) => {
      const count = Number(group?.count || 0);
      const marks = Number(group?.marks || 0);
      return {
        questions: total.questions + count,
        marks: total.marks + count * marks,
      };
    },
    { questions: 0, marks: 0 }
  );
}

export default function CreateAssignmentPage() {
  const router = useRouter();
  const uploadInput = useRef<HTMLInputElement>(null);
  const savedDraft = useAssignmentDraft((state) => state.draft);
  const setDraft = useAssignmentDraft((state) => state.setDraft);
  const clearDraft = useAssignmentDraft((state) => state.clearDraft);
  const [step, setStep] = useState(1);
  const [materialUpload, setMaterialUpload] = useState<BackgroundUpload | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [activity, setActivity] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech only works in Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        const currentText = form.getValues("instructions") || "";
        const space = currentText && !currentText.endsWith(" ") ? " " : "";
        form.setValue("instructions", currentText + space + finalTranscript.trim(), { shouldDirty: true, shouldValidate: true });
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      if (event.error !== "no-speech") {
        alert("Speech recognition error: " + event.error);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      setIsRecording(false);
    }
  };
  const form = useForm<AssignmentForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...defaultAssignment,
      ...savedDraft,
      dueDate: savedDraft.dueDate ? savedDraft.dueDate.slice(0, 10) : "",
    },
  });
  const rows = useFieldArray({ control: form.control, name: "questionGroups" });
  const watchedRows = useWatch({
    control: form.control,
    name: "questionGroups",
    defaultValue: defaultAssignment.questionGroups,
  });
  const totals = localQuestionTotals(watchedRows || defaultAssignment.questionGroups);

  async function uploadStudyMaterial(file: File) {
    const sourceDraftId = materialUpload?.sourceDraftId || crypto.randomUUID();

    setSubmitError("");

    setMaterialUpload({
      sourceDraftId,
      fileName: file.name,
      fileSize: file.size,
      status: "uploading",
    });

    setActivity("Uploading study material in the background");

    setIsUploading(true);

    try {
      // Poll our own backend to detect when the UploadThing webhook has fired and
      // created the SourceDocument. This is more reliable than waiting on the
      // browser's CDN response (which can hang indefinitely on mobile/slow networks).
      async function pollForSourceDocument(draftId: string): Promise<{ _id: string }> {
        for (let attempt = 0; attempt < 60; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const doc = await apiRequest<{ _id: string } | null>(`/source-documents/pending/${draftId}`);
          if (doc?._id) return doc;
        }
        throw new Error("Upload confirmation timed out. Please try again.");
      }

      // Fire the upload with skipPolling so it doesn't hang waiting for the CDN
      // response — the webhook already notified our backend.
      const uploadPromise = uploadFiles("studyMaterial", {
        files: [file],
        input: { sourceDraftId },
        skipPolling: true,
        onUploadProgress: ({ file, progress }: { file: string; progress: number }) => {
          console.log(`[Upload Progress] ${file} - ${progress}%`);
        },
      } as never);

      // Race: whichever resolves first (upload client response OR our backend poll)
      await Promise.race([
        uploadPromise,
        pollForSourceDocument(sourceDraftId),
      ]);

      setMaterialUpload({
        sourceDraftId,
        fileName: file.name,
        fileSize: file.size,
        status: "uploaded",
      });

      setActivity("");
    } catch (problem) {
      console.error("UPLOAD FAILED", problem);

      setMaterialUpload({
        sourceDraftId,
        fileName: file.name,
        fileSize: file.size,
        status: "failed",
      });

      setActivity("");

      setSubmitError(
        problem instanceof Error
          ? problem.message
          : "Study material could not be uploaded."
      );
    } finally {
      setIsUploading(false);
    }
  }

  function saveAndContinue() {
    form.trigger(["dueDate", "questionGroups"]).then((valid) => {
      if (!valid) return;
      const values = form.getValues();
      setDraft({ ...values, dueDate: new Date(`${values.dueDate}T23:59:59`).toISOString() });
      setStep(2);
    });
  }

  async function waitForExtraction(assignmentId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const source = await apiRequest<{ extractionStatus: string } | null>(`/assignments/${assignmentId}/source`);
      if (!source || source.extractionStatus === "completed") return;
      if (source.extractionStatus === "failed") throw new Error("We could not read the uploaded material.");
      setActivity("Analyzing uploaded material");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Material analysis is taking longer than expected. Try generating again from the assessment page.");
  }

  const submit = form.handleSubmit(async (values) => {
    if (isUploading) {
      setSubmitError("Please wait for the study material to finish uploading before submitting.");
      return;
    }

    setSubmitError("");
    try {
      setActivity("Creating assessment");
      const assignment = await apiRequest<{ _id: string }>("/assignments", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          dueDate: new Date(`${values.dueDate}T23:59:59`).toISOString(),
          sourceDraftId: materialUpload?.status === "uploaded" ? materialUpload.sourceDraftId : undefined,
        }),
      });
      if (materialUpload?.status === "uploaded") {
        setActivity("Analyzing uploaded material");
        await waitForExtraction(assignment._id);
      }
      setActivity("Queueing AI generation");
      await apiRequest(`/assignments/${assignment._id}/generate`, { method: "POST" });
      clearDraft();
      setMaterialUpload(null);
      router.push(`/assignments/${assignment._id}`);
    } catch (problem) {
      setActivity("");
      setSubmitError(problem instanceof Error ? problem.message : "Assessment could not be created.");
    }
  });

  return (
    <section className="mx-auto max-w-[1040px] pb-8 pt-4 md:pt-7">
      <div className="mb-6 flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="hidden size-2.5 rounded-full bg-[#f66c48] md:block" />
            <h1 className="text-lg font-bold md:text-2xl">Create Assignment</h1>
          </div>
          <p className="hidden text-sm text-[#8e8e8e] md:block">Set up a new assignment for your students</p>
        </div>
      </div>
      <div className="mb-8 flex gap-2 px-1 md:px-0">
        <div className="h-1 flex-1 rounded-full bg-[#626262]" />
        <div className={cn("h-1 flex-1 rounded-full", step === 2 ? "bg-[#626262]" : "bg-[#d9d9d9]")} />
      </div>

      <form onSubmit={submit}>
        {step === 1 ? (
          <div className="paper-sheet p-5 md:p-8">
            <h2 className="text-xl font-bold">Assignment Details</h2>
            <p className="mb-6 mt-1 text-sm text-[#777]">Basic information about your assignment</p>
            <input
              ref={uploadInput}
              className="sr-only"
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png,.pdf,application/pdf,.txt,text/plain,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadStudyMaterial(file);
              }}
            />
            <button
              type="button"
              onClick={() => uploadInput.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void uploadStudyMaterial(file);
              }}
              className="flex min-h-[190px] w-full flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#d0d0d0] bg-white p-5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef6542]"
            >
              <CloudUpload className="mb-5" size={27} />
              {materialUpload ? (
                <>
                  <span className="flex items-center gap-2 font-semibold"><FileText size={18} /> {materialUpload.fileName}</span>
                  <span className="mt-2 text-sm text-[#888]">
                    {(materialUpload.fileSize / 1024 / 1024).toFixed(2)} MB - {materialUpload.status === "uploading" ? "uploading now" : materialUpload.status === "uploaded" ? "ready for generation" : "click to replace"}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">Choose a file or drag &amp; drop it here</span>
                  <span className="mt-2 text-sm text-[#aaa]">PDF, DOCX, TXT, JPEG, PNG, up to 10MB</span>
                  <span className="mt-4 rounded-full bg-[#f6f6f6] px-6 py-3 text-sm">Browse Files</span>
                </>
              )}
            </button>
            <p className="my-4 text-center text-sm text-[#858585]">Upload your preferred document or image</p>
            {materialUpload?.status === "failed" && (
              <p className="mb-4 text-center text-sm text-red-600">The background upload failed. Click the upload area to try again.</p>
            )}
            <div className="mb-6">
              <Label htmlFor="dueDate">Due Date</Label>
              <div className="relative">
                <Input
                  id="dueDate"
                  type="date"
                  className="pr-12 text-[#262626] [&::-webkit-calendar-picker-indicator]:hidden"
                  {...form.register("dueDate")}
                  onClick={(e) => {
                    try {
                      if ("showPicker" in HTMLInputElement.prototype) {
                        e.currentTarget.showPicker();
                      }
                    } catch (err) {}
                  }}
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#888]" size={20} />
              </div>
              {form.formState.errors.dueDate && <p className="mt-1 text-xs text-red-600">{form.formState.errors.dueDate.message}</p>}
            </div>
            <Label>Question Type</Label>
            {/* Desktop column headers */}
            <div className="mb-2 hidden items-center gap-3 px-3 md:grid md:grid-cols-[1fr_116px_116px_30px]">
              <span />
              <span className="text-center text-xs text-[#777]">No. of Questions</span>
              <span className="text-center text-xs text-[#777]">Marks</span>
              <span />
            </div>
            <div className="space-y-3">
              {rows.fields.map((row, index) => (
                <div key={row.id} className="grid gap-3 rounded-[4px] border border-[#ececec] bg-[#fafafa] p-3 md:grid-cols-[1fr_116px_116px_30px] md:items-center">
                  <div className="flex items-center gap-2">
                    <div className="relative w-full flex-1">
                      <Controller
                        control={form.control}
                        name={`questionGroups.${index}.type`}
                        render={({ field }) => (
                          <CustomSelect
                            value={field.value}
                            onChange={field.onChange}
                            options={questionTypeSchema.options.map(String)}
                            triggerClassName="h-11"
                            aria-label="Question type"
                          />
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Remove question type"
                      onClick={() => rows.remove(index)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[#999] hover:bg-[#f0f0f0] hover:text-[#555] md:hidden"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <Controller control={form.control} name={`questionGroups.${index}.count`} render={({ field }) => (
                    <NumberStepper label="No. of Questions" hideLabel value={Number(field.value || 0)} onChange={(val) => field.onChange(Number(val))} />
                  )} />
                  <Controller control={form.control} name={`questionGroups.${index}.marks`} render={({ field }) => (
                    <NumberStepper label="Marks" hideLabel value={Number(field.value || 0)} onChange={(val) => field.onChange(Number(val))} />
                  )} />
                  <button
                    type="button"
                    aria-label="Remove question type"
                    onClick={() => rows.remove(index)}
                    className="hidden size-7 items-center justify-center rounded-full text-[#999] hover:bg-[#f0f0f0] hover:text-[#555] md:flex"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row">
              <button type="button" onClick={() => rows.append({ type: "Long Answer Questions", count: 1, marks: 5 })} className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-9 items-center justify-center rounded-full bg-[#252525] text-white"><Plus size={20} /></span> Add Question Type
              </button>
              <div className="text-right text-sm leading-7"><p>Total Questions : {totals.questions}</p><p>Total Marks : {totals.marks}</p></div>
            </div>
            {/* Additional Information — on step 1 */}
            <div className="mt-6">
              <Label htmlFor="instructions">Additional Information (For better output)</Label>
              <div className="relative">
                <Textarea id="instructions" placeholder="e.g. Generate a question paper for 3 hour exam duration..." {...form.register("instructions")} />
                <button
                  type="button"
                  onClick={toggleRecording}
                  title={isRecording ? "Stop recording" : "Start dictation"}
                  className={cn(
                    "absolute bottom-4 right-4 rounded-full p-2 transition-colors",
                    isRecording ? "bg-red-100 text-red-500 animate-pulse" : "text-[#999] hover:bg-gray-100 hover:text-[#555]"
                  )}
                >
                  <Mic size={18} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[1fr_300px]">
            <div className="paper-sheet p-5 md:p-8">
              <h2 className="text-xl font-bold">Generation Preferences</h2>
              <p className="mb-7 mt-1 text-sm text-[#777]">Guide the AI for a more relevant paper</p>
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <div><Label htmlFor="name">Assignment Name</Label><Input id="name" placeholder="Quiz on Electricity" {...form.register("name")} /></div>
                <div><Label htmlFor="subject">Subject</Label><Input id="subject" placeholder="Science" {...form.register("subject")} /></div>
                <div><Label htmlFor="grade">Grade / Class</Label><Input id="grade" placeholder="Grade 8" {...form.register("grade")} /></div>
              </div>
              {(form.formState.errors.name || form.formState.errors.subject || form.formState.errors.grade) && (
                <p className="mb-5 text-sm text-red-600">Name, subject, and class are required.</p>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label>Difficulty Preference</Label>
                  <Controller
                    control={form.control}
                    name="difficultyPreference"
                    render={({ field }) => (
                      <CustomSelect
                        value={field.value}
                        onChange={field.onChange}
                        options={difficultyPreferenceSchema.options.map((item) => item.charAt(0).toUpperCase() + item.slice(1))}
                      />
                    )}
                  />
                </div>
                <div>
                  <Label>Bloom&apos;s Taxonomy Level</Label>
                  <Controller
                    control={form.control}
                    name="bloomsLevel"
                    render={({ field }) => (
                      <CustomSelect
                        value={field.value}
                        onChange={field.onChange}
                        options={bloomLevelSchema.options.map(String)}
                      />
                    )}
                  />
                </div>
                <div>
                  <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
                  <Input id="timeLimit" type="number" min={5} max={360} {...form.register("timeLimit", { valueAsNumber: true })} />
                </div>
              </div>
            </div>
            <aside className="paper-sheet p-5">
              <h3 className="font-bold">Paper Summary</h3>
              <div className="mt-5 space-y-3 text-sm">
                <p className="flex justify-between"><span className="text-[#777]">Subject</span><strong>{form.watch("subject")}</strong></p>
                <p className="flex justify-between"><span className="text-[#777]">Grade</span><strong>{form.watch("grade")}</strong></p>
                <p className="flex justify-between"><span className="text-[#777]">Questions</span><strong>{totals.questions}</strong></p>
                <p className="flex justify-between"><span className="text-[#777]">Total marks</span><strong>{totals.marks}</strong></p>
                <p className="flex justify-between">
                  <span className="text-[#777]">Material</span>
                  <Badge>{materialUpload ? materialUpload.status === "uploaded" ? "Attached" : "Uploading" : "None"}</Badge>
                </p>
              </div>
              <p className="mt-6 flex items-start gap-2 rounded-[8px] bg-[#f7f7f7] p-3 text-xs text-[#666]"><Check className="shrink-0 text-green-600" size={15} /> AI output is validated before it becomes a paper.</p>
            </aside>
          </div>
        )}
        {submitError && <p role="alert" className="mt-4 rounded-[8px] bg-red-50 p-4 text-sm text-red-700">{submitError}</p>}
        {activity && <p className="mt-4 text-center text-sm text-[#555]">{activity}...</p>}
        <div className="mt-6 flex justify-between">
          <Button type="button" variant="secondary" onClick={() => step === 1 ? router.back() : setStep(1)}>
            <ArrowLeft size={17} /> Previous
          </Button>
          {step === 1 ? (
            <Button type="button" onClick={saveAndContinue}>Next <ArrowRight size={17} /></Button>
          ) : (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Preparing..." : "Generate Assessment"} <ArrowRight size={17} />
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
