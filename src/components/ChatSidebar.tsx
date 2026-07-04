import React, { useEffect } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Send, Bot, User, Loader2, X, ArrowDown } from 'lucide-react';
import { chatWithCode } from '../services/geminiService';
import { cn } from '../lib/utils';

interface ChatSidebarProps {
  codeContext: string;
  onClose?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ codeContext, onClose }) => {
  const [messages, setMessages] = React.useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "👋 Hello! I'm your AI Code Assistant. I can help you understand this project, explain specific functions, or suggest improvements. What would you like to know?" }
  ]);
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [showScrollButton, setShowScrollButton] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    setShowScrollButton(!isAtBottom);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await chatWithCode(userMsg, codeContext);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error: any) {
      console.error("Chat error:", error);
      let errorMessage = error.message || "Sorry, I encountered an error while processing your request.";
      
      if (errorMessage.includes("Quota Exceeded")) {
        errorMessage = "⚠️ AI Quota Reached: I'm a bit busy right now! Please wait about 60 seconds and try your question again. This is a temporary limit to ensure everyone can use the AI.";
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-full border-l bg-card relative">
      <div className="p-4 border-b flex items-center justify-between bg-background/50">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm tracking-tight">Code Assistant</h3>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea 
          className="h-full p-4" 
          ref={scrollRef}
          viewportProps={{ onScroll: handleScroll }}
        >
          <div className="space-y-6 pb-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12 space-y-2">
                <Bot className="w-10 h-10 mx-auto opacity-20" />
                <p className="text-sm font-medium">Ask questions about your codebase.</p>
                <p className="text-xs opacity-60 italic">"Explain the authentication logic"</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={cn(
                "flex gap-3",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                  msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-secondary/20 text-secondary"
                )}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={cn(
                  "rounded-2xl p-3 text-sm max-w-[85%] leading-relaxed shadow-sm",
                  msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted/50 border border-border/50"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {showScrollButton && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-4 right-8 rounded-full shadow-lg border border-primary/20 animate-bounce"
            onClick={scrollToBottom}
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="p-4 border-t">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <Input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};
