---
title: Putting the signature check inside the model
date: 2026-10-29
summary: A language model that verifies digital signatures in its own weights, and acts only on what a signature allows.
status: working through it
tags: security, language models, cryptography, formal verification
draft: false
---

Language models can’t distinguish which text they should respect. When we feed them input, they read it without regard to its origin. This allows a hacker to trick a model by injecting their malicious commands into an input provided by someone else.

Defenses like the ones we test below don’t reliably stop these attacks. They depend on labels that software outside the model attaches, and on training that an attacker can search around. An adversary with knowledge of those systems and of the model’s weights can find inputs that get past these defenses.

## The idea

Agents can change nearly everything outside a model’s weights. Instead of trying to enforce rules outside a model, let’s put them inside the weights, where an agent can’t easily reach them.

Every principal in the system (operators, users and tools) holds a private key and signs the text it sends. We trust signed text more than any other input, and only signed text can ask for an action.

Here, the principals’ public keys, and a verifier built exactly into the weights, make it hard to create fake instructions. Hard-wired gates enforce policies. If any unsigned text enters the model, it can be read, but it can’t cause an action.

> [!claim] Read, not follow
> Read anything, but take no action that a principal did not sign.

When signed and unsigned text enter the model, there are two gates. The first gate decides which blocks of text the model may read, while the second gate decides which actions it may take after reading them.

