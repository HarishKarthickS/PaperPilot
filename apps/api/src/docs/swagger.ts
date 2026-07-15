export const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "PaperPilot API",
    version: "1.0.0",
    description: "Teacher assessment generation, revision and export API.",
  },
  paths: {
    "/health": { get: { summary: "Service health", responses: { "200": { description: "Healthy" } } } },
    "/api/auth/signup": { post: { summary: "Create an administrator and workspace", responses: { "201": { description: "Created" } } } },
    "/api/assignments": {
      get: { summary: "List workspace assessments", responses: { "200": { description: "Assessments" } } },
      post: { summary: "Create assessment configuration", responses: { "201": { description: "Created" } } },
    },
    "/api/assignments/{assignmentId}/generate": {
      post: { summary: "Queue AI paper generation", responses: { "202": { description: "Queued" } } },
    },
  },
};
