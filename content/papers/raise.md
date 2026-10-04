## Problem

Translating natural-language access requirements into a Cedar policy means reasoning about
permissions, constraints and exceptions at once. Frontier models still write policies that
read well and violate the intended authorization semantics.

## Data

CedarInstruct is the first dataset that supports both training and semantic evaluation for
formally verifiable Cedar synthesis. It holds 5,800 scenarios across 44 domains, plus 1,408
scenarios for a single synthetic organization. Every scenario carries a verified target
policy and an executable verification plan.

![Four-stage construction of CedarInstruct.](/research/raise/cedarinstruct.svg "Four-stage construction of CedarInstruct, from a controlled scenario space to verified, faithfulness-filtered policies.")

## Method

RAISE trains a policy synthesizer from formal verification in two stages. Verified supervised
fine-tuning comes first. A reinforcement learning stage then learns from the verifier's
judgment of the model's own attempts. At inference the model sees only the requirement and
the schema.

Of six RL variants that consume progressively richer verifier signal, one clearly beats
supervised fine-tuning. RAISE-OC turns failed checks and symbolic counterexamples into guided
exploration and learns from the guided samples with an off-context GRPO update.

![Overview of RAISE.](/research/raise/method.svg "RAISE. Verified fine-tuning, then reinforcement learning from verifier signal. RAISE-OC routes groups where every sample fails into verifier-guided exploration.")

## Findings

Fine-tuning works mainly by letting a model express authorization logic it already has.
Untrained models rarely write valid Cedar, yet they often reason correctly when they do.
After fine-tuning, how the verifier's information is used matters more than how much of it
is used.

![Recovered learning signal.](/research/raise/learning-signal.svg "Share of training groups in which every sample fails, before and after verifier-guided exploration. The shaded gap is learning signal that plain GRPO throws away.")

## Results

With about 5,400 verified scenarios and LoRA fine-tuning, RAISE-OC trains Qwen3.5-9B to beat
zero-shot GPT-6 Astra by 13.33 points and Claude Opus 5 by 16.26 points in semantic success on
held-out scenarios. The training transfers to the independently constructed CedarBench.