![Diagram of signed and unsigned blocks entering the model, an exact verifier and policy checker, a learned part between two hard masks, and a resource server outside the agent's reach](/figures/verifier-inside-the-model/architecture.svg "Coral parts are compiled into the weights and proved correct. Blue is the only learned part.")

The diagram above shows the two gates, an exact verifier that takes each input and returns which principal signed it, or that nobody did, and a learner that operates between the two gates.

The coral parts are compiled into the model’s weights. An attacker can’t change them through the input, and re-running the proof catches any edit to the weights that changes what they compute.

The verifier lives in the weights and is not learned. We prove it correct automatically.

## A verifier built just from weights, verified automatically

The verifier contains no learned parameters—all of it is compiled. A compiler turns each logic gate of the signature scheme into a small exact piece of a neural-network layer. Our checker proves, from the weight arrays alone, that the network gives the right verdict on every possible input—every bit, at every layer. This means rounding can never change a verdict.

The proof covers 16-bit arithmetic too, so behavior stays exact at the precision models actually run in.

## How it works under attack

Our experiments used a symbolic task and a reference interpreter to define the correct behavior. An attacker controlled one input block and knew all the weights. To see the effect of adding the gates, we ran about 20 million model evaluations per setting in search of adversarial inputs.

The chart below compares successful attacks out of 300 episodes, with and without the gate.

![Bar chart of successful injections out of 300 episodes. Trained baselines reach up to 91 when the attacker's block is read and up to 29 when it is not. Adversarial training reaches 8, or 26 with more budget. The hard-wired gate is 0 on every seed.](/figures/verifier-inside-the-model/attacks.svg "All models get the same exact labels and the same data. Only the gate was never pushed into an illegitimate action.")

Without the gate, attacks succeed in up to 91 of 300 episodes, and even adversarial training lets some through.

Every trained baseline let some injections through. With the gate, no attack produced an action that the signed instruction did not allow, on any seed.

## Our gate keeps out malicious attacks

We give every model the same data, including the same exact labels saying which principal signed each block.

We train all of them on this same distribution. Under attack, the trained models without a gate still fail to separate legitimate instructions from injections.

To beat these defenses, an adversary needs more than access to data—they need inputs that the learned model treats as legitimate.

The attacks combine fragments of allowed actions into actions that no legitimate input would produce. With the gate this is impossible, because the gate blocks every action a principal did not authorize.

## Labels become dangerous if we trust them after the fact

Now suppose the attacker also controls the pipeline, so it can forge labels. It labels its own block as a valid user instruction.

Because the attacker controls the labels, a trained model can’t tell the difference. It took the attacker’s action in 209 of 500 episodes.

## Our gate doesn’t depend on what the model learned

The masks don’t depend on the learned weights, so no amount of training or fine-tuning of the learned part can open them. The model can’t take an action outside what was signed.

Even when the gate stops an attack, an attacker can still steer the model toward a different authorized action. The gate limits an attacker to what was signed, and choices inside that limit can still be pushed around.

## Insecure gates accept forged labels as valid

A gate fed by labels from outside the model has exactly this weakness.

This version fails to stop the attack, because nothing in a label shows whether it was forged. It took the attacker’s action in 283 of 500 episodes, more often than the trained model without a gate.

## The solution we use

To stop such an attack, we feed the gate the verdicts the weights compute from the signatures themselves. With the in-model verifier, the attacker’s action got through 0 of 500 times.

![Bar chart, out of 500 episodes. Labels plus training took the attacker's action 209 times. The hard-wired gate fed the forged labels took it 283 times. The gate fed the in-model verifier took it 0 times.](/figures/verifier-inside-the-model/forged-labels.svg "Forged labels break every defense that reads them, the gate included.")

One limitation remains. In our first version, a small learned network decided which actions an instruction allowed, and on unusual but honest requests it allowed too much in 15.8 percent of episodes. So we extend the approach with policies that principals sign.

## Signatures of the policy

The gate’s learned part made it vulnerable even without an attacker, so we have the principal sign the policy, meaning the list of what the model may read and do.

Here, a second compiled circuit reads the signed policy, and the gates allow only the actions it authorizes. Under the same unusual requests, the model made no decision outside the signed policy.

The model is still open to attacks on a block it is allowed to read. They succeeded in 130 of 900 attacked episodes, always inside what the principal signed. In 60 the model took another allowed action, and in 70 it did nothing.

To shrink that room, a principal can sign a tighter policy. The remaining question is cost. Everything so far used test-size cryptography, and real signatures cost far more to check.

We now implement a real-strength signature scheme and show how we compile it into our model.

## Real-strength

To make the system practical, the new implementation uses a standard post-quantum signature scheme that NIST approves.

We use the LMS scheme with the SHAKE256 hash. Its signatures are 2,508 bytes, and most of its hashing can run in parallel. The principal signs one hash over all the blocks of a turn, and the model recomputes that hash from what it sees.

Each hash costs many network layers, so we run the independent hash calls of one signature check side by side.

By reusing one compiled block of weights for every hash call, we keep the network at 1.9 million weights instead of about 1.4 billion.

For one signature check, the hash is called about 1,040 times, but only 46 of those calls depend on each other. The rest run side by side across 76 token positions, so the check takes 46 steps, not 1,040.

![Grid of 46 hash steps across 8 block lanes, 67 chain lanes and 1 main lane, showing which lanes do useful work at each step](/figures/verifier-inside-the-model/lanes.svg "One signature check as a schedule. The longest chain of dependent calls sets the depth.")

The compiled network has 3,479 layers—far deeper than a language model, but it runs once per turn, beside the model.

To make sure the compiled network is right, we prove that it computes the LMS verifier exactly on every possible input.

## Proof of correctness

The proof does not depend on the attacks we tried. It covers every input, so no input can make the network’s verdict differ from the real verifier’s.

On an H100 it accepted all 128 honest turns and rejected all 56 tampered ones.

## Performance

The proof settles correctness, but not cost. How fast is it?

We set the bar before measuring. The check should cost no more than the host model’s own first pass over the same 1,400 tokens, using a 27-billion-parameter model on the same kind of GPU.

Batched, it clears the bar. With 8 or more turns per batch, the check costs 59 to 67 percent of the host’s first pass.

![Line chart of milliseconds per turn against turns per batch. The in-model check falls from 188 ms at one turn to 67 ms at 128 turns. The host model's first pass stays near 113 ms.](/figures/verifier-inside-the-model/timing.svg "Milliseconds per turn on one H100. Batched, the check costs less than the host's first pass.")

The speed comes from batching. Many turns run through the same layers at once, so the fixed cost of each layer is shared. The code is plain PyTorch, with no custom GPU kernels yet.

However, for a single turn, the check still takes 1.5 times as long as the host’s first pass, because each of its 3,479 layers runs as a few small GPU calls.

Overall, the check is exact, proved, and cheaper than the host’s first pass when turns come in batches. A single turn still needs work.

## Final note

So far, the gate and policy results come from a symbolic task with test-size cryptography. The real-strength check runs on its own and is not yet joined to the gates. None of this runs inside a pretrained language model yet, and that comes next.
