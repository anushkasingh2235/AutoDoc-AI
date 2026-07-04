import React, { useState, useCallback, useEffect } from 'react';
import { 
  Upload, Github, FileCode, BookOpen, ShieldCheck, MessageSquare, Layout, 
  Loader2, ChevronRight, Search, Bot, LogOut, User as UserIcon, Mail, Lock, 
  UserPlus, BarChart, Activity, Workflow, Code, CheckCircle, AlertTriangle, 
  Play, HelpCircle, FileText, GitCompare, ChevronDown, Eye, EyeOff
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ScrollArea } from './components/ui/scroll-area';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { Skeleton } from './components/ui/skeleton';
import { FileTree } from './components/FileTree';
import { DiagramRenderer } from './components/DiagramRenderer';
import { ChatSidebar } from './components/ChatSidebar';
import { buildFileTree } from './lib/fileUtils';
import { 
  analyzeCode, performSecurityAudit, semanticSearch, detectArchitecture, 
  fetchProjectHealth, compareCodeVersions, ArchitectureProfile, ProjectHealthProfile, 
  VersionCompareResult, SemanticSearchResult 
} from './services/geminiService';
import { ProjectData, FileNode, AnalysisResult, SecurityAuditResult } from './types';
import { cn } from './lib/utils';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  signInWithPopup,
  updateProfile,
  User
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Helper to resolve relative path imports dynamically
function resolveRelativePath(currentPath: string, relativePath: string, allPaths: string[]): string | null {
  const currentDirParts = currentPath.split('/');
  currentDirParts.pop(); // Remove file name
  const relParts = relativePath.split('/');
  for (const part of relParts) {
    if (part === '.' || !part) continue;
    if (part === '..') {
      currentDirParts.pop();
    } else {
      currentDirParts.push(part);
    }
  }
  const resolvedJoined = currentDirParts.join('/');
  const candidates = [
    resolvedJoined,
    resolvedJoined + '.ts',
    resolvedJoined + '.tsx',
    resolvedJoined + '.js',
    resolvedJoined + '.jsx',
  ];
  return allPaths.find(p => candidates.includes(p) || p.endsWith('/' + resolvedJoined)) || null;
}

