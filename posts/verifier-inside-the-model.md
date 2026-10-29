---
title: Putting the signature check inside the model
date: 2026-10-29
summary: A language model that verifies digital signatures in its own weights, and acts only on what a signature allows.
status: working through it
tags: security, language models, cryptography, formal verification
draft: false
---

A language model cannot tell who wrote which part of its input. An agent reads its user's request, web pages, emails and tool results as one stream of tokens. An instruction hidden in a web page looks the same as one from the user. This is prompt injection.

Most defenses work outside the model. Software labels each piece of text with its source, and the model is trained to follow instructions only from trusted labels. Whatever handles the text can change a label, and an attacker who knows the weights can search for an input that training did not cover.

## The idea

An agent can change almost anything outside a model much more easily than it can change the model's weights. So the check belongs in the weights.

Each principal, meaning the operator, the user or a tool, signs its text with a private key. The weights hold an exact signature verifier and the principals' public keys. The verifier gives every block of input, meaning one piece of text with one signer, a verdict, either who signed it or unsigned. Hard-wired masks, which I call the gate, act on that verdict, so unsigned text has no path to an action.

> [!claim] Read, not obeyed
> Text that no principal signed can inform the model, but it cannot cause an action that a principal did not sign.

![Diagram of signed and unsigned blocks entering the model, an exact verifier and policy checker, a learned part between two hard masks, and a resource server outside the agent's reach](/figures/verifier-inside-the-model/architecture.svg "Coral parts are compiled into the weights and proved correct. The learned part chooses only among actions the principal signed.")

## A verifier made of weights

Nothing in the verifier is learned. A compiler turns each logic gate of a hash-based signature scheme into a small exact piece of an MLP layer. A checker then proves, from the weight arrays alone, that the network gives the right verdict on every possible input. The proof also covers 16-bit arithmetic, so the verdicts stay exact at the precision models run in.

## Under attack

The tests use a symbolic agent task where a reference interpreter defines the correct action. They use test-size cryptography, so the results test the design and not the cipher. An attacker controls one block of the input, knows every weight, and searches its block with about 20 million model evaluations per setting.

![Bar chart of successful injections out of 300 episodes. Trained baselines reach up to 91 when the attacker's block is read and up to 29 when it is not. Adversarial training reaches 8, or 26 with more budget. The hard-wired gate is 0 on every seed.](/figures/verifier-inside-the-model/attacks.svg "All models get the same exact labels and the same data. Only the gate was never pushed into an illegitimate action.")

Knowing who signed what was not enough. The trained models had exact labels and still failed. They built actions out of parts of different allowed actions, which no legitimate input could produce, and the gate excludes those combinations by construction.

The labels themselves are the weak point once the attacker controls the pipeline. Here the attacker labels its own block as a user instruction.

![Bar chart, out of 500 episodes. Labels plus training took the attacker's action 209 times. The hard-wired gate fed the forged labels took it 283 times. The gate fed the in-model verifier took it 0 times.](/figures/verifier-inside-the-model/forged-labels.svg "Forged labels break every defense that reads them, the gate included.")

The gate fed forged labels did worse than the trained model that has no gate. It trusts its input completely, so its input has to be something an attacker cannot forge, and that is the verdict the weights compute from the tokens.

## Signing the policy

In that first version, a small learned network decided which actions an instruction allowed. On unusual but honest requests it allowed too much in 15.8 percent of episodes.

Now the principal signs the policy too, meaning the list of what the model may read and do. A second compiled circuit turns the signed bytes into the masks, so nothing learned sits between the signatures and the actions. Under the same requests the model made no decision outside the signed policy.

An attacker on a block the model may read can still change its choice. That happened in 130 of 900 attacked episodes, always inside what the principal signed. In 60 the model took another allowed action, and in 70 it did nothing.

The service that carries out the action, a bank for example, checks the signatures again with its own software and refuses stale or replayed sessions. Seven attacks on the harness around the model, including bypassing the model entirely, got no unauthorized action through.

## Real-strength signatures

Everything above used test-size cryptography. The real-strength scheme is LMS with the SHAKE256 hash, a post-quantum scheme that NIST approves. The principal signs one hash over all the blocks of a turn, and the model recomputes that hash from what it sees.

One signature check calls the hash about 1,040 times, but only 46 of those calls wait on each other. The rest run side by side in parallel token positions that share one compiled hash block.^[One block of weights per hash call would need about 1.4 billion weights. The shared block needs 1.9 million.]

![Grid of 46 hash steps across 8 block lanes, 67 chain lanes and 1 main lane, showing which lanes do useful work at each step](/figures/verifier-inside-the-model/lanes.svg "One signature check as a schedule. The longest chain of dependent calls sets the depth.")

The network has 3,479 layers, far deeper than a language model, but it runs once per turn, beside the model. The proof covers every layer. On an H100 it accepted all 128 honest turns and none of 56 tampered ones.

I set the bar before measuring. The check had to cost no more than the host model's own first pass over the same 1,400 tokens, using a 27-billion-parameter model on the same kind of GPU.

![Line chart of milliseconds per turn against turns per batch. The in-model check falls from 188 ms at one turn to 67 ms at 128 turns. The host model's first pass stays near 113 ms.](/figures/verifier-inside-the-model/timing.svg "Batched, the check costs 59 to 67 percent of the host's first pass. One turn alone costs 1.5 times as much.")

Batched, it clears the bar. A single turn does not yet.

## What is missing

The policy, attack and server results come from a symbolic task with test-size cryptography. The real-strength check runs on its own and is not yet joined to the policy checker and masks. It reads signature bytes directly instead of through attention, and it is not yet checked against NIST's test vectors. A single turn is still slower than the host's first pass. None of this runs inside a pretrained language model yet, and that comes next.
