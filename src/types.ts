export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
}

export interface AnalysisResult {
  summary: string;
  functions: {
    name: string;
    description: string;
    parameters: string[];
    returns: string;
  }[];
  dependencies: string[];
  improvements: string[];
  getting_started: string;
  diagram: string;
}

export interface ProjectData {
  id: string;
  name: string;
  files: FileNode[];
  analysis?: AnalysisResult;
  securityAudit?: SecurityAuditResult;
}

export interface SecurityAuditResult {
  issues: {
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
  }[];
  overallSeverity: string;
}
