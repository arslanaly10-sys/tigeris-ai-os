/**
 * Agentic case analysis (slice F, FR-34, D-53). A planner breaks "what does this mean for us?" into steps; each
 * specialist reads only the case's authorized records through read-only tools and drafts prose through the model
 * gateway, which may only quote cited values. Where the records are thin, a step reports a gap instead of an answer.
 * Agents never act: they cannot change a case, approve, or contact anything outside TIGERIS.
 */
export const ANALYSIS_AGENTS = [
  {
    key: 'planner',
    name: 'Planner',
    does: 'Breaks the case question into steps and assigns them',
    tools: ['Case record', 'Mandate register'],
  },
  {
    key: 'evidence-retriever',
    name: 'Evidence retriever',
    does: 'Finds the evidence linked to the case and reports how much of it is verified',
    tools: ['Evidence store', 'Source registry'],
  },
  {
    key: 'impact-tracer',
    name: 'Impact tracer',
    does: 'Walks dependency paths from the case origin and lists what is exposed',
    tools: ['Intelligence graph'],
  },
  {
    key: 'scenario-analyst',
    name: 'Scenario analyst',
    does: 'Reads the latest scenario run and explains its range',
    tools: ['Scenario runs (deterministic engine)'],
  },
  {
    key: 'option-drafter',
    name: 'Option drafter',
    does: 'Summarizes the ranked options from the latest scenario run',
    tools: ['Options ranker output'],
  },
  {
    key: 'mandate-checker',
    name: 'Mandate checker',
    does: 'States mandate and authority implications of the leading option',
    tools: ['Mandate checks', 'Authority matrix'],
  },
  {
    key: 'red-team-critic',
    name: 'Red-team critic',
    does: 'Argues against the leading option and names what would change the conclusion',
    tools: ['Scenario sensitivity', 'Evidence status'],
  },
  {
    key: 'memory-scout',
    name: 'Memory scout',
    does: 'Finds earlier decisions in this institution that may serve as precedent',
    tools: ['Institutional memory (same institution)'],
  },
] as const;

export type AnalysisAgentKey = (typeof ANALYSIS_AGENTS)[number]['key'];
export const ANALYSIS_VERSION = 'case-analysis 1.0.0';
