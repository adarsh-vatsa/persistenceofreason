## Problem

Administrators rarely know whether a cloud policy permits exactly what they intend. Language
models explain policies fluently, yet they predict individual access decisions with only 59 to
68 percent accuracy, and a policy rebuilt from a model's own explanation is often not
equivalent to the original. The verification gap persists no matter who wrote the policy.
This is the Verifiable Synthesis Paradox.

![Direct LLM analysis versus PolicySummarizer.](/research/policysummarizer/overview.png "Reviewing a policy change. Direct LLM analysis versus PolicySummarizer's characterization of exactly which requests changed.")

## Method

PolicySummarizer encodes a policy as constraints, compiles them into a finite automaton and
extracts a regular expression for every request the policy allows. A language model rewrites
that expression into a short, readable form. Model counting then measures how faithful the
rewrite is, and any rewrite below a user-set threshold is replaced by the formally derived
one. The same machinery characterizes the difference between two versions of a policy.

![The PolicySummarizer pipeline.](/research/policysummarizer/pipeline.png "From policy to automaton to reference expression, followed by LLM simplification checked by model counting.")

## Results

On 546 AWS, 100 Azure and 100 Google Cloud policies, PolicySummarizer reaches a mean
similarity of 0.93 and a 2.7-fold improvement over an SMT-based baseline. In a study with 41
participants, accuracy on the hardest change-review task rose from 39 to 93 percent, with lower
reported mental demand. The tool is open source.

![Similarity by provider and method.](/research/policysummarizer/similarity.png "Similarity between generated summaries and the formally derived reference, by cloud provider and summarization method.")
