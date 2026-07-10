# Smaller reranker for faster question answering

## Change

Replaced the default `BAAI/bge-reranker-base` reranker with
`cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`. The replacement is a
multilingual MiniLM cross-encoder that supports Chinese and uses the same
Transformers loading API as the existing implementation.

## Runtime configuration

The local frontend now targets a separately started backend on port 8001 so it
can use the new model while the stale port-8000 process remains available.

## Verification

- Downloaded and loaded the new model successfully with one classification
  output label.
- New backend health response reports the new reranker model.
- Warm retrieval for a linear-algebra question decreased from 9.17 seconds to
  2.44 seconds.
- End-to-end warm question answering decreased from 41.71 seconds to 36.88
  seconds; remote answer generation remains the dominant cost.
