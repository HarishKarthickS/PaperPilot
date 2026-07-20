import {
  difficultyPreferenceSchema,
  generationStatusSchema,
  pdfTemplateSchema,
  pdfVariantSchema,
  revisionOriginSchema,
  workspaceRoleSchema,
} from "@veda/contracts";
import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const roleValues = workspaceRoleSchema.options;
const generationStatuses = generationStatusSchema.options;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    avatar: { type: String },
  },
  { timestamps: true },
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const membershipSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: roleValues, required: true },
  },
  { timestamps: true },
);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

const inviteSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    email: { type: String, lowercase: true, trim: true },
    role: { type: String, enum: roleValues, default: "TEACHER" },
    tokenHash: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: Date,
  },
  { timestamps: true },
);

const refreshSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true },
);

const questionGroupSchema = new Schema(
  {
    type: { type: String, required: true },
    count: { type: Number, required: true },
    marks: { type: Number, required: true },
  },
  { _id: false },
);

const assignmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    subject: { type: String, required: true },
    grade: { type: String, required: true },
    dueDate: { type: Date, required: true },
    timeLimit: { type: Number, required: true },
    questionGroups: { type: [questionGroupSchema], required: true },
    difficultyPreference: { type: String, enum: difficultyPreferenceSchema.options, required: true },
    bloomsLevel: { type: String, required: true },
    instructions: { type: String, default: "" },
    totalQuestions: { type: Number, required: true },
    totalMarks: { type: Number, required: true },
    currentRevisionId: { type: Schema.Types.ObjectId, ref: "AssessmentRevision" },
    sourceDocumentId: { type: Schema.Types.ObjectId, ref: "SourceDocument" },
    status: { type: String, enum: generationStatuses, default: "queued" },
    archivedAt: Date,
  },
  { timestamps: true },
);

const sourceDocumentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", index: true },
    sourceDraftId: { type: String, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fileKey: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    extractionStatus: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
    },
    extractedText: String,
    extractionError: String,
    ragIndexStatus: {
      type: String,
      enum: ["idle", "queued", "processing", "completed", "failed"],
      default: "idle",
    },
    ragIndexedAt: Date,
    ragIndexError: String,
  },
  { timestamps: true },
);
sourceDocumentSchema.index({ workspaceId: 1, uploadedBy: 1, sourceDraftId: 1 });

const studyChatSessionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    sourceDocumentId: { type: Schema.Types.ObjectId, ref: "SourceDocument", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
  },
  { timestamps: true },
);

const studyChatCitationSchema = new Schema(
  {
    chunkIndex: { type: Number, required: true },
    snippet: { type: String, required: true },
  },
  { _id: false },
);

const studyChatMessageSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "StudyChatSession", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    citations: { type: [studyChatCitationSchema], default: [] },
    groundingStatus: {
      type: String,
      enum: ["verified", "verified_after_retry", "rejected"],
      required: false,
    },
    retryCount: { type: Number, min: 0, max: 1, required: false },
    latencyMs: { type: Number, min: 0, required: false },
  },
  { timestamps: true },
);

const generatedQuestionSchema = new Schema(
  {
    questionText: { type: String, required: true },
    type: { type: String, required: true },
    difficulty: { type: String, required: true },
    marks: { type: Number, required: true },
    options: { type: [String], default: [] },
    bloomsLevel: { type: String, required: true },
    answerKey: { type: String, required: true },
    estimatedTime: { type: String, required: true },
    confidenceScore: { type: Number, required: true },
    generationRationale: { type: String, required: true },
  },
  { _id: true },
);

const sectionSchema = new Schema(
  {
    title: { type: String, required: true },
    instruction: { type: String, required: true },
    questions: { type: [generatedQuestionSchema], required: true },
  },
  { _id: true },
);

const assessmentRevisionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    version: { type: Number, required: true },
    origin: { type: String, enum: revisionOriginSchema.options, required: true },
    sections: { type: [sectionSchema], required: true },
    generatedByModel: String,
    sourceRunId: { type: Schema.Types.ObjectId, ref: "GenerationRun" },
  },
  { timestamps: true },
);
assessmentRevisionSchema.index({ assignmentId: 1, version: 1 }, { unique: true });

const generationRunSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    targetQuestionId: String,
    targetSectionId: String,
    idempotencyKey: { type: String, required: true, unique: true },
    status: { type: String, enum: generationStatuses, default: "queued" },
    progress: { type: Number, default: 0 },
    message: { type: String, default: "Queued for generation" },
    error: String,
    revisionId: { type: Schema.Types.ObjectId, ref: "AssessmentRevision" },
  },
  { timestamps: true },
);

const pdfExportSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    revisionId: { type: Schema.Types.ObjectId, ref: "AssessmentRevision", required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    variant: { type: String, enum: pdfVariantSchema.options, required: true },
    template: { type: String, enum: pdfTemplateSchema.options, required: true },
    status: { type: String, enum: ["queued", "processing", "completed", "failed"], default: "queued" },
    fileKey: String,
    fileName: String,
    error: String,
  },
  { timestamps: true },
);

const activityEventSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment" },
    action: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

function registeredModel(name: string, schema: Schema): Model<any> {
  return (mongoose.models[name] as Model<any> | undefined) || model<any>(name, schema);
}

export const User = registeredModel("User", userSchema);
export const Workspace = registeredModel("Workspace", workspaceSchema);
export const Membership = registeredModel("Membership", membershipSchema);
export const Invite = registeredModel("Invite", inviteSchema);
export const RefreshSession = registeredModel("RefreshSession", refreshSessionSchema);
export const Assignment = registeredModel("Assignment", assignmentSchema);
export const SourceDocument = registeredModel("SourceDocument", sourceDocumentSchema);
export const AssessmentRevision = registeredModel("AssessmentRevision", assessmentRevisionSchema);
export const GenerationRun = registeredModel("GenerationRun", generationRunSchema);
export const PdfExport = registeredModel("PdfExport", pdfExportSchema);
export const ActivityEvent = registeredModel("ActivityEvent", activityEventSchema);
export const StudyChatSession = registeredModel("StudyChatSession", studyChatSessionSchema);
export const StudyChatMessage = registeredModel("StudyChatMessage", studyChatMessageSchema);

export type UserRecord = InferSchemaType<typeof userSchema>;
