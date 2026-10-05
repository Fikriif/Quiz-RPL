/**
 * Ambient type declarations for @supabase/tracing.
 * This satisfies TypeScript language server when inspecting internal Supabase SDK source files.
 */
declare module '@supabase/tracing' {
  export type TraceContext = Record<string, unknown>;
  export type TracePropagationTarget = string | RegExp;
  export type TraceContextExtractor = () => Record<string, string> | undefined;

  export function parseTraceParent(traceparent?: string | null): TraceContext | null;
  export function shouldPropagateToTarget(
    url: string,
    targets?: (string | RegExp)[]
  ): boolean;
  export function getDefaultPropagationTargets(): (string | RegExp)[];
  export function createTraceContextExtractor(options: {
    propagation: any;
    context: any;
  }): TraceContextExtractor;
}
