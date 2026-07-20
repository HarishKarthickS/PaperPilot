import { Router } from "express";
import { z } from "zod";
import { inviteSchema, pdfTemplateSchema, pdfVariantSchema } from "@veda/contracts";
import { requireAuth } from "../middlewares/auth.js";
import {
  acceptInvite,
  createInvite,
  listMembers,
  login,
  logout,
  refreshSession,
  signup,
  updateProfile,
  updateWorkspace,
} from "../services/auth.service.js";
import {
  archiveAssignment,
  createAssignment,
  duplicateAssignment,
  getAssignment,
  getDashboard,
  listAssignments,
  requestPdfExport,
  saveManualRevision,
  startGenerationRun,
} from "../services/assignment.service.js";
import {
  createStudyChatSession,
  getStudyChatFeatures,
  getStudyChatSession,
  listStudyChatSources,
  postStudyChatMessage,
} from "../services/study-chat.service.js";
import { issuePdfAccess, issueSourceFileAccess } from "../services/file.service.js";
import { GenerationRun, PdfExport, SourceDocument } from "../models/index.js";
import { ApiError, asyncHandler } from "../utils/http.js";

export const apiRouter = Router();
function routeParam(request: { params: Record<string, string | string[] | undefined> }, name: string) {
  const value = request.params[name];
  if (!value || Array.isArray(value)) throw new ApiError(400, `Missing ${name}.`);
  return value;
}

apiRouter.post("/auth/signup", asyncHandler(async (request, response) => {
  response.status(201).json(await signup(request.body));
}));
apiRouter.post("/auth/login", asyncHandler(async (request, response) => {
  response.json(await login(request.body));
}));
apiRouter.post("/auth/refresh", asyncHandler(async (request, response) => {
  response.json(await refreshSession(request.cookies?.["veda_refresh"]));
}));
apiRouter.post("/auth/logout", asyncHandler(async (request, response) => {
  await logout(request.cookies?.["veda_refresh"]);
  response.status(204).end();
}));

apiRouter.post("/invites/:token/accept", asyncHandler(async (request, response) => {
  response.status(201).json(await acceptInvite(routeParam(request, "token"), request.body));
}));

apiRouter.use(requireAuth);

apiRouter.get("/session", asyncHandler(async (request, response) => {
  const { User, Workspace } = await import("../models/index.js");
  const [user, workspace] = await Promise.all([
    User.findById(request.auth!.userId).select("name email avatar").lean(),
    Workspace.findById(request.auth!.workspaceId).select("name city").lean(),
  ]);
  response.json({ user, workspace, role: request.auth!.role });
}));
apiRouter.patch("/settings/profile", asyncHandler(async (request, response) => {
  response.json(await updateProfile(request.auth!, request.body));
}));
apiRouter.patch("/settings/workspace", asyncHandler(async (request, response) => {
  response.json(await updateWorkspace(request.auth!, request.body));
}));

apiRouter.post("/invites", asyncHandler(async (request, response) => {
  const values = inviteSchema.parse(request.body);
  response.status(201).json(await createInvite(request.auth!, values));
}));
apiRouter.get("/members", asyncHandler(async (request, response) => {
  response.json(await listMembers(request.auth!.workspaceId));
}));

apiRouter.get("/dashboard", asyncHandler(async (request, response) => {
  response.json(await getDashboard(request.auth!));
}));
apiRouter.get("/activities", asyncHandler(async (request, response) => {
  const { ActivityEvent } = await import("../models/index.js");
  const activities = await ActivityEvent.find({ workspaceId: request.auth!.workspaceId })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("actorId", "name avatar")
    .populate("assignmentId", "name")
    .lean();
  response.json(activities);
}));
apiRouter.get("/assignments", asyncHandler(async (request, response) => {
  response.json(await listAssignments(request.auth!, request.query as Record<string, string>));
}));
apiRouter.post("/assignments", asyncHandler(async (request, response) => {
  response.status(201).json(await createAssignment(request.body, request.auth!));
}));
apiRouter.get("/assignments/:assignmentId", asyncHandler(async (request, response) => {
  response.json(await getAssignment(routeParam(request, "assignmentId"), request.auth!));
}));
apiRouter.delete("/assignments/:assignmentId", asyncHandler(async (request, response) => {
  await archiveAssignment(routeParam(request, "assignmentId"), request.auth!);
  response.status(204).end();
}));
apiRouter.post("/assignments/:assignmentId/duplicate", asyncHandler(async (request, response) => {
  response.status(201).json(await duplicateAssignment(routeParam(request, "assignmentId"), request.auth!));
}));

