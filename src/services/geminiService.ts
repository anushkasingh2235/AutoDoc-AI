import axios from "axios";
import { AnalysisResult, SecurityAuditResult } from "../types";

export async function analyzeCode(code: string, fileName: string): Promise<AnalysisResult> {
  console.log(`[Client] Requesting analysis for ${fileName}...`);
  try {
    const response = await axios.post("/api/gemini/analyze", { code, fileName });
    return response.data;
  } catch (error: any) {
    console.error("[Client] Analysis error:", error);
    const msg = error.response?.data?.error || error.message;
    if (msg?.includes('429')) {
      throw new Error("AI Quota Exceeded: The analysis limit has been reached. Please wait a moment and try again.");
    }
    throw new Error(msg || "Failed to analyze code");
  }
}

export async function performSecurityAudit(code: string, fileName?: string): Promise<SecurityAuditResult> {
  console.log("[Client] Requesting security audit...");
  try {
    const response = await axios.post("/api/gemini/security", { code, fileName });
    return response.data;
  } catch (error: any) {
    console.error("[Client] Security audit error:", error);
    const msg = error.response?.data?.error || error.message;
    if (msg?.includes('429')) {
      throw new Error("AI Quota Exceeded: The security audit limit has been reached. Please wait a moment and try again.");
    }
    throw new Error(msg || "Failed to perform security audit");
  }
}

export async function chatWithCode(question: string, context: string, chatHistory: any[] = []): Promise<string> {
  console.log("[Client] Sending chat question...");
  try {
    const response = await axios.post("/api/gemini/chat", { question, context, chatHistory });
    return response.data.text;
  } catch (error: any) {
    console.error("[Client] Chat error:", error);
    const msg = error.response?.data?.error || error.message;
    if (msg?.includes('429')) {
      return "AI Quota Exceeded: You've reached the temporary limit for Gemini API requests. Please wait a minute before trying again.";
    }
    return `Error: ${msg || "Failed to chat"}`;
  }
}

// Advanced custom SaaS APIs

export interface SemanticSearchResult {
  path: string;
  score: number;
  reason: string;
  highlight?: string;
}

export async function semanticSearch(query: string, files: Array<{ path: string; content: string }>): Promise<SemanticSearchResult[]> {
  console.log(`[Client] Performing semantic search for query: "${query}"`);
  try {
    const optimizedFiles = files.map(f => ({
      path: f.path,
      content: f.content ? f.content.substring(0, 400) : "",
      size: f.content ? f.content.length : 0
    }));
    const response = await axios.post("/api/gemini/semantic-search", { query, files: optimizedFiles });
    return response.data;
  } catch (error: any) {
    console.error("[Client] Semantic search error:", error);
    throw new Error(error.response?.data?.error || "Failed to perform semantic search");
  }
}

export interface ArchitectureProfile {
  pattern: string;
  feTech: string;
  beTech: string;
  database: string;
  explanation: string;
  mermaidDiagram: string;
  insights: string[];
}

export async function detectArchitecture(files: Array<{ path: string; content: string }>): Promise<ArchitectureProfile> {
  console.log("[Client] Detecting repository architecture...");
  try {
    const optimizedFiles = files.map(f => ({
      path: f.path,
      content: f.content ? f.content.substring(0, 300) : "",
      size: f.content ? f.content.length : 0
    }));
    const response = await axios.post("/api/gemini/architecture", { files: optimizedFiles });
    return response.data;
  } catch (error: any) {
    console.error("[Client] Architecture detection error:", error);
    throw new Error(error.response?.data?.error || "Failed to analyze architecture");
  }
}

export interface ProjectHealthProfile {
  totalFiles: number;
  totalLines: number;
  languages: Array<{ name: string; percentage: number }>;
  largestModules: Array<{ path: string; size: string }>;
  complexityRating: string;
  documentationScore: number;
  securityScore: number;
  duplicateCodePercentage: number;
  warnings: string;
  recommendations: string[];
}

export async function fetchProjectHealth(files: Array<{ path: string; content: string }>): Promise<ProjectHealthProfile> {
  console.log("[Client] Fetching project health...");
  try {
    const optimizedFiles = files.map(f => ({
      path: f.path,
      content: f.content ? f.content.substring(0, 200) : "",
      size: f.content ? f.content.length : 0,
      lineCount: f.content ? f.content.split('\n').length : 0
    }));
    const response = await axios.post("/api/gemini/health", { files: optimizedFiles });
    return response.data;
  } catch (error: any) {
    console.error("[Client] Health fetch error:", error);
    throw new Error(error.response?.data?.error || "Failed to analyze project health");
  }
}

export interface VersionCompareResult {
  summary: string;
  changedLines: string;
  architectureShifts: string;
  apiChanges: string[];
  securityImpact: string;
}

export async function compareCodeVersions(originalVersion: string, currentVersion: string): Promise<VersionCompareResult> {
  console.log("[Client] Comparing code versions...");
  try {
    const response = await axios.post("/api/gemini/version-compare", { originalVersion, currentVersion });
    return response.data;
  } catch (error: any) {
    console.error("[Client] Version compare error:", error);
    throw new Error(error.response?.data?.error || "Failed to compare versions");
  }
}
