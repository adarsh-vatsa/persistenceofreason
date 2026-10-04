## Problem

A generated access-control policy can compile and read correctly while granting access no one
approved. The hard part is fixing what the requirements mean before any code is written, and
then proving the final policy meets that meaning.

## Method

AutoCedar splits schema and policy authoring into small intent atoms, reviewable claims about
vocabulary and behavior. Atoms that pass mechanical validation and human review become a fixed
target that the model cannot change.^[the model never touches the target] Floors state what access must remain possible, ceilings
state what must never leak, and liveness slices keep approved workflows reachable.

The model proposes a candidate policy and a symbolic verifier checks it against the target.
A signal layer converts every failure into a repair instruction that says whether to broaden,
narrow or restructure the policy. The verifier owns the target, the history and the final
decision.

![AutoCedar overview.](/research/autocedar/overview.png "AutoCedar. Requirements become a reviewed, executable target, and verifier-guided search synthesizes Cedar policies against it.")

![The synthesis sandwich.](/research/autocedar/sandwich.png "The synthesis sandwich. A candidate must stay inside the ceiling, cover every floor and reach each live workflow slice. One verifier call yields a different repair direction for each kind of violation.")

## Results

AutoCedar converges on all 221 tasks of CedarBench, a new benchmark of authorization tasks
paired with executable semantic boundaries.^[221 of 221, every one verified] Direct generation from the same approved schema
still produces policies that pass validation and break floor or ceiling properties. Across
three requirements corpora in healthcare, education and conference management, AutoCedar
turns noisy prose into reviewed schemas, formal checks and a globally verified Cedar policy
store.
