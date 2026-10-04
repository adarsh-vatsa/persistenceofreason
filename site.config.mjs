// Everything about you lives here. Edit freely, then `npm run dev` to preview.
// House style for prose on this site is plain sentences, no colons or semicolons.

export default {
  title: 'Persistence of Reason',
  url: 'https://persistenceofreason.com',
  author: 'Adarsh Vatsa',
  description: 'Adarsh Vatsa. Research and writing on reasoning, learning and proof.',

  affiliation: 'Stevens Institute of Technology',

  // The home page opens like a paper. Plain sentences, no colons or semicolons.
  abstract: [
    'I study reasoning, how it works, where it breaks, and what it takes to make it hold up, in machines and in people. My research pairs language models with formal methods, so that what a model produces can be checked rather than trusted.',
  ],
  // An optional handwritten note in the margin beside the abstract.
  marginNote: '',

  links: [
    { label: 'Email', href: 'mailto:avatsa@stevens.edu', icon: 'mail', text: 'avatsa@stevens.edu' },
    { label: 'Scholar', href: 'https://scholar.google.com/citations?user=OBiz9FQAAAAJ&hl=en', icon: 'scholar', text: 'Google Scholar profile' },
    { label: 'GitHub', href: 'https://github.com/adarsh-vatsa', icon: 'github', text: 'github.com/adarsh-vatsa' },
    { label: 'Feed', href: '/feed.xml', icon: 'rss', text: 'RSS' },
  ],

  interests: ['Language models', 'Formal verification', 'Reinforcement learning', 'Deep learning', 'Mathematics'],

  papers: [
    {
      title: 'RAISE: Reinforcing Access Control Policy Synthesis in LLMs via Symbolic Evaluation',
      authors: 'Yingming Zhou, Adarsh Vatsa, William Eiers',
      venue: 'arXiv preprint',
      year: 2026,
      url: 'https://arxiv.org/abs/2609.33796',
      pdf: 'https://arxiv.org/pdf/2609.33796',
      abstract: 'Translating natural-language access-control requirements into policies requires careful reasoning about permissions, constraints, and exceptions, and even frontier LLMs often produce policies that violate the intended authorization semantics. We construct CedarInstruct, a dataset of 5,800 scenarios across 44 domains with verified target policies, and introduce RAISE, which trains policy synthesizers from formal verification in two stages. Verified supervised fine-tuning is followed by a reinforcement learning stage that learns from verifier signal. With about 5.4K verified scenarios and LoRA fine-tuning, RAISE-OC trains Qwen3.5-9B to surpass much larger zero-shot frontier models in semantic success on held-out scenarios, and training transfers to the independently constructed CedarBench.',
      bibtex: `@article{zhou2026raise,
  title   = {RAISE: Reinforcing Access Control Policy Synthesis in LLMs via Symbolic Evaluation},
  author  = {Zhou, Yingming and Vatsa, Adarsh and Eiers, William},
  journal = {arXiv preprint arXiv:2609.33796},
  year    = {2026}
}`,
    },
    {
      title: 'AutoCedar: An Agentic Framework for Verifier-Guided Access Control Policy Synthesis',
      authors: 'Adarsh Vatsa, Sachi Shome, Yingming Zhou, William Eiers',
      venue: 'arXiv preprint',
      year: 2026,
      url: 'https://arxiv.org/abs/2607.03656',
      pdf: 'https://arxiv.org/pdf/2607.03656',
      abstract: 'Large language models are increasingly used to turn natural-language requirements into code. In access control, that shortcut is dangerous, because a generated policy can compile and read correctly while granting access that no one approved. The difficulty is not only writing policy code. It is fixing what the requirements mean before code is written, and then checking that the final policy actually satisfies them. AutoCedar is an agentic framework that pins down intent first and lets a verifier guide synthesis from there.',
      bibtex: `@article{vatsa2026autocedar,
  title   = {AutoCedar: An Agentic Framework for Verifier-Guided Access Control Policy Synthesis},
  author  = {Vatsa, Adarsh and Shome, Sachi and Zhou, Yingming and Eiers, William},
  journal = {arXiv preprint arXiv:2607.03656},
  year    = {2026}
}`,
    },
    {
      title: 'Neurosymbolic Characterization for Reliable Access Control Policy Analysis',
      authors: 'Adarsh Vatsa, Bethel Hall, William Eiers',
      venue: 'arXiv preprint',
      year: 2025,
      url: 'https://arxiv.org/abs/2510.20692',
      pdf: 'https://arxiv.org/pdf/2510.20692',
      bibtex: `@article{vatsa2025neurosymbolic,
  title   = {Neurosymbolic Characterization for Reliable Access Control Policy Analysis},
  author  = {Vatsa, Adarsh and Hall, Bethel and Eiers, William},
  journal = {arXiv preprint arXiv:2510.20692},
  year    = {2025}
}`,
    },
    {
      title: 'Synthesizing Access Control Policies Using Large Language Models',
      authors: 'Adarsh Vatsa, P. Patel, William Eiers',
      venue: 'NLBSE @ ICSE 2025',
      year: 2025,
      url: 'https://scholar.google.com/citations?view_op=view_citation&hl=en&user=OBiz9FQAAAAJ&citation_for_view=OBiz9FQAAAAJ:u5HHmVD_uO8C',
    },
  ],
};
