---
title: A notebook, in public
date: 2026-10-01
summary: Why this site exists, and the few rules it follows.
status: settled
math: true
---

Most of my thinking happens in half-finished notes: a question I can't put down, a proof
that almost works, an experiment whose result surprised me. This site is where some of
those notes will end up, roughly as they are.^[The status pill under each title says how
finished an idea is. *Half-baked* means exactly that.]

## The rules

1. **Ideas over announcements.** Papers have their own home; this is for the thinking around them.
2. **Unfinished is fine.** If a note is wrong, I'll say so in a later note rather than quietly editing it.
3. **Plain text, forever.** Every post is a Markdown file. No platform, no lock-in.

## A small test of the machinery

Math renders when it needs to. For instance, the policy-synthesis problem I spend most of my time on can be
written as finding a policy $\pi$ such that for every request $r$,

$$\llbracket \pi \rrbracket(r) = \llbracket \varphi \rrbracket(r)$$

where $\varphi$ is the intended meaning of a natural-language requirement. Getting $\varphi$ right is
often harder than writing $\pi$.^[That observation is more or less the whole motivation behind
[AutoCedar](https://arxiv.org/abs/2607.03656).]

And code looks like this:

```cedar
permit (
  principal in Role::"reviewer",
  action == Action::"read",
  resource in Folder::"drafts"
) unless { resource.confidential };
```

That's it. More soon.