// AST-like dependency parser
function parseDependencies(flatFiles: Array<{ path: string; content: string }>) {
  const nodes = flatFiles
    .filter(f => f.path.match(/\.(ts|tsx|js|jsx)$/))
    .map(f => ({ id: f.path, name: f.path.split('/').pop() || f.path }));
  const links: Array<{ source: string; target: string }> = [];
  const allPaths = flatFiles.map(f => f.path);

  flatFiles.forEach(file => {
    if (!file.content) return;
    const importRegex = /(?:import|from|require)\s*\(?\s*['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(file.content)) !== null) {
      const resolved = resolveRelativePath(file.path, match[1], allPaths);
      if (resolved && resolved !== file.path) {
        links.push({ source: file.path, target: resolved });
      }
    }
  });
  return { nodes, links };
}

export default function App() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [user, setUser] = useState<any>({ uid: 'demo-user', email: 'demo@autodocai.com', displayName: 'Workspace Developer' });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [activeTab, setActiveTab] = useState('docs');
  const [searchQuery, setSearchQuery] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [chatSidebarWidth, setChatSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingChat, setIsResizingChat] = useState(false);
  
  // Advanced Navigation Rail State
  const [currentWorkspaceView, setCurrentWorkspaceView] = useState<'explorer' | 'architecture' | 'search' | 'compare'>('explorer');

  // Multi-file repository indices & metadata
  const [flatFiles, setFlatFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [dependencyGraph, setDependencyGraph] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);

  // Gemini SaaS States
  const [isArchLoading, setIsArchLoading] = useState(false);
  const [archProfile, setArchProfile] = useState<ArchitectureProfile | null>(null);

  const [semanticQuery, setSemanticQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState<SemanticSearchResult | null>(null);

  // Code modifications snapshot comparison state (RAG / Compare)
  const [activeCodeText, setActiveCodeText] = useState('');
  const [originalCodeText, setOriginalCodeText] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [compareReport, setCompareReport] = useState<VersionCompareResult | null>(null);

  // Store analysis results per file path
  const [fileAnalyses, setFileAnalyses] = useState<Record<string, { analysis: AnalysisResult; security: SecurityAuditResult }>>({});

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSignOut = () => {
    setProject(null);
    setSelectedFile(null);
    setFlatFiles([]);
    setArchProfile(null);
  };

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    setIsResizingChat(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth > 150 && newWidth < 600) {
        setSidebarWidth(newWidth);
      }
    } else if (isResizingChat) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < 800) {
        setChatSidebarWidth(newWidth);
      }
    }
  }, [isResizing, isResizingChat]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  // Handle repository-wide AI generation of health and architecture profile
  const executeRepoAnalysis = async (files: Array<{ path: string; content: string }>) => {
    setIsArchLoading(true);
    try {
      // Calculate dependency links locally
      const graph = parseDependencies(files);
      setDependencyGraph(graph);

      // Async fetch architecture
      const arch = await detectArchitecture(files);
      setArchProfile(arch);
    } catch (e) {
      console.error("Failed repository metrics analysis:", e);
    } finally {
      setIsArchLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/upload', formData);
      const rawFiles = response.data.files;
      setFlatFiles(rawFiles);
      
      const fileTree = buildFileTree(rawFiles);
      setProject({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name.replace('.zip', ''),
        files: fileTree
      });
      setFileAnalyses({});
      setSelectedFile(null);
      setCurrentWorkspaceView('explorer');

      // Trigger indexing & AI metrics
      executeRepoAnalysis(rawFiles);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload ZIP file. Please ensure it is a valid ZIP archive.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGithubConnect = async () => {
    const trimmedUrl = githubUrl.trim();
    if (!trimmedUrl) return;
    
    setIsGithubLoading(true);
    try {
      const response = await axios.post('/api/github', { url: trimmedUrl });
      const rawFiles = response.data.files;
      setFlatFiles(rawFiles);

      const fileTree = buildFileTree(rawFiles);
      setProject({
        id: Math.random().toString(36).substr(2, 9),
        name: response.data.name || "GitHub Repo",
        files: fileTree
      });
      setFileAnalyses({});
      setSelectedFile(null);
      setCurrentWorkspaceView('explorer');

      executeRepoAnalysis(rawFiles);
    } catch (error: any) {
      console.error("GitHub import failed:", error);
      const responseData = error.response?.data;
      let errorMsg = "";
      if (responseData) {
        if (typeof responseData === 'string') {
          if (responseData.includes('<!DOCTYPE html>') || responseData.includes('<html>')) {
            errorMsg = `Server error (status code: ${error.response.status}). The server might be starting up or having issues.`;
          } else {
            errorMsg = responseData;
          }
        } else if (typeof responseData === 'object') {
          const innerError = responseData.error || responseData.message;
          if (typeof innerError === 'object' && innerError !== null) {
            errorMsg = innerError.message || JSON.stringify(innerError);
          } else {
            errorMsg = innerError || JSON.stringify(responseData);
          }
        }
      }
      alert(errorMsg || error.message || "Failed to connect to GitHub repository.");
    } finally {
      setIsGithubLoading(false);
    }
  };

  const startAnalysis = async () => {
    if (!project || !selectedFile || !selectedFile.content) return;

    setIsAnalyzing(true);
    try {
      const [analysis, security] = await Promise.all([
        analyzeCode(selectedFile.content, selectedFile.name),
        performSecurityAudit(selectedFile.content, selectedFile.name)
      ]);
      setFileAnalyses(prev => ({
        ...prev,
        [selectedFile.path]: { analysis, security }
      }));
    } catch (error: any) {
      console.error("Analysis failed:", error);
      alert(error.message || "Failed to analyze the file.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Perform Semantic search on top of backend RAG simulator
  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!semanticQuery.trim() || flatFiles.length === 0) return;
    setIsSearching(true);
    try {
      const results = await semanticSearch(semanticQuery.trim(), flatFiles);
      setSearchResults(results);
    } catch (err: any) {
      alert("Semantic search failed. Try again.");
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-navigate to file tree node from search or dependency clicks
  const navigateToLocalFile = (path: string) => {
    const findNodeInTree = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.path === path) return node;
        if (node.children) {
          const res = findNodeInTree(node.children);
          if (res) return res;
        }
      }
      return null;
    };
    const node = findNodeInTree(project?.files || []);
    if (node) {
      setSelectedFile(node);
      setCurrentWorkspaceView('explorer');
      setActiveTab('code'); // Select code view tab
      setOriginalCodeText(node.content || '');
      setActiveCodeText(node.content || '');
      setCompareReport(null);
    }
  };

  // Trigger Gemini dynamic code compare
  const triggerCodeComparison = async () => {
    if (!originalCodeText || !activeCodeText) return;
    setIsComparing(true);
    try {
      const result = await compareCodeVersions(originalCodeText, activeCodeText);
      setCompareReport(result);
    } catch (err: any) {
      alert("Failed to generate version comparisons.");
    } finally {
      setIsComparing(false);
    }
  };

  const currentAnalysis = selectedFile ? fileAnalyses[selectedFile.path] : null;

  const renderContent = () => {
    if (!project) {
      // Landing: Upload ZIP or Select Repo
      return (
        <div className="flex flex-col items-center justify-center min-h-[85vh] p-6 text-center select-none">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="max-w-2xl w-full space-y-12"
          >
            <div className="space-y-4">
              <Badge variant="outline" className="px-4 py-1 border-primary/30 text-primary bg-primary/10 mb-4 animate-pulse shadow-[0_0_15px_rgba(0,242,255,0.3)] font-mono">
                ✦ NEXT-GEN SAAS TECHNICAL IDE WORKSPACE
              </Badge>
              <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                AutoDoc <span className="text-foreground">AI</span>
              </h1>
              <p className="text-muted-foreground text-lg max-w-lg mx-auto leading-relaxed">
                Connect your codebase locally or via public GitHub. Let AI map, search, visually link, and audit the entire system directory structure in seconds.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
              <Card className="relative overflow-hidden group border-primary/10 bg-card/40 backdrop-blur-xl hover:border-primary/30 transition-all h-full flex flex-col items-center p-6 rounded-[2rem] border">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <CardHeader className="text-center p-0 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-all border border-primary/5">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-bold tracking-tight mb-1 text-foreground">Upload ZIP</CardTitle>
                  <CardDescription className="text-xs leading-relaxed max-w-[200px] mx-auto font-medium text-muted-foreground/60">Analyze local zip codebases instantly.</CardDescription>
                </CardHeader>
                <CardContent className="w-full p-0">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept=".zip" 
                    className="hidden" 
                    onChange={handleFileUpload}
                  />
                  <Button 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-xl active:scale-95 transition-all" 
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    {isUploading ? "Processing..." : "Select ZIP Archive"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden group border-secondary/10 bg-card/40 backdrop-blur-xl hover:border-secondary/30 transition-all h-full flex flex-col items-center p-6 rounded-[2rem] border">
                <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <CardHeader className="text-center p-0 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-secondary/5 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-all border border-secondary/5">
                    <Github className="w-6 h-6 text-secondary" />
                  </div>
                  <CardTitle className="text-xl font-bold tracking-tight mb-1 text-foreground">GitHub Repo</CardTitle>
                  <CardDescription className="text-xs leading-relaxed max-w-[200px] mx-auto font-medium text-muted-foreground/60">Import directly from any public repo.</CardDescription>
                </CardHeader>
                <CardContent className="w-full p-0 space-y-3">
                  <form 
                    onSubmit={(e) => { e.preventDefault(); handleGithubConnect(); }}
                    className="space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                        <Input 
                          placeholder="https://github.com/user/repo" 
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          className="bg-background/40 border-secondary/15 h-12 pl-10 text-sm focus:border-secondary rounded-xl font-medium"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button 
                          type="button"
                          onClick={() => setGithubUrl('https://github.com/facebook/react')}
                          className="text-[10px] font-bold text-secondary/55 hover:text-secondary hover:underline transition-colors"
                        >
                          Try example repository: facebook/react
                        </button>
                      </div>
                    </div>
                    <Button 
                      type="submit"
                      variant="outline" 
                      className="w-full h-12 border-secondary/20 hover:bg-secondary/5 text-secondary font-bold text-sm rounded-xl active:scale-95 transition-all" 
                      disabled={isGithubLoading || !githubUrl.trim()}
                    >
                      {isGithubLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Github className="w-4 h-4 mr-2" />}
                      {isGithubLoading ? "Connecting..." : "Connect Repository"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </div>
      );
    }

    // Main authenticated full SaaS workspace
    return (
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
        
        {/* Workspace Vertical Navigation Rail */}
        <div className="w-16 border-r bg-card/45 flex flex-col items-center py-4 justify-between shrink-0 select-none z-30">
          <div className="flex flex-col gap-5 items-center w-full">
            <button 
              onClick={() => setCurrentWorkspaceView('architecture')}
              className={cn(
                "p-3 rounded-xl transition-all relative group",
                currentWorkspaceView === 'architecture' ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              title="Architect & Dependency Graph"
            >
              <Workflow className="w-5 h-5" />
              <span className="absolute left-16 bg-popover text-popover-foreground text-[10px] font-bold px-2 py-1 rounded shadow-md pointer-events-none group-hover:opacity-100 opacity-0 transition-opacity z-50 whitespace-nowrap">Dependency Graph</span>
            </button>

            <button 
              onClick={() => setCurrentWorkspaceView('explorer')}
              className={cn(
                "p-3 rounded-xl transition-all relative group",
                currentWorkspaceView === 'explorer' ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              title="File Documentation Explorer"
            >
              <FileCode className="w-5 h-5" />
              <span className="absolute left-16 bg-popover text-popover-foreground text-[10px] font-bold px-2 py-1 rounded shadow-md pointer-events-none group-hover:opacity-100 opacity-0 transition-opacity z-50 whitespace-nowrap">File Explorer</span>
            </button>

            <button 
              onClick={() => setCurrentWorkspaceView('search')}
              className={cn(
                "p-3 rounded-xl transition-all relative group",
                currentWorkspaceView === 'search' ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              title="Semantic AI Search (RAG)"
            >
              <Search className="w-5 h-5" />
              <span className="absolute left-16 bg-popover text-popover-foreground text-[10px] font-bold px-2 py-1 rounded shadow-md pointer-events-none group-hover:opacity-100 opacity-0 transition-opacity z-50 whitespace-nowrap">Semantic Search</span>
            </button>

            <button 
              onClick={() => {
                if (selectedFile) {
                  setOriginalCodeText(selectedFile.content || '');
                  setActiveCodeText(selectedFile.content || '');
                  setCompareReport(null);
                }
                setCurrentWorkspaceView('compare');
              }}
              className={cn(
                "p-3 rounded-xl transition-all relative group",
                currentWorkspaceView === 'compare' ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              title="Version Comparison Sandbox"
            >
              <GitCompare className="w-5 h-5" />
              <span className="absolute left-16 bg-popover text-popover-foreground text-[10px] font-bold px-2 py-1 rounded shadow-md pointer-events-none group-hover:opacity-100 opacity-0 transition-opacity z-50 whitespace-nowrap">Compare Editions</span>
            </button>
          </div>

          <div className="flex flex-col gap-4 items-center">
            <button 
              onClick={() => { setProject(null); setSelectedFile(null); }}
              className="p-3 text-muted-foreground hover:text-primary transition-colors hover:bg-accent/50 rounded-xl"
              title="Close Repo"
            >
              <FolderIcon className="w-5 h-5" />
            </button>
          </div>
        </div>



        {/* View 2: DYNAMIC DEPENDENCY VISUALIZATION / ARCHITECTURE VIEW */}
        {currentWorkspaceView === 'architecture' && (
          <div className="flex-1 flex flex-col md:flex-row bg-[#08080f] overflow-hidden select-none">
            
            {/* Visual AST canvas (Center Interactive Workspace) */}
            <div className="flex-1 flex flex-col p-6 min-h-0 relative border-r border-primary/5">
              <div className="mb-6">
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                  <Workflow className="w-6 h-6 text-primary" />
                  Interactive Dependency Mesh
                </h1>
                <p className="text-xs text-muted-foreground">A static imports parser mapping modules and connections cleanly.</p>
              </div>

              {dependencyGraph.nodes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="text-sm text-muted-foreground/60 italic max-w-xs">No TS/JS modules identified. Upload repository files containing standard paths to map links.</p>
                </div>
              ) : (
                <div className="flex-1 bg-background/45 border rounded-2xl p-4 flex flex-col items-center justify-center relative min-h-[300px]">
                  
                  {/* Floating coordinate dynamic coordinates of nodes mock (Interactive SVG UI representation of map) */}
                  <svg className="w-full h-full min-h-[400px]" viewBox="0 0 800 500">
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="15" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(129,140,248,0.4)" />
                      </marker>
                    </defs>

                    {/* Link paths */}
                    {dependencyGraph.links.map((link, lIdx) => {
                      const srcIdx = dependencyGraph.nodes.findIndex(n => n.id === link.source);
                      const dstIdx = dependencyGraph.nodes.findIndex(n => n.id === link.target);
                      if (srcIdx === -1 || dstIdx === -1) return null;
                      
                      const angleSrc = (srcIdx / dependencyGraph.nodes.length) * 2 * Math.PI;
                      const angleDst = (dstIdx / dependencyGraph.nodes.length) * 2 * Math.PI;
                      
                      const sx = 400 + Math.cos(angleSrc) * 160;
                      const sy = 250 + Math.sin(angleSrc) * 160;
                      const dx = 400 + Math.cos(angleDst) * 160;
                      const dy = 250 + Math.sin(angleDst) * 160;

                      const isHighlighted = selectedGraphNode === link.source || selectedGraphNode === link.target;

                      return (
                        <path 
                          key={lIdx}
                          d={`M ${sx} ${sy} Q ${(sx + dx)/2} ${(sy + dy)/2 - 30} ${dx} ${dy}`}
                          fill="none" 
                          stroke={isHighlighted ? "#818cf8" : "rgba(255,255,255,0.06)"}
                          strokeWidth={isHighlighted ? 2.5 : 1}
                          markerEnd="url(#arrow)"
                          className="transition-all"
                        />
                      );
                    })}

                    {/* Nodes group */}
                    {dependencyGraph.nodes.map((n, idx) => {
                      const angle = (idx / dependencyGraph.nodes.length) * 2 * Math.PI;
                      const x = 400 + Math.cos(angle) * 180;
                      const y = 250 + Math.sin(angle) * 180;
                      const isSelected = selectedGraphNode === n.id;

                      return (
                        <g 
                          key={n.id} 
                          className="cursor-pointer group"
                          onClick={() => {
                            setSelectedGraphNode(n.id);
                          }}
                          onDoubleClick={() => navigateToLocalFile(n.id)}
                        >
                          <circle 
                            cx={x} 
                            cy={y} 
                            r={isSelected ? 10 : 7} 
                            className={cn(
                              "fill-card stroke-primary/30 stroke-2 hover:fill-primary max-w-full hover:scale-110 transition-all shadow-[0_0_15px_rgba(56,189,248,0.35)]",
                              isSelected && "fill-primary stroke-white stroke-3"
                            )}
                          />
                          <text 
                            x={x + 12} 
                            y={y + 4} 
                            className={cn(
                              "text-[10px] font-medium opacity-60 fill-muted-foreground select-none group-hover:opacity-100 group-hover:fill-foreground font-mono transition-all",
                              isSelected && "opacity-100 fill-primary font-bold"
                            )}
                          >
                            {n.name}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="absolute bottom-4 left-4 text-[10px] font-mono opacity-50 space-y-1">
                    <p>💡 Tip: Click node circle to list imports. Double-click to expand in file-explorer.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Architecture breakdown summary (Right Side-panel panel) */}
            <div className="w-full md:w-80 p-5 bg-card/25 shrink-0 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 mb-2">Architect Profile</h3>
                  <Badge variant="outline" className="border-secondary/20 text-secondary bg-secondary/5 mb-4">Gemini Analyzer</Badge>
                </div>

                {isArchLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : archProfile ? (
                  <div className="space-y-6 animate-fade-in-right">
                    
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block font-mono">Structural Pattern</span>
                      <p className="text-sm font-semibold text-foreground mt-1">{archProfile.pattern}</p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block font-mono">Tech Stack Composition</span>
                      <p className="text-xs font-medium text-foreground mt-1">FE: {archProfile.feTech}</p>
                      <p className="text-xs font-medium text-foreground mt-0.5">BE: {archProfile.beTech}</p>
                      <p className="text-xs font-medium text-foreground mt-0.5">DB: {archProfile.database}</p>
                    </div>

                    <div className="border-t border-primary/5 pt-4 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block font-mono">Core Architectural Flow</span>
                      <p className="text-xs leading-relaxed text-muted-foreground/85 font-medium">{archProfile.explanation}</p>
                    </div>

                    <div className="border-t border-primary/5 pt-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block font-mono mb-2">Systems Overview Diagram</span>
                      {archProfile.mermaidDiagram ? (
                        <div className="p-1.5 border border-primary/5 bg-background rounded-lg scale-[0.85] origin-top-left overflow-auto max-h-[160px]">
                          <DiagramRenderer code={archProfile.mermaidDiagram} />
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No systems diagram generated.</p>
                      )}
                    </div>

                    <div className="border-t border-primary/5 pt-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block font-mono mb-2">Developer Insights</span>
                      <ul className="text-xs text-muted-foreground/80 leading-relaxed space-y-2 pl-3 list-disc">
                        {archProfile.insights.map((ins, idx) => (
                          <li key={idx}>{ins}</li>
                        ))}
                      </ul>
                    </div>

                  </div>
                ) : (
                  <div className="text-center py-12">
                     <p className="text-xs text-muted-foreground">Index repo to retrieve architectural model analysis.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* View 3: STANDARD REPOS FILE TREE DOC EXPLORER */}
        {currentWorkspaceView === 'explorer' && (
          <div className="flex-1 flex overflow-hidden">
            
            {/* Sidebar - File Tree (Resizable) */}
            <div 
              className="shrink-0 border-r bg-card/50 flex flex-col shadow-xl z-20 relative h-full"
              style={{ width: sidebarWidth }}
            >
              <div className="p-4 border-b space-y-4 bg-background/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explorer</h3>
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{project.name}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search files..." 
                    className="pl-9 h-9 bg-background/50 border-primary/10 focus:border-primary/30 transition-all font-medium text-xs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-2">
                  <FileTree 
                    nodes={buildFileTree(project.files)} 
                    onFileSelect={(node) => {
                      setSelectedFile(node);
                      setOriginalCodeText(node.content || '');
                      setActiveCodeText(node.content || '');
                      setCompareReport(null);
                    }} 
                    selectedPath={selectedFile?.path}
                  />
                </div>
              </div>
              
              {/* Resize Handle */}
              <div 
                className={cn(
                  "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors z-30",
                  isResizing && "bg-primary/50"
                )}
                onMouseDown={startResizing}
              />
            </div>

            {/* Main Content Workspace Panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <header className="h-14 border-b flex items-center justify-between px-6 bg-card/30 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileCode className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold truncate">
                      {selectedFile ? selectedFile.name : "Select a file"}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate font-mono">
                      {selectedFile ? selectedFile.path : "No file selected"}
                    </span>
                  </div>
                </div>
                <AnimatePresence mode="wait">
                  {selectedFile && !currentAnalysis && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                    >
                      <Button size="sm" onClick={startAnalysis} disabled={isAnalyzing} className="shadow-lg shadow-primary/20 font-bold active:scale-95 transition-all text-xs">
                        {isAnalyzing ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <BookOpen className="w-4 h-4 mr-2" />
                        )}
                        {isAnalyzing ? "Analyzing..." : "Analyze with Gemini"}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </header>

              <main className="flex-1 overflow-hidden flex relative">
                <div className="flex-1 overflow-auto p-8">
                  {!selectedFile ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-20 h-20 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10"
                      >
                        <FileCode className="w-10 h-10 text-primary/40" />
                      </motion.div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight">Ready to analyze</h2>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                          Select any source file from the explorer to generate intelligent documentation and security insights.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col">
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground max-w-md mb-8">
                          <TabsTrigger value="docs" className="px-6 font-bold text-xs uppercase tracking-wider">Docs</TabsTrigger>
                          <TabsTrigger value="code" className="px-6 font-bold text-xs uppercase tracking-wider">Code</TabsTrigger>
                          <TabsTrigger value="diagram" className="px-6 font-bold text-xs uppercase tracking-wider">Diagram</TabsTrigger>
                          <TabsTrigger value="security" className="px-6 font-bold text-xs uppercase tracking-wider">Security</TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-auto">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={activeTab + (selectedFile?.path || '')}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{ duration: 0.2 }}
                              className="h-full"
                            >
                              <TabsContent value="docs" className="mt-0 h-full focus-visible:outline-none">
                                {isAnalyzing ? (
                                  <div className="space-y-8">
                                    <div className="space-y-3">
                                      <Skeleton className="h-8 w-1/4" />
                                      <Skeleton className="h-24 w-full" />
                                    </div>
                                    <div className="space-y-3">
                                      <Skeleton className="h-8 w-1/3" />
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Skeleton className="h-32 w-full" />
                                        <Skeleton className="h-32 w-full" />
                                      </div>
                                    </div>
                                  </div>
                                ) : currentAnalysis?.analysis ? (
                                  <div className="prose prose-invert max-w-none space-y-12 pb-12">
                                    <section>
                                      <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                          <BookOpen className="w-5 h-5 text-primary" />
                                        </div>
                                        <h2 className="text-2xl font-bold m-0 text-foreground">Summary</h2>
                                      </div>
                                      <p className="text-base text-muted-foreground leading-relaxed font-medium">
                                        {currentAnalysis.analysis.summary}
                                      </p>
                                    </section>

                                    <Separator className="bg-primary/5" />

                                    <section>
                                      <h2 className="text-xl font-bold mb-6 text-foreground font-sans">Functions & Architecture</h2>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {currentAnalysis.analysis.functions.map((fn, i) => (
                                          <Card key={i} className="bg-card/40 border-primary/5 hover:border-primary/20 transition-all">
                                            <CardHeader className="pb-2">
                                              <div className="flex items-center justify-between gap-4">
                                                <code className="text-primary font-bold text-xs bg-primary/5 px-2 py-1 rounded font-mono">{fn.name}</code>
                                                <Badge variant="outline" className="text-[9px] border-primary/20 font-mono">{fn.returns}</Badge>
                                              </div>
                                            </CardHeader>
                                            <CardContent>
                                              <p className="text-xs text-muted-foreground mb-3 font-medium">{fn.description}</p>
                                              <div className="flex flex-wrap gap-1.5">
                                                {fn.parameters.map((p, j) => (
                                                  <span key={j} className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">{p}</span>
                                                ))}
                                              </div>
                                            </CardContent>
                                          </Card>
                                        ))}
                                      </div>
                                    </section>

                                    <Separator className="bg-primary/5" />

                                    <section>
                                      <h2 className="text-xl font-bold mb-6 text-foreground font-sans">Imports & Dependencies</h2>
                                      <div className="flex flex-wrap gap-2">
                                        {currentAnalysis.analysis.dependencies.map((dep, i) => (
                                          <Badge key={i} variant="outline" className="font-mono text-xs">{dep}</Badge>
                                        ))}
                                      </div>
                                    </section>

                                    <Separator className="bg-primary/5" />

                                    <section>
                                      <h2 className="text-xl font-bold mb-6 text-foreground font-sans">Getting Started Guide</h2>
                                      <div className="bg-muted/15 border border-primary/5 p-6 rounded-2xl font-medium text-muted-foreground leading-relaxed text-sm">
                                        <ReactMarkdown>{currentAnalysis.analysis.getting_started}</ReactMarkdown>
                                      </div>
                                    </section>

                                    <Separator className="bg-primary/5" />

                                    <section>
                                      <h2 className="text-xl font-bold mb-4 text-foreground font-sans">AI Recommendations & Improvements</h2>
                                      <ul className="space-y-3 font-medium text-xs leading-relaxed text-muted-foreground">
                                        {currentAnalysis.analysis.improvements.map((imp, idx) => (
                                          <li key={idx} className="flex gap-2 text-muted-foreground">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                            <span>{imp}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </section>

                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-primary/10 rounded-2xl bg-primary/5 text-center">
                                    <p className="text-muted-foreground mb-4 font-semibold text-sm">No analysis has been generated for this file yet.</p>
                                    <Button onClick={startAnalysis} disabled={isAnalyzing} className="font-bold rounded-xl active:scale-95 transition-all shadow-md">
                                      {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookOpen className="w-4 h-4 mr-2" />}
                                      Run Intelligent Docs
                                    </Button>
                                  </div>
                                )}
                              </TabsContent>

                              <TabsContent value="code" className="mt-0 h-full focus-visible:outline-none">
                                <div className="relative h-full rounded-2xl overflow-hidden border border-primary/5 flex flex-col">
                                  <div className="absolute top-3 right-3 z-10">
                                    <Badge variant="secondary" className="bg-background/80 backdrop-blur font-mono">
                                      {selectedFile.name.split('.').pop()?.toUpperCase()}
                                    </Badge>
                                  </div>
                                  
                                  {/* Interactive Read-Write editable textarea supporting compare snapshots */}
                                  <textarea 
                                    className="flex-1 p-6 bg-card/60 font-mono text-sm overflow-auto text-foreground/85 border-none outline-none focus:ring-1 focus:ring-primary/10 select-text resize-none leading-relaxed"
                                    value={activeCodeText}
                                    style={{ scrollbarWidth: 'none' }}
                                    onChange={(e) => setActiveCodeText(e.target.value)}
                                  />

                                  <div className="p-3 bg-card border-t border-primary/5 flex items-center justify-between text-xs select-none shadow">
                                    <span className="text-muted-foreground font-mono">Line: {activeCodeText.split('\n').length} | File Editor mode</span>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="h-8 font-bold border-primary/15 hover:bg-primary/5 hover:text-primary transition-all rounded-lg active:scale-95 text-[10px]"
                                      onClick={() => {
                                        setOriginalCodeText(selectedFile.content || '');
                                        setCurrentWorkspaceView('compare');
                                      }}
                                    >
                                      <GitCompare className="w-3.5 h-3.5 mr-1" /> Compare with original
                                    </Button>
                                  </div>
                                </div>
                              </TabsContent>

                              <TabsContent value="diagram" className="mt-0 h-full focus-visible:outline-none">
                                {currentAnalysis?.analysis?.diagram ? (
                                  <div className="h-full flex flex-col space-y-4">
                                    <div className="flex items-center justify-between select-none">
                                      <h2 className="text-xl font-bold">Architecture Flow Chart</h2>
                                      <Badge variant="outline">Mermaid.js</Badge>
                                    </div>
                                    <div className="flex-1 min-h-0">
                                      <DiagramRenderer code={currentAnalysis.analysis.diagram} />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-primary/10 rounded-2xl bg-primary/5">
                                    <Layout className="w-12 h-12 text-primary/20 mb-4" />
                                    <p className="text-muted-foreground font-semibold">No architecture diagram code generated yet.</p>
                                    <p className="text-xs text-muted-foreground/60 mt-2 text-center max-w-xs">
                                      Diagrams are generated dynamically when clicking <span className="text-primary font-semibold">"Run Analysis"</span> in the Docs tab.
                                    </p>
                                  </div>
                                )}
                              </TabsContent>

                              <TabsContent value="security" className="mt-0 h-full focus-visible:outline-none">
                                {currentAnalysis?.security ? (
                                  <div className="space-y-8 pb-12">
                                    <div className="flex items-center justify-between bg-primary/5 p-4 rounded-2xl border border-primary/10">
                                      <div className="flex items-center gap-3">
                                        <ShieldCheck className="w-6 h-6 text-primary" />
                                        <div>
                                          <h2 className="text-lg font-bold">AI Core Security Scanner</h2>
                                          <p className="text-xs text-muted-foreground">Exposed keys, dependencies, Injection checks</p>
                                        </div>
                                      </div>
                                      <Badge 
                                        className={cn(
                                          "px-4 py-1",
                                          currentAnalysis.security.overallSeverity.toLowerCase() === 'critical' ? "bg-red-600 hover:bg-red-600" : 
                                          currentAnalysis.security.overallSeverity.toLowerCase() === 'high' ? "bg-orange-500 hover:bg-orange-600" : "bg-blue-600"
                                        )}
                                      >
                                        Overall severity: {currentAnalysis.security.overallSeverity}
                                      </Badge>
                                    </div>
                                    <div className="grid gap-4">
                                      {currentAnalysis.security.issues.map((issue, i) => (
                                        <Card key={i} className={cn(
                                          "border-l-4 bg-card/50",
                                          issue.severity === 'critical' ? "border-l-red-500" : 
                                          issue.severity === 'high' ? "border-l-orange-500" : "border-l-blue-500"
                                        )}>
                                          <CardHeader className="py-4">
                                            <div className="flex items-center justify-between">
                                              <CardTitle className="text-base font-bold">{issue.title}</CardTitle>
                                              <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'}>
                                                {issue.severity}
                                              </Badge>
                                            </div>
                                          </CardHeader>
                                          <CardContent className="pb-4 space-y-4">
                                            <p className="text-xs text-muted-foreground leading-relaxed font-semibold">{issue.description}</p>
                                            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/10">
                                              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">AI Recommendation</p>
                                              <p className="text-xs text-foreground/80 font-semibold leading-relaxed">{issue.recommendation}</p>
                                            </div>
                                          </CardContent>
                                        </Card>
                                      ))}
                                      {currentAnalysis.security.issues.length === 0 && (
                                        <div className="p-12 text-center text-xs text-muted-foreground font-medium">
                                          👍 Checked! No vulnerabilities, duplicates, or exposed secrets detected in this target module scope.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-primary/10 rounded-2xl bg-primary/5">
                                    <ShieldCheck className="w-12 h-12 text-primary/20 mb-4" />
                                    <p className="text-muted-foreground font-semibold">No security audit executed yet.</p>
                                    <Button variant="link" onClick={startAnalysis}>Perform Full Analyzer Diagnostics</Button>
                                  </div>
                                )}
                              </TabsContent>
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      </Tabs>
                    </div>
                  )}
                </div>

                {/* Chat Sidebar */}
                {project && showChat && (
                  <motion.div 
                    initial={{ x: chatSidebarWidth, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: chatSidebarWidth, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="shrink-0 border-l bg-card/30 backdrop-blur-sm relative h-full flex flex-col"
                    style={{ width: chatSidebarWidth }}
                  >
                    {/* Resize Handle */}
                    <div 
                      className={cn(
                        "absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors z-20",
                        isResizingChat && "bg-primary/50"
                      )}
                      onMouseDown={() => setIsResizingChat(true)}
                    />
                    <ChatSidebar 
                      codeContext={selectedFile?.content || ""} 
                      onClose={() => setShowChat(false)}
                    />
                  </motion.div>
                )}
              </main>
            </div>
          </div>
        )}

        {/* View 4: SEMANTIC AI SEARCH / RAG WORKSPACE */}
        {currentWorkspaceView === 'search' && (
          <div className="flex-1 flex bg-[#07070d] overflow-hidden">
            
            {/* Input query pane */}
            <div className="flex-1 flex flex-col p-8 md:p-12 overflow-y-auto w-full">
              <div className="max-w-3xl mx-auto w-full space-y-10 pb-16">
                
                <div>
                  <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                    <Search className="w-8 h-8 text-primary" />
                    Semantic AI Search & RAG
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1">Ask context questions like "Where is token auth managed?", or "Locate JWT controllers".</p>
                </div>

                <form onSubmit={handleSemanticSearch} className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                    <Input 
                      placeholder="Ask natural language questions: 'Show auth middleware'..." 
                      className="h-12 bg-card border-primary/10 focus:border-primary pl-12 rounded-xl text-sm font-semibold"
                      value={semanticQuery}
                      onChange={(e) => setSemanticQuery(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={isSearching || !semanticQuery.trim()} className="h-12 px-6 bg-primary font-bold active:scale-95 transition-all text-xs">
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Index + Search"}
                  </Button>
                </form>

                {isSearching ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">Matched Files found ({searchResults.length})</p>
                    <div className="grid gap-4">
                      {searchResults.map((res, sIdx) => (
                        <Card 
                          key={sIdx} 
                          className={cn(
                            "bg-card/45 border-primary/5 hover:border-primary/20 transition-all cursor-pointer",
                            selectedSearchResult?.path === res.path && "border-primary-foreground border"
                          )}
                          onClick={() => setSelectedSearchResult(res)}
                        >
                          <CardHeader className="py-4 pb-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold font-mono text-muted-foreground">{res.path}</span>
                              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-mono text-[10px]">Match: {Math.round(res.score * 100)}%</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pb-4 space-y-3">
                            <p className="text-xs text-muted-foreground/80 font-medium">{res.reason}</p>
                            {res.highlight && (
                              <pre className="p-3 bg-[#0c0c16] rounded-xl text-[11px] font-mono border text-foreground/75 overflow-auto border-primary/5 leading-normal">
                                <code>{res.highlight}</code>
                              </pre>
                            )}
                            <div className="flex justify-end pt-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 rounded-lg text-[9px] font-bold border-primary/15 hover:bg-primary/5 hover:text-primary transition-all active:scale-95"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateToLocalFile(res.path);
                                }}
                              >
                                <Play className="w-3 h-3 mr-1" /> Open Code location
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center rounded-3xl border border-dashed border-primary/5 bg-card/10">
                    <HelpCircle className="w-8 h-8 text-primary/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground font-semibold">Ready. Enter search parameter query in the input pool above to scan.</p>
                  </div>
                )}

              </div>
            </div>

          </div>
        )}

        {/* View 5: VERSION sandbox DIFFERENCES COMPARISON */}
        {currentWorkspaceView === 'compare' && (
          <ScrollArea className="flex-1 bg-[#07070d] p-8 md:p-12 overflow-y-auto">
            <div className="max-w-5xl mx-auto space-y-10 pb-16">
              
              <div className="flex items-center justify-between border-b pb-4 border-primary/5">
                <div>
                  <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                    <GitCompare className="w-8 h-8 text-primary" />
                    Version Comparison Sandbox
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1">Audit edits or code optimizing changes and summarize differences.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Original file state */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">Original Source</span>
                    <Badge variant="secondary" className="text-[9px] font-mono">Reference version</Badge>
                  </div>
                  <textarea 
                    className="w-full h-80 bg-[#0c0c18]/80 p-5 font-mono text-xs rounded-2xl border border-primary/5 leading-normal outline-none focus:ring-1 focus:ring-primary/10 resize-none"
                    value={originalCodeText}
                    onChange={(e) => setOriginalCodeText(e.target.value)}
                    placeholder="Reference versions code snippets go here..."
                  />
                </div>

                {/* Modifying inputs */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">Modified Source</span>
                    <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary">Edits version</Badge>
                  </div>
                  <textarea 
                    className="w-full h-80 bg-[#0c0c18]/80 p-5 font-mono text-xs rounded-2xl border border-primary/5 leading-normal outline-none focus:ring-1 focus:ring-primary/10 resize-none"
                    value={activeCodeText}
                    onChange={(e) => setActiveCodeText(e.target.value)}
                    placeholder="Enter modified version code optimizations here..."
                  />
                </div>

              </div>

              <div className="flex justify-center select-none">
                <Button 
                  disabled={isComparing || !originalCodeText.trim() || !activeCodeText.trim()}
                  onClick={triggerCodeComparison}
                  className="bg-primary hover:bg-primary/95 font-bold rounded-xl active:scale-95 transition-all w-60 h-12 text-xs"
                >
                  {isComparing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <GitCompare className="w-4 h-4 mr-2" />}
                  {isComparing ? "Generating diff..." : "Generate comparison report"}
                </Button>
              </div>

              {isComparing ? (
                <div className="space-y-4">
                  <Skeleton className="h-44 w-full rounded-2xl" />
                </div>
              ) : compareReport ? (
                <Card className="bg-card/45 border-primary/15 animate-fade-in">
                  <CardHeader className="border-b border-primary/5 pb-4">
                    <div className="flex items-center gap-2">
                      <Bot className="w-5 h-5 text-primary animate-pulse" />
                      <CardTitle className="text-base font-bold text-foreground">AI Differences report</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 font-mono">Human Summary</h4>
                      <p className="text-xs font-semibold text-muted-foreground leading-relaxed">{compareReport.summary}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-primary/5">
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 font-mono">Changed modules / additions</h4>
                        <pre className="p-4 bg-[#0c0c16] rounded-xl text-[11px] font-mono leading-relaxed border text-foreground/75 border-primary/5">{compareReport.changedLines}</pre>
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 font-mono font-mono">Architecture shifting</h4>
                        <pre className="p-4 bg-[#0c0c16] rounded-xl text-[11px] font-mono leading-relaxed border text-foreground/75 border-primary/5">{compareReport.architectureShifts}</pre>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-primary/5 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 font-mono">Changes in APIs</h4>
                      <div className="flex flex-wrap gap-2">
                        {compareReport.apiChanges.map((api, idx) => (
                          <Badge key={idx} variant="outline" className="font-mono text-[10px]">{api}</Badge>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-primary/5 p-4 rounded-xl bg-orange-600/10 border border-orange-600/20 text-orange-400">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-orange-500 font-mono mb-1 label">Security vulnerability evaluation</h4>
                      <p className="text-xs font-semibold leading-relaxed">{compareReport.securityImpact}</p>
                    </div>

                  </CardContent>
                </Card>
              ) : null}

            </div>
          </ScrollArea>
        )}

      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/30">
      <nav className="h-16 border-b flex items-center justify-between px-8 bg-background/80 backdrop-blur-xl sticky top-0 z-50 border-primary/5">
        <div 
          className="flex items-center gap-3 cursor-pointer group select-none" 
          onClick={() => { setProject(null); setSelectedFile(null); }}
        >
          <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
            <Layout className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-black text-2xl tracking-tighter">AutoDoc <span className="text-primary">AI</span></span>
        </div>
        <div className="flex items-center gap-6">
          {project && (
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn("text-muted-foreground hover:text-foreground", showChat && "text-primary")}
              onClick={() => setShowChat(!showChat)}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat Sidebar
            </Button>
          )}
          {project && (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold">Workspace Developer</span>
                <button 
                  onClick={handleSignOut} 
                  className="text-[10px] text-muted-foreground hover:text-destructive transition-colors font-bold uppercase"
                  title="Disconnect active project and back to upload stage"
                >
                  Disconnect Project
                </button>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
                W
              </div>
            </div>
          )}
        </div>
      </nav>

      <AnimatePresence mode="wait">
        {renderContent()}
      </AnimatePresence>
    </div>
  );
}

// Simple fallback folder icon component
function FolderIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      width="24" 
      height="24" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="none" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  );
}