apiRouter.post("/assignments/:assignmentId/generate", asyncHandler(async (request, response) => {
  response.status(202).json(await startGenerationRun(routeParam(request, "assignmentId"), request.auth!));
}));
apiRouter.post("/assignments/:assignmentId/regenerate-question/:questionId", asyncHandler(async (request, response) => {
  response.status(202).json(
    await startGenerationRun(routeParam(request, "assignmentId"), request.auth!, "regenerated_question", {
      questionId: routeParam(request, "questionId"),
    }),
  );
}));
apiRouter.post("/assignments/:assignmentId/regenerate-section/:sectionId", asyncHandler(async (request, response) => {
  response.status(202).json(
    await startGenerationRun(routeParam(request, "assignmentId"), request.auth!, "regenerated_section", {
      sectionId: routeParam(request, "sectionId"),
    }),
  );
}));
apiRouter.post("/assignments/:assignmentId/rebalance", asyncHandler(async (request, response) => {
  response.status(202).json(await startGenerationRun(routeParam(request, "assignmentId"), request.auth!, "rebalanced"));
}));
apiRouter.post("/assignments/:assignmentId/manual-revision", asyncHandler(async (request, response) => {
  response.status(201).json(await saveManualRevision(routeParam(request, "assignmentId"), request.auth!, request.body));
}));
apiRouter.get("/generation-runs/:runId", asyncHandler(async (request, response) => {
  const run = await GenerationRun.findOne({ _id: routeParam(request, "runId"), workspaceId: request.auth!.workspaceId });
  response.json(run);
}));

apiRouter.get("/features", asyncHandler(async (_request, response) => {
  response.json(getStudyChatFeatures());
}));

apiRouter.get("/study-chat/sources", asyncHandler(async (request, response) => {
  response.json(await listStudyChatSources(request.auth!));
}));
apiRouter.post("/study-chat/sessions", asyncHandler(async (request, response) => {
  const body = z.object({ sourceDocumentId: z.string().min(1) }).parse(request.body);
  response.status(201).json(await createStudyChatSession(request.auth!, body.sourceDocumentId));
}));
apiRouter.get("/study-chat/sessions/:sessionId", asyncHandler(async (request, response) => {
  response.json(await getStudyChatSession(request.auth!, routeParam(request, "sessionId")));
}));
apiRouter.post("/study-chat/sessions/:sessionId/messages", asyncHandler(async (request, response) => {
  const body = z.object({ content: z.string().min(1).max(4000) }).parse(request.body);
  response.status(201).json(await postStudyChatMessage(request.auth!, routeParam(request, "sessionId"), body.content));
}));

apiRouter.get("/assignments/:assignmentId/source", asyncHandler(async (request, response) => {
  const source = await SourceDocument.findOne({
    assignmentId: routeParam(request, "assignmentId"),
    workspaceId: request.auth!.workspaceId,
  }).select("-extractedText");
  response.json(source);
}));
// Poll endpoint: checks whether the UploadThing webhook has already created a SourceDocument
// for a given draft upload (identified by sourceDraftId). The frontend uses this to avoid
// waiting on the browser's CDN response which can hang on mobile/slow networks.
apiRouter.get("/source-documents/pending/:draftId", asyncHandler(async (request, response) => {
  const source = await SourceDocument.findOne({
    sourceDraftId: routeParam(request, "draftId"),
    workspaceId: request.auth!.workspaceId,
    assignmentId: { $exists: false },
  }).select("_id sourceDraftId fileName fileSize extractionStatus").lean();
  response.json(source ?? null);
}));
apiRouter.get("/files/:fileId/access", asyncHandler(async (request, response) => {
  response.json(await issueSourceFileAccess(routeParam(request, "fileId"), request.auth!.workspaceId));
}));

apiRouter.post("/assignments/:assignmentId/exports", asyncHandler(async (request, response) => {
  const selection = z.object({ variant: pdfVariantSchema, template: pdfTemplateSchema }).parse(request.body);
  response.status(202).json(
    await requestPdfExport(routeParam(request, "assignmentId"), request.auth!, selection.variant, selection.template),
  );
}));
apiRouter.get("/assignments/:assignmentId/exports", asyncHandler(async (request, response) => {
  response.json(
    await PdfExport.find({
      assignmentId: routeParam(request, "assignmentId"),
      workspaceId: request.auth!.workspaceId,
    }).sort({ createdAt: -1 }),
  );
}));
apiRouter.get("/assignments/:assignmentId/exports/:exportId/access", asyncHandler(async (request, response) => {
  response.json(
    await issuePdfAccess(routeParam(request, "exportId"), routeParam(request, "assignmentId"), request.auth!.workspaceId),
  );
}));
