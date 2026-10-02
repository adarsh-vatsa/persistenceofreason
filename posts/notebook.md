---
title: A notebook, in public
date: 2026-10-01
summary: Why this site exists, and the few rules it follows.
status: settled
math: true
---

Most of my thinking happens in half-finished notes: a question I can't put down, a proof
that almost works, an experiment whose result surprised me. This site is where some of
those notes will end up, roughly as they are.^[The label under each title says how
finished an idea is. *Half-baked* means exactly that.]

## The rules

1. **Ideas over announcements.** Papers have their own home; this is for the thinking around them.
2. **Unfinished is fine.** If a note is wrong, I'll say so in a later note rather than quietly editing it.
3. **Plain text, forever.** Every post is a Markdown file. No platform, no lock-in.

## A small test of the machinery

Math renders when it needs to. A favorite example of how little it takes to reason well
under uncertainty is Bayes' rule,

$$P(H \mid E) = \frac{P(E \mid H)\,P(H)}{P(E)},$$

which says that how much a piece of evidence $E$ should move you depends on how surprising it
would be if your hypothesis $H$ were false.^[Most arguments that go wrong skip the denominator.]

And code looks like this:

```python
def update(prior, likelihood, evidence):
    return likelihood * prior / evidence
```

That's it. More soon.
