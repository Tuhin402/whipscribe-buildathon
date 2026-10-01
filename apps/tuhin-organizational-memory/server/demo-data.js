export const DEMO_DATA = {
  meetings: [
    {
      id: "demo-meeting-001",
      title: "Engineering Weekly — Decision Review",
      source: "demo",
      date: "2026-09-27",
      duration_seconds: 3180,
      status: "done",
      language: "en",
      summary: "The team reviewed the storage architecture, launch timing, and benchmark work.",
      speakers: ["Maya", "Rahul", "Sarah", "Tuhin"],
      transcript: [
        {
          start: 24.0,
          end: 42.0,
          speaker: "Maya",
          text: "We need to settle the database choice before the next implementation sprint."
        },
        {
          start: 38.0,
          end: 72.0,
          speaker: "Rahul",
          text: "I still prefer PostgreSQL because the relational model keeps the reporting path straightforward."
        },
        {
          start: 68.0,
          end: 108.0,
          speaker: "Tuhin",
          text: "The new event-driven write path is now the requirement. For that reason I think we should use MongoDB."
        },
        {
          start: 108.0,
          end: 136.0,
          speaker: "Sarah",
          text: "I disagree on the operational risk, but I can support MongoDB if we document the migration and run benchmarks first."
        },
        {
          start: 136.0,
          end: 170.0,
          speaker: "Tuhin",
          text: "Let's make the decision explicit: MongoDB for the first launch, with benchmark results recorded before Friday."
        },
        {
          start: 178.0,
          end: 212.0,
          speaker: "Sarah",
          text: "I'll send the benchmark results to the team by Friday morning and include the write-volume test."
        },
        {
          start: 216.0,
          end: 252.0,
          speaker: "Maya",
          text: "Please also record the assumption that we expect more than fifty thousand writes per second during peak traffic."
        },
        {
          start: 276.0,
          end: 304.0,
          speaker: "Rahul",
          text: "I want the PostgreSQL option kept in the document as the fallback if the benchmark does not pass."
        },
        {
          start: 303.0,
          end: 330.0,
          speaker: "Tuhin",
          text: "Open question: what is the minimum benchmark threshold we are willing to accept?"
        }
      ]
    },
    {
      id: "demo-meeting-002",
      title: "Architecture Follow-up",
      source: "demo",
      date: "2026-09-29",
      duration_seconds: 2410,
      status: "done",
      language: "en",
      summary: "Benchmark results caused the database decision to evolve.",
      speakers: ["Maya", "Sarah", "Tuhin"],
      transcript: [
        {
          start: 612.0,
          end: 645.0,
          speaker: "Sarah",
          text: "The benchmark missed our target by a wide margin on the event-heavy write workload."
        },
        {
          start: 645.0,
          end: 680.0,
          speaker: "Tuhin",
          text: "Given that evidence, we should switch the launch database back to PostgreSQL."
        },
        {
          start: 680.0,
          end: 716.0,
          speaker: "Maya",
          text: "Agreed. That supersedes the MongoDB launch decision from the engineering weekly."
        },
        {
          start: 748.0,
          end: 781.0,
          speaker: "Sarah",
          text: "I sent the benchmark report yesterday and added the raw numbers to the architecture document."
        }
      ]
    }
  ],
  decisions: [
    {
      id: "decision-001",
      meetingId: "demo-meeting-001",
      title: "Launch database",
      decision: "MongoDB for the first launch",
      status: "superseded",
      timestampStart: 136,
      timestampEnd: 170,
      speakers: ["Tuhin"],
      rationale: ["Event-driven write path became the primary requirement."],
      assumptions: [">50,000 writes/sec is expected during peak traffic."],
      disagreements: ["Rahul preferred PostgreSQL for reporting simplicity.", "Sarah raised operational-risk concerns."],
      evidence: ["demo-meeting-001#136-170"],
      createdAt: "2026-09-27"
    },
    {
      id: "decision-002",
      meetingId: "demo-meeting-002",
      title: "Launch database — revised",
      decision: "PostgreSQL for the first launch",
      status: "current",
      timestampStart: 645,
      timestampEnd: 680,
      speakers: ["Tuhin", "Maya"],
      rationale: ["Benchmark evidence missed the required write-workload target."],
      assumptions: ["Reporting simplicity is again prioritized after the benchmark failure."],
      disagreements: [],
      evidence: ["demo-meeting-002#612-680"],
      createdAt: "2026-09-29"
    }
  ],
  promises: [
    {
      id: "promise-001",
      meetingId: "demo-meeting-001",
      owner: "Sarah",
      recipient: "Engineering team",
      commitment: "Send benchmark results and write-volume test.",
      dueDate: "2026-09-28",
      timestampStart: 178,
      timestampEnd: 212,
      status: "completed",
      evidence: ["demo-meeting-001#178-212", "demo-meeting-002#748-781"]
    }
  ],
  drift: [
    {
      id: "drift-001",
      previousDecisionId: "decision-001",
      newDecisionId: "decision-002",
      type: "evolved",
      detectedAt: "2026-09-29",
      explanation: "The MongoDB launch decision was superseded after benchmark results missed the target on the event-heavy workload.",
      evidence: ["demo-meeting-002#612-680"]
    }
  ],
  openQuestions: [
    {
      id: "question-001",
      meetingId: "demo-meeting-001",
      question: "What is the minimum benchmark threshold we will accept?",
      timestampStart: 303,
      timestampEnd: 330,
      status: "open",
      evidence: ["demo-meeting-001#303-330"]
    }
  ]
};

export function demoSeed() {
  return structuredClone(DEMO_DATA);
}
