# Changelog

## 1.1.0 — Production-like workflow pass

- moved provider processing behind persisted workflow IDs;
- added retry/timeout handling around WhipScribe API calls;
- added disk-backed temporary uploads and cleanup;
- added provider account and recent-job visibility;
- added URL ingestion;
- added playback URL refresh;
- added clip candidate discovery and live clip submission;
- improved decision/promise extraction confidence and deduplication;
- improved decision drift status handling;
- made promise completion matching evidence-based instead of single-word regex matching;
- added schema-versioned atomic local persistence;
- added request IDs, structured logs, security headers and API rate limiting;
- expanded tests and operator documentation.

## 1.0.0

- initial Track 4 DecisionTrace workflow;
- demo organizational memory;
- decision drift;
- Promise Ledger;
- transcript evidence and local search;
- initial WhipScribe API integration path.
