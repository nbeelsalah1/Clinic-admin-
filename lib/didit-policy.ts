export const SANDBOX_WORKFLOW_ID = "39d45176-d0b3-4366-8d46-f07a10627970";
export const DIDIT_BASE_URL = "https://verification.didit.me/v3";
export const SITE_ORIGIN = "https://clinic-ops-palestine.nbeelsalah4.chatgpt.site";
const statuses = new Set(["Not Started", "In Progress", "In Review", "Approved", "Declined", "Expired", "Abandoned", "Kyc Expired", "Resubmitted", "Awaiting User", "Not Finished"]);
export function safeStatus(value: unknown): string {
  return typeof value === "string" && statuses.has(value) ? value : "Not Started";
}
export function safeSessionUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "verify.didit.me" && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
function checkStatus(value: unknown): string {
  const reports = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  // Never infer a passed check from the aggregate decision or an omitted report.
  if (!reports.length) return "Not Started";
  const states = reports.map(report => safeStatus((report as Record<string, unknown>)?.status));
  if (states.every(status => status === "Approved")) return "Approved";
  if (states.includes("Declined")) return "Declined";
  if (states.includes("In Review")) return "In Review";
  return states.at(-1) ?? "Not Started";
}
export function decisionStatuses(value: Record<string, unknown>) {
  const result = value.decision && typeof value.decision === "object" ? value.decision as Record<string, unknown> : value;
  return {
    status: safeStatus(value.status ?? result.status),
    documentStatus: checkStatus(result.id_verifications),
    phoneStatus: checkStatus(result.phone_verifications ?? result.phone),
  };
}
export function isVerified(environment: string, status: string, documentStatus: string, phoneStatus: string) {
  return environment === "live" && status === "Approved" && documentStatus === "Approved" && phoneStatus === "Approved";
}
export function canResume(status: string, createdAt: string) {
  return ["Not Started", "In Progress", "In Review", "Resubmitted", "Awaiting User"].includes(status)
    && Date.now() - Date.parse(createdAt.replace(" ", "T") + (createdAt.endsWith("Z") ? "" : "Z")) < 86400000;
}
