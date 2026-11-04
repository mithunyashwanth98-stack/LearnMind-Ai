import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose-clean max-w-none text-slate-200 leading-relaxed font-sans text-xs selection:bg-cyan-500/30">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm md:text-base font-bold text-cyan-300 mt-4 mb-2 pb-1.5 border-b border-cyan-500/20 flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-gradient-to-b from-cyan-400 to-blue-500 rounded-sm inline-block" />
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs md:text-sm font-bold text-white mt-3.5 mb-1.5 flex items-center gap-1.5">
              <span className="w-1 h-2.5 bg-cyan-400 rounded-sm inline-block" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-cyan-200 mt-3 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xs md:text-[13px] leading-relaxed text-slate-200 mb-2.5 last:mb-0">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-cyan-300 bg-cyan-950/30 px-1 py-0.5 rounded border border-cyan-400/20">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-purple-200">
              {children}
            </em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-xs md:text-[13px] text-slate-200 marker:text-cyan-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-xs md:text-[13px] text-slate-200 marker:text-cyan-400 font-medium">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-cyan-400 pl-3 py-1.5 my-2.5 bg-cyan-950/40 text-cyan-200 text-xs rounded-r-lg italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-cyan-500/25">
              <table className="w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-cyan-950/70 border-b border-cyan-500/30 text-cyan-300 font-bold">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-cyan-500/15">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-cyan-500/5 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="p-2.5 font-semibold text-cyan-300 text-[11px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="p-2.5 text-slate-200 text-xs">
              {children}
            </td>
          ),
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-slate-900 border border-cyan-500/30 text-cyan-300 font-mono text-[11px] font-semibold"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const codeText = String(children).replace(/\n$/, '');
            const language = match ? match[1] : 'code';

            return <CodeBlock codeText={codeText} language={language} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

const CodeBlock: React.FC<{ codeText: string; language: string }> = ({ codeText, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-2xl overflow-hidden border border-cyan-500/30 bg-[#090d1a] shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 border-b border-cyan-500/20 text-[10px] font-mono">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-cyan-400 font-bold uppercase tracking-wider ml-1">
            {language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 text-cyan-300 transition-colors cursor-pointer"
          title="Copy Code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-bold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="p-3.5 overflow-x-auto font-mono text-xs text-slate-100 leading-relaxed bg-[#060913]">
        <pre className="!m-0 !p-0">
          <code>{codeText}</code>
        </pre>
      </div>
    </div>
  );
};
